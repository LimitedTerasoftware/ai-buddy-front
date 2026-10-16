import { createServer } from 'node:http'
import { randomBytes, randomUUID } from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'
import { DEFAULT_CHARACTER, PERSONALITIES, SKILLS } from './core.js'
import { VoiceError, authenticate, verifyToken, errorBody, readBody, identifier, decodeAudio,
  pcmToWav, MAX_AUDIO_BYTES } from './protocol.js'

export function createVoiceService({ core, devices, admins = [], websocketUrl, allowedOrigins = [], initialTickets = [] }) {
  const tickets = new Map(initialTickets), connected = new Map(), sockets = new Set()
  const store = core.store
  function send(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(data))
  }
  function touch(device) {
    store.data.devices[`${device.tenant_id}:${device.device_id}`] = { tenant_id: device.tenant_id,
      device_id: device.device_id, last_seen: Date.now() }
  }
  function adminIdentity(req) {
    const token = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1]
    const admin = admins.find(item => !item.revoked && verifyToken(token, item.token_sha256))
    if (!admin) throw new VoiceError('unauthorized_device', 'Admin authentication is required.', 401)
    return admin
  }
  async function adminRoute(req, res, path) {
    const tenant = adminIdentity(req).tenant_id
    if (req.method === 'GET' && path === '/api/voice/admin') {
      const characters = Object.entries(store.data.characters).filter(([key]) => key.startsWith(`${tenant}:`)).map(([, value]) => value)
      if (!characters.some(character => character.character_id === 'buddy')) characters.unshift(DEFAULT_CHARACTER)
      const deviceList = devices.filter(device => device.tenant_id === tenant).map(device => ({
        device_id: device.device_id, profile_ids: device.profile_ids, character_ids: device.character_ids, revoked: !!device.revoked,
        ...store.data.devices[`${tenant}:${device.device_id}`], connections: connected.get(`${tenant}:${device.device_id}`) || 0
      }))
      return send(res, 200, { characters, personalities: Object.keys(PERSONALITIES), skills: Object.keys(SKILLS),
        devices: deviceList, turns: store.data.turns.filter(turn => turn.tenant_id === tenant).slice(-50) })
    }
    const body = await readBody(req)
    if (req.method === 'PUT' && path === '/api/voice/admin/character') {
      const character_id = identifier(body.character_id, 'character_id')
      if (!Object.hasOwn(PERSONALITIES, body.personality) || !Array.isArray(body.enabled_skills) ||
          body.enabled_skills.some(id => !Object.hasOwn(SKILLS, id))) throw new VoiceError('invalid_metadata', 'Invalid personality or skill.')
      if (typeof body.instructions !== 'string' || !body.instructions.trim() || body.instructions.length > 6000 ||
          typeof body.display_name !== 'string' || !body.display_name.trim() || body.display_name.length > 100 ||
          !/^[a-z]{2}$/.test(body.language || '') ||
          !['alloy','ash','ballad','coral','echo','fable','onyx','nova','sage','shimmer','verse','marin','cedar'].includes(body.voice)) {
        throw new VoiceError('invalid_metadata', 'Supply a display name, instructions, supported voice and two-letter language.')
      }
      const key = `${tenant}:${character_id}`
      store.data.characters[key] = { character_id, display_name: body.display_name, instructions: body.instructions,
        voice: body.voice, language: body.language, personality: body.personality,
        enabled_skills: [...new Set(body.enabled_skills)], safety_profile: 'child', version: (store.data.characters[key]?.version || 0) + 1 }
      store.save(); return send(res, 200, store.data.characters[key])
    }
    if (path === '/api/voice/admin/memory') {
      const profile = identifier(body.profile_id, 'profile_id')
      if (!devices.some(device => device.tenant_id === tenant && device.profile_ids.includes(profile))) {
        throw new VoiceError('invalid_metadata', 'Profile is not assigned to this account.', 404)
      }
      const key = `${tenant}:${profile}`, list = store.data.memories[key] || []
      if (req.method === 'POST') return send(res, 200, { memories: list })
      if (req.method === 'PUT') {
        if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 500) throw new VoiceError('invalid_metadata', 'Memory must contain 1–500 characters.')
        if (body.consent !== true) throw new VoiceError('invalid_metadata', 'Explicit parent/admin consent is required to save memory.')
        const text = body.text.trim()
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(
          new VoiceError('upstream_timeout', 'Memory safety check timed out.', 504, true)), 15000)
        let safe
        try { safe = await core.provider.safe(text, controller.signal); controller.signal.throwIfAborted() }
        finally { clearTimeout(timer) }
        if (!safe || /\b(password|address|phone|email|full name)\b|@|\b\d{7,}\b/i.test(text)) {
          throw new VoiceError('invalid_metadata', 'Save only safe preferences, without identifying information.')
        }
        const id = body.id ? identifier(body.id, 'id') : randomUUID()
        if (body.id && !list.some(memory => memory.id === id)) throw new VoiceError('invalid_metadata', 'Memory was not found.', 404)
        const memory = { id, text, updated_at: Date.now() }
        store.data.memories[key] = [...list.filter(item => item.id !== id), memory].slice(-50)
        store.save(); return send(res, 200, { memory })
      }
      if (req.method === 'DELETE') {
        for (const [id, session] of Object.entries(store.data.sessions)) {
          if (session.tenant_id === tenant && session.profile_id === profile && core.locks.has(id)) {
            throw new VoiceError('session_busy', 'Wait for active turns to finish before forgetting.', 409, true)
          }
        }
        store.data.memories[key] = body.id ? list.filter(item => item.id !== identifier(body.id, 'id')) : []
        for (const [id, session] of Object.entries(store.data.sessions)) if (session.tenant_id === tenant && session.profile_id === profile) delete store.data.sessions[id]
        for (const [id, request] of Object.entries(store.data.requests)) {
          if (request.tenant_id === tenant && request.profile_id === profile) { delete store.data.requests[id]; core.audioCache.delete(id) }
        }
        store.data.turns = store.data.turns.filter(turn => turn.tenant_id !== tenant || turn.profile_id !== profile)
        store.save(); return send(res, 200, { status: 'forgotten' })
      }
    }
    throw new VoiceError('not_found', 'Endpoint was not found.', 404)
  }
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname, origin = req.headers.origin
    if (origin && !allowedOrigins.includes(origin)) return send(res, 403, errorBody(new VoiceError('unauthorized_device', 'Origin is not allowed.', 403)))
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin') }
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key')
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, DELETE, OPTIONS')
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
    let requestId
    try {
      if (path === '/health' && req.method === 'GET') return send(res, 200, { status: 'ok', protocol_version: '1' })
      if (path.startsWith('/api/voice/admin')) return await adminRoute(req, res, path)
      if (!['/api/voice/push-to-talk', '/v1/voice/ptt', '/api/voice/websocket'].includes(path)) throw new VoiceError('not_found', 'Endpoint was not found.', 404)
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); throw new VoiceError('method_not_allowed', 'Use POST.', 405) }
      const device = authenticate(req.headers, devices), body = await readBody(req)
      if (req.headers['idempotency-key']) {
        if (body.request_id && body.request_id !== req.headers['idempotency-key']) throw new VoiceError('idempotency_conflict', 'Header and request IDs do not match.', 409)
        body.request_id = req.headers['idempotency-key']
      }
      requestId = body.request_id
      touch(device)
      if (path === '/api/voice/websocket') {
        if (!websocketUrl) throw new VoiceError('generation_failed', 'Public WebSocket URL is not configured.', 503, true)
        const deviceKey = `${device.tenant_id}:${device.device_id}`
        if ([...tickets.values()].filter(ticket => ticket.deviceKey === deviceKey).length >= 4) throw new VoiceError('rate_limited', 'Too many pending connections.', 429, true)
        const ctx = core.context(device, body)
        const credential = randomBytes(32).toString('base64url'), expires_at = Date.now() + 60000
        tickets.set(credential, { device, deviceKey, body: { device_id: device.device_id, profile_id: ctx.profile_id,
          character_id: ctx.character.character_id, session_id: ctx.session.session_id, language: ctx.language, speed: ctx.speed }, expires_at })
        return send(res, 200, { mode: 'websocket', session_id: ctx.session.session_id, websocket_url: websocketUrl,
          session_credential: credential, expires_at, websocket_subprotocols: ['voice.v1', `ticket.${credential}`], ...core.contract() })
      }
      if (!body.audio && !body.audio_base64) throw new VoiceError('invalid_audio', 'Upload audio with device_id, profile_id, character_id and request_id. Instructions alone do not submit an utterance.')
      const audio = Buffer.isBuffer(body.audio) ? body.audio : decodeAudio(body.audio_base64)
      const controller = new AbortController()
      const disconnect = () => { if (!res.writableEnded) controller.abort(new VoiceError('response_cancelled', 'Client disconnected.', 409, true)) }
      res.on('close', disconnect)
      try { send(res, 200, await core.turn(device, body, audio, { signal: controller.signal })) }
      finally { res.off('close', disconnect) }
    } catch (error) {
      if (!res.headersSent && !res.destroyed) send(res, error instanceof VoiceError ? error.status : 500, errorBody(error, requestId))
    }
  })
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8192, handleProtocols: protocols => protocols.has('voice.v1') ? 'voice.v1' : false })
  server.requestTimeout = 30000
  server.headersTimeout = 15000
  server.on('upgrade', (req, socket, head) => {
    const path = new URL(req.url, 'http://localhost').pathname
    const protocols = (req.headers['sec-websocket-protocol'] || '').split(',').map(item => item.trim())
    const credential = protocols.find(protocol => protocol.startsWith('ticket.'))?.slice(7), ticket = tickets.get(credential)
    if (path !== '/v1/voice/stream' || !protocols.includes('voice.v1') || !ticket || ticket.expires_at <= Date.now() || ticket.device.revoked ||
        (req.headers.origin && !allowedOrigins.includes(req.headers.origin)) || (connected.get(ticket.deviceKey) || 0) >= 2) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return
    }
    tickets.delete(credential)
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, ticket))
  })
  wss.on('connection', (ws, ticket) => {
    sockets.add(ws); connected.set(ticket.deviceKey, (connected.get(ticket.deviceKey) || 0) + 1)
    let ready = false, audio = [], bytes = 0, sequence = 0, lastSeen = Date.now(), turnStart = 0, active = null, alive = true
    const expiresAt = Date.now() + 900000
    const emit = event => {
      if (ws.readyState !== WebSocket.OPEN) throw new VoiceError('response_cancelled', 'Connection closed.', 409, true)
      if (ws.bufferedAmount > 512000) throw new VoiceError('slow_consumer', 'Playback buffer is full. Restart the turn.', 409, true)
      return new Promise((resolve, reject) => ws.send(JSON.stringify(event), error => error ? reject(error) : resolve()))
    }
    const reset = () => { audio = []; bytes = 0; sequence = 0; turnStart = 0 }
    const report = (error, request_id) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'error', ...errorBody(error, request_id) }))
    }
    ws.on('pong', () => { alive = true; touch(ticket.device) })
    ws.on('message', async (data, binary) => {
      lastSeen = Date.now(); touch(ticket.device)
      let event
      try {
        if (ticket.device.revoked) { ws.close(1008, 'Device revoked'); return }
        if (binary) throw new VoiceError('unsupported_format', 'Protocol v1 uses JSON with base64 PCM audio.')
        try { event = JSON.parse(data.toString()) } catch { throw new VoiceError('invalid_metadata', 'Malformed event JSON.') }
        if (!event || typeof event !== 'object') throw new VoiceError('invalid_metadata', 'Invalid event.')
        if (event.type === 'ping') { await emit({ type: 'pong' }); return }
        if (event.type === 'session.start') {
          if (ready) throw new VoiceError('invalid_metadata', 'Session was already started.')
          if (event.protocol_version !== '1') throw new VoiceError('unsupported_protocol', 'Use protocol version 1.')
          for (const field of ['device_id', 'profile_id', 'character_id', 'session_id', 'language']) {
            if (event[field] !== ticket.body[field]) throw new VoiceError('unauthorized_device', 'Session metadata must match the connection credential.', 403)
          }
          const contract = core.contract()
          for (const side of ['input_audio', 'output_audio']) {
            if (!event[side] || Object.entries(contract[side]).some(([key, value]) => event[side][key] !== value)) {
              throw new VoiceError('unsupported_format', 'Audio settings must match the negotiated contract.')
            }
          }
          core.context(ticket.device, ticket.body)
          ready = true
          await emit({ type: 'session.ready', session_id: ticket.body.session_id, connection_expires_at: expiresAt, ...contract }); return
        }
        if (!ready) throw new VoiceError('session_not_ready', 'Send session.start first.', 409, true)
        if (event.type === 'response.cancel') {
          active?.abort(new VoiceError('response_cancelled', 'Response cancelled.', 409, true)); reset(); return
        }
        if (active) throw new VoiceError('session_busy', 'Wait for response.completed or cancel the current response.', 409, true)
        if (event.type === 'audio.input') {
          if (!Number.isInteger(event.sequence) || event.sequence !== sequence) throw new VoiceError('invalid_sequence', 'Audio sequence must start at zero and increase by one.', 409, true)
          const chunk = decodeAudio(event.data, 3200)
          if (chunk.length < 640 || chunk.length % 2) throw new VoiceError('invalid_audio', 'Each chunk must contain 20–100 ms of PCM16 audio.')
          if (!turnStart) turnStart = Date.now()
          if (bytes + chunk.length > MAX_AUDIO_BYTES || Date.now() - turnStart > 35000) throw new VoiceError('too_long', 'Maximum utterance duration is 30 seconds.')
          sequence++; bytes += chunk.length; audio.push(chunk); return
        }
        if (event.type === 'audio.input.end') {
          const request_id = identifier(event.request_id, 'request_id')
          if (!bytes) throw new VoiceError('invalid_audio', 'No input audio was received.')
          const recording = pcmToWav(Buffer.concat(audio)); reset()
          active = new AbortController()
          let outputSequence = 0
          try {
            const result = await core.turn(ticket.device, { ...ticket.body, request_id }, recording, {
              mode: 'websocket', signal: active.signal, onEvent: emit,
              onAudio: chunk => emit({ type: 'audio.output.chunk', request_id, sequence: outputSequence++,
                data: chunk.toString('base64'), transfer_encoding: 'base64', ...core.contract().output_audio })
            })
            if (result.replayed) {
              await emit({ type: 'input.transcript.final', request_id, transcript_text: result.transcript_text })
              await emit({ type: 'response.text.final', request_id, response_text: result.response_text })
            }
            await emit({ type: 'response.completed', ...result, response_audio: undefined })
          } finally { active = null }
          return
        }
        throw new VoiceError('unknown_event', 'Event type is not supported.')
      } catch (error) {
        if (!active) reset()
        report(error, event?.request_id)
      }
    })
    const heartbeat = setInterval(() => {
      if (!alive || Date.now() > expiresAt || Date.now() - lastSeen > 120000 || ticket.device.revoked) { ws.terminate(); return }
      if (turnStart && Date.now() - turnStart > 35000) { reset(); report(new VoiceError('too_long', 'Input timed out. Restart the turn.', 408, true)) }
      alive = false; ws.ping()
    }, 20000)
    ws.on('error', () => {})
    ws.on('close', () => {
      clearInterval(heartbeat); active?.abort(new VoiceError('response_cancelled', 'Connection closed. Restart the turn.', 409, true))
      reset(); sockets.delete(ws)
      const count = (connected.get(ticket.deviceKey) || 1) - 1
      if (count) connected.set(ticket.deviceKey, count); else connected.delete(ticket.deviceKey)
    })
  })
  const cleanup = setInterval(() => {
    for (const [key, ticket] of tickets) if (ticket.expires_at <= Date.now()) tickets.delete(key)
    core.prune()
  }, 60000)
  cleanup.unref()
  server.on('close', () => { clearInterval(cleanup); for (const ws of sockets) ws.terminate(); wss.close() })
  return server
}
