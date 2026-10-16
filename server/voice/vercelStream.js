import { createServer } from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { VoiceCore } from './core.js'
import { VoiceStore } from './store.js'
import { createOpenAIProvider } from './provider.js'
import { createVoiceService } from './service.js'
import { VoiceError, readBody } from './protocol.js'

const lifetimeMs = 290000 // Close before the Vercel function's 300-second limit.
const digest = value => createHash('sha256').update(value).digest('hex')

export function hasStreamStorage(env = process.env) {
  return !!((env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL) &&
    (env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN))
}

// Only short-lived credentials and connection leases are shared. Audio and
// conversation history stay on the socket's instance and disappear on close.
export function createStreamTickets(env = process.env, fetchImpl = fetch) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN
  if (!hasStreamStorage(env) || !url.startsWith('https://')) {
    throw new VoiceError('generation_failed', 'Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for Vercel WebSockets.', 503)
  }
  async function command(args) {
    try {
      const response = await fetchImpl(url, { method: 'POST', headers: {
        Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'
      }, body: JSON.stringify(args), signal: AbortSignal.timeout(5000), redirect: 'error' })
      const body = await response.json()
      if (!response.ok || body.error) throw new Error('Redis command failed')
      return body.result
    } catch {
      throw new VoiceError('generation_failed', 'WebSocket credential storage is unavailable.', 503, true)
    }
  }
  const ticketKey = credential => `voice:ws:ticket:${digest(credential)}`
  const deviceKey = device => digest(`${device.tenant_id}:${device.device_id}`)
  return {
    async issue(credential, ticket) {
      const count = await command(['EVAL', `
        local count = redis.call('INCR', KEYS[1])
        if count == 1 then redis.call('EXPIRE', KEYS[1], 60) end
        if count > 4 then return 0 end
        return redis.call('SET', KEYS[2], ARGV[1], 'EX', 60, 'NX')
      `, 2, `voice:ws:issue:${deviceKey(ticket)}`, ticketKey(credential), JSON.stringify(ticket)])
      if (count !== 'OK') throw new VoiceError('rate_limited', 'Maximum four new WebSocket sessions per minute.', 429, true)
    },
    async consume(credential) {
      // GETDEL makes the credential single-use across all function instances.
      const raw = await command(['GETDEL', ticketKey(credential)])
      return raw ? JSON.parse(raw) : null
    },
    async claim(ticket, credential) {
      const now = Date.now()
      const result = await command(['EVAL', `
        redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
        if redis.call('ZCARD', KEYS[1]) >= 2 then return 0 end
        redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
        redis.call('EXPIRE', KEYS[1], 300)
        return 1
      `, 1, `voice:ws:connections:${deviceKey(ticket)}`, now, now + lifetimeMs, digest(credential)])
      if (result !== 1) throw new VoiceError('rate_limited', 'Maximum two WebSocket connections per device.', 429, true)
    },
    release(ticket, credential) {
      return command(['ZREM', `voice:ws:connections:${deviceKey(ticket)}`, digest(credential)])
    }
  }
}

export function streamOrigins(env = process.env) {
  return [...(env.FRONTEND_ORIGIN || '').split(',').map(origin => origin.trim()),
    'https://ai-buddy-two-iota.vercel.app',
    ...[env.VERCEL_URL, env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean).map(host => `https://${host}`)]
}

export async function createVercelWebSocketSession(req, device, devices, env = process.env, tickets = createStreamTickets(env)) {
  if (!env.OPENAI_API_KEY) throw new VoiceError('generation_failed', 'Configure OPENAI_API_KEY on Vercel.', 503)
  const body = await readBody(req)
  if (body.session_id) throw new VoiceError('session_expired', 'Vercel WebSockets start a new conversation on reconnect. Omit session_id.', 409, true)
  const core = new VoiceCore({ store: new VoiceStore(), devices })
  const ctx = core.context(device, body)
  const host = env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL
  const websocketUrl = env.VOICE_PUBLIC_WS_URL || (host && `wss://${host}/api/voice/stream`)
  if (!websocketUrl?.startsWith('wss://')) throw new VoiceError('generation_failed', 'Configure VOICE_PUBLIC_WS_URL=wss://YOUR_BACKEND/api/voice/stream.', 503)
  const credential = randomBytes(32).toString('base64url'), expires_at = Date.now() + 60000
  await tickets.issue(credential, {
    tenant_id: device.tenant_id, device_id: device.device_id, token_sha256: device.token_sha256,
    body: { device_id: device.device_id, profile_id: ctx.profile_id, character_id: ctx.character.character_id,
      session_id: ctx.session.session_id, language: ctx.language, speed: ctx.speed },
    session: ctx.session, expires_at
  })
  return { mode: 'vercel-websocket', session_id: ctx.session.session_id, websocket_url: websocketUrl,
    session_credential: credential, expires_at, websocket_subprotocols: ['voice.v1', `ticket.${credential}`],
    session_persistence: 'connection', reconnect_supported: false, connection_max_duration_ms: lifetimeMs,
    idempotency_scope: 'connection', ...core.contract() }
}

