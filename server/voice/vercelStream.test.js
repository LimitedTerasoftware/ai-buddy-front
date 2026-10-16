import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { WebSocket } from 'ws'
import { createVercelWebSocketSession, createVercelStreamServer, createStreamTickets } from './vercelStream.js'
import { handleServerlessVoice } from './serverless.js'
import { proxyVoiceRequest } from './vercelProxy.js'
import { tokenHash } from './protocol.js'

const device = { tenant_id: 'account-1', device_id: 'device-1', profile_ids: ['profile-1'], character_ids: ['buddy'], token_sha256: tokenHash('device-token') }
const env = { VOICE_DEVICES: JSON.stringify([device]), OPENAI_API_KEY: 'mock',
  VOICE_PUBLIC_WS_URL: 'wss://ai-buddy-backend-ten.vercel.app/api/voice/stream', FRONTEND_ORIGIN: 'https://frontend.example' }
const metadata = { device_id: 'device-1', profile_id: 'profile-1', character_id: 'buddy', language: 'en' }
const req = body => ({ headers: { 'content-type': 'application/json' }, body })

function sharedTickets() {
  const pending = new Map(), connections = new Set()
  return {
    pending,
    async issue(id, ticket) { pending.set(id, structuredClone(ticket)) },
    async consume(id) { const value = pending.get(id); pending.delete(id); return value },
    async claim(_ticket, id) { connections.add(id) },
    async release(_ticket, id) { connections.delete(id) }
  }
}

async function fixture(t) {
  const tickets = sharedTickets(), calls = []
  const provider = { id: 'mock', models: {}, async transcribe() { return 'Hello' }, async safe() { return true },
    async generate(messages) { calls.push(messages); return { text: 'Hi there!' } }, async *speak() { yield Buffer.alloc(4800) } }
  // Issuing the ticket and accepting the socket use independent cores/stores.
  const server = createVercelStreamServer(env, { tickets, provider })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  const url = `ws://127.0.0.1:${server.address().port}/api/voice/stream`
  const session = await createVercelWebSocketSession(req(metadata), device, [device], env, tickets)
  function connect(protocols = session.websocket_subprotocols, options = {}) {
    const ws = new WebSocket(url, protocols, options)
    ws.on('error', () => {})
    t.after(() => ws.terminate())
    return ws
  }
  return { tickets, server, session, connect, calls }
}

function next(ws, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', message); reject(new Error(`Timed out: ${type}`)) }, 3000)
    function message(data) {
      const event = JSON.parse(data.toString())
      if (event.type === type) { clearTimeout(timer); ws.off('message', message); resolve(event) }
    }
    ws.on('message', message)
  })
}

test('native Vercel stream accepts a ticket issued on another instance and keeps multiple turns on one socket', async t => {
  const { session, connect, calls } = await fixture(t)
  assert.equal(session.websocket_url, env.VOICE_PUBLIC_WS_URL)
  assert.equal(session.session_persistence, 'connection')
  const ws = connect()
  await once(ws, 'open')
  const ready = next(ws, 'session.ready')
  ws.send(JSON.stringify({ type: 'session.start', protocol_version: '1', ...metadata, session_id: session.session_id,
    input_audio: session.input_audio, output_audio: session.output_audio }))
  await ready
  for (const request_id of ['first-turn', 'second-turn']) {
    const chunk = next(ws, 'audio.output.chunk'), completed = next(ws, 'response.completed')
    ws.send(JSON.stringify({ type: 'audio.input', sequence: 0, data: Buffer.alloc(1600).toString('base64') }))
    ws.send(JSON.stringify({ type: 'audio.input.end', request_id }))
    assert.equal((await chunk).sample_rate_hz, 24000)
    assert.equal((await completed).response_text, 'Hi there!')
  }
  assert.equal(calls.length, 2)
  assert.ok(calls[1].some(message => message.role === 'assistant' && message.content === 'Hi there!'))
})

test('native Vercel credentials are single-use even across simultaneous upgrades', async t => {
  const { connect } = await fixture(t)
  const first = connect(), second = connect()
  const outcomes = await Promise.all([first, second].map(ws => new Promise(resolve => {
    ws.once('open', () => resolve('open')); ws.once('unexpected-response', (_req, response) => { response.resume(); ws.terminate(); resolve(response.statusCode) })
  })))
  assert.deepEqual(outcomes.sort(), [401, 'open'].sort())
})

test('untrusted origins cannot consume credentials; expired credentials cannot connect', async t => {
  const { connect, tickets, session } = await fixture(t)
  const foreign = connect(session.websocket_subprotocols, { origin: 'https://foreign.example' })
  const [_, rejected] = await once(foreign, 'unexpected-response')
  assert.equal(rejected.statusCode, 401); rejected.resume(); foreign.terminate()
  assert.equal(tickets.pending.size, 1)
  tickets.pending.get(session.session_credential).expires_at = Date.now() - 1
  const expired = connect()
  const [, response] = await once(expired, 'unexpected-response')
  assert.equal(response.statusCode, 401); response.resume(); expired.terminate()
})

test('native sessions reject cross-profile access and reconnect session IDs', async () => {
  const tickets = sharedTickets()
  await assert.rejects(createVercelWebSocketSession(req({ ...metadata, profile_id: 'foreign' }), device, [device], env, tickets), { code: 'unauthorized_device' })
  await assert.rejects(createVercelWebSocketSession(req({ ...metadata, session_id: 'old-session' }), device, [device], env, tickets), { code: 'session_expired' })
  assert.equal(tickets.pending.size, 0)
})

test('Redis adapter uses expiring tickets, atomic consume and connection leases; masks backend failures', async () => {
  const commands = []
  const redisEnv = { UPSTASH_REDIS_REST_URL: 'https://redis.example', UPSTASH_REDIS_REST_TOKEN: 'secret' }
  const tickets = createStreamTickets(redisEnv, async (_url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer secret')
    const command = JSON.parse(options.body); commands.push(command)
    return Response.json({ result: command[0] === 'GETDEL' ? null : command[0] === 'ZREM' ? 1 : commands.length === 1 ? 'OK' : 1 })
  })
  await tickets.issue('credential', device)
  assert.equal(await tickets.consume('credential'), null)
  await tickets.claim(device, 'credential'); await tickets.release(device, 'credential')
  assert.ok(commands[0][1].includes("'EX', 60, 'NX'"))
  assert.equal(commands[1][0], 'GETDEL')
  assert.ok(!JSON.stringify(commands).includes('voice:ws:ticket:credential'))
  const failed = createStreamTickets(redisEnv, async () => { throw new Error('secret server failure') })
  await assert.rejects(failed.consume('credential'), { message: 'WebSocket credential storage is unavailable.', status: 503 })
})

test('missing Redis returns an actionable configuration error and health advertises streaming only when configured', async () => {
  assert.throws(() => createStreamTickets({}), /Configure UPSTASH_REDIS_REST_URL/)
  const response = { status() { return this }, json(body) { this.body = body } }
  await handleServerlessVoice({}, response, '/api/voice/health', env)
  assert.equal(response.body.capabilities.websocket, false)
  await handleServerlessVoice({}, response, '/api/voice/health', { ...env, UPSTASH_REDIS_REST_URL: 'https://redis.example', UPSTASH_REDIS_REST_TOKEN: 'secret' })
  assert.equal(response.body.capabilities.websocket, true)
})

test('Vercel session HTTP handler returns a usable native streaming contract instead of the old persistent-host error', async t => {
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(JSON.parse(options.body)[0], 'EVAL')
    return Response.json({ result: 'OK' })
  })
  const response = { status(code) { this.code = code; return this }, json(body) { this.body = body } }
  await handleServerlessVoice({ ...req(metadata), headers: { ...req(metadata).headers, authorization: 'Bearer device-token' } }, response,
    '/api/voice/websocket', { ...env, UPSTASH_REDIS_REST_URL: 'https://redis.example', UPSTASH_REDIS_REST_TOKEN: 'secret' })
  assert.equal(response.code, 200)
  assert.equal(response.body.mode, 'vercel-websocket')
  assert.equal(response.body.websocket_url, env.VOICE_PUBLIC_WS_URL)
  assert.equal(response.body.websocket_subprotocols[1], `ticket.${response.body.session_credential}`)
})

test('backend cannot recursively proxy voice requests to its own deployment', async t => {
  const before = process.env.VOICE_SERVICE_URL
  process.env.VOICE_SERVICE_URL = 'https://ai-buddy-backend-ten.vercel.app'
  t.after(() => { if (before === undefined) delete process.env.VOICE_SERVICE_URL; else process.env.VOICE_SERVICE_URL = before })
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(body) { this.body = body } }
  await proxyVoiceRequest({ method: 'POST', headers: { host: 'ai-buddy-backend-ten.vercel.app' } }, response, '/api/voice/websocket')
  assert.equal(response.code, 503)
  assert.match(response.body.error.message, /must not point to this same deployment/)
})