export function createVercelStreamServer(env = process.env, { tickets, provider } = {}) {
  const active = new Set()
  const server = createServer((_req, res) => {
    res.writeHead(426, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Upgrade: 'websocket' })
    res.end(JSON.stringify({ status: 'error', error: { code: 'upgrade_required', message: 'Connect using WebSocket with a session credential.', recoverable: false } }))
  })
  server.on('upgrade', async (req, socket, head) => {
    socket.on('error', () => {})
    let inner, ticket, credential, storage, claimed = false
    try {
      const path = new URL(req.url, 'http://localhost').pathname
      const protocols = (req.headers['sec-websocket-protocol'] || '').split(',').map(value => value.trim())
      credential = protocols.find(value => value.startsWith('ticket.'))?.slice(7)
      if (path !== '/api/voice/stream' || !protocols.includes('voice.v1') || !/^[A-Za-z0-9_-]{43}$/.test(credential || '') ||
        (req.headers.origin && !streamOrigins(env).includes(req.headers.origin))) {
        throw new VoiceError('unauthorized_device', 'Invalid WebSocket handshake.', 401)
      }
      storage = tickets || createStreamTickets(env)
      ticket = await storage.consume(credential)
      if (!ticket || ticket.expires_at <= Date.now()) throw new VoiceError('unauthorized_device', 'Credential expired or already used.', 401)
      const devices = JSON.parse(env.VOICE_DEVICES || '[]')
      const device = devices.find(item => !item.revoked && item.device_id === ticket.device_id &&
        item.tenant_id === ticket.tenant_id && item.token_sha256 === ticket.token_sha256)
      if (!device) throw new VoiceError('unauthorized_device', 'Device credential is unknown or revoked.', 401)
      // Recheck the current identity allowlists before accepting the connection.
      const store = new VoiceStore()
      store.data.sessions[ticket.session.session_id] = ticket.session
      const core = new VoiceCore({ store, devices, provider: provider || createOpenAIProvider(env) })
      core.context(device, ticket.body)
      await storage.claim(ticket, credential)
      claimed = true
      if (socket.destroyed) throw new Error('Client disconnected')
      const localTicket = { device, deviceKey: `${device.tenant_id}:${device.device_id}`, body: ticket.body, expires_at: ticket.expires_at }
      inner = createVoiceService({ core, devices, allowedOrigins: streamOrigins(env), initialTickets: [[credential, localTicket]] })
      active.add(inner)
      const timer = setTimeout(() => socket.destroy(), lifetimeMs)
      timer.unref()
      socket.once('close', () => {
        clearTimeout(timer); active.delete(inner); inner.emit('close')
        storage.release(ticket, credential).catch(() => {})
      })
      // Reuse the tested PCM streaming protocol without routing through HTTP proxy functions.
      req.url = '/v1/voice/stream'
      inner.emit('upgrade', req, socket, head)
    } catch (error) {
      if (claimed) await storage.release(ticket, credential).catch(() => {})
      if (inner) { active.delete(inner); inner.emit('close') }
      const status = error instanceof VoiceError ? error.status : 503
      socket.end(`HTTP/1.1 ${status} ${status === 401 ? 'Unauthorized' : 'Service Unavailable'}\r\nConnection: close\r\n\r\n`)
    }
  })
  server.on('close', () => { for (const inner of active) inner.emit('close'); active.clear() })
  return server
}
