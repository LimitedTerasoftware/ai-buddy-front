import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { Readable } from 'node:stream'
import { WebSocket } from 'ws'
import { VoiceCore, DEFAULT_CHARACTER } from './core.js'
import { VoiceStore } from './store.js'
import { createVoiceService } from './service.js'
import { pcmToWav, validateWav, tokenHash, VoiceError, authenticate, decodeAudio } from './protocol.js'
import { createOpenAIProvider } from './provider.js'
import { proxyVoiceRequest } from './vercelProxy.js'

const device = { device_id: 'device-1', tenant_id: 'tenant-1', profile_ids: ['profile-1'], character_ids: ['buddy'], token_sha256: tokenHash('device-secret') }
const admin = { tenant_id: 'tenant-1', token_sha256: tokenHash('admin-secret') }
const metadata = { device_id: device.device_id, profile_id: 'profile-1', character_id: 'buddy', request_id: 'request-1' }
const wav = pcmToWav(Buffer.alloc(1600, 1))
function fixture() {
  const calls = { stt: 0, llm: 0, tts: 0, messages: [] }, logs = []
  const provider = { id: 'test', models: { stt: 'test-stt', llm: 'test-llm', tts: 'test-tts' },
    async transcribe() { calls.stt++; return 'Tell me about dinosaurs' },
    async safe() { return true },
    async generate(messages) { calls.llm++; calls.messages.push(messages); return { text: 'Dinosaurs lived long ago.', usage: { total_tokens: 12 } } },
    async *speak() { calls.tts++; yield Buffer.alloc(1001, 2); yield Buffer.alloc(5001, 2) }
  }
  const store = new VoiceStore(), core = new VoiceCore({ store, provider, devices: [device], log: entry => logs.push(entry) })
  return { core, store, provider, calls, logs }
}
async function service(t, options = {}) {
  const setup = fixture()
  Object.assign(setup.provider, options.provider)
  const server = createVoiceService({ core: setup.core, devices: [device], admins: [admin], websocketUrl: 'ws://127.0.0.1/v1/voice/stream' })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  const base = `http://127.0.0.1:${server.address().port}`
  const post = async (path, body, token = 'device-secret', method = 'POST') => {
    const response = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { status: response.status, body: await response.json() }
  }
  async function connect() {
    const session = (await post('/api/voice/websocket', metadata)).body
    const ws = new WebSocket(`${base.replace('http:', 'ws:')}/v1/voice/stream`, session.websocket_subprotocols)
    const events = [], waiters = []
    ws.on('message', data => {
      const event = JSON.parse(data.toString()); events.push(event)
      for (const entry of [...waiters]) if (entry.match(event)) { clearTimeout(entry.timer); waiters.splice(waiters.indexOf(entry), 1); entry.resolve(event) }
    })
    const next = match => new Promise((resolve, reject) => {
      const entry = { match, resolve, timer: setTimeout(() => reject(new Error('Timed out waiting for event')), 3000) }; waiters.push(entry)
    })
    await once(ws, 'open'); t.after(() => ws.terminate())
    const ready = next(event => event.type === 'session.ready')
    ws.send(JSON.stringify({ type: 'session.start', protocol_version: '1', ...metadata, session_id: session.session_id,
      language: 'en', input_audio: session.input_audio, output_audio: session.output_audio }))
    await ready
    return { ws, next, events, session }
  }
  return { ...setup, server, post, connect, base }
}
function submit(ws, id) {
  ws.send(JSON.stringify({ type: 'audio.input', sequence: 0, data: Buffer.alloc(1600, 1).toString('base64') }))
  ws.send(JSON.stringify({ type: 'audio.input.end', request_id: id }))
}

test('PTT returns transcript, audio and shared configuration; retries never repeat provider calls', async () => {
  const { core, calls } = fixture()
  const result = await core.turn(device, metadata, wav)
  assert.equal(result.status, 'completed'); assert.equal(result.sample_rate_hz, 24000)
  assert.equal(Buffer.from(result.response_audio.data, 'base64').length, 6002)
  const replay = await core.turn(device, metadata, wav)
  assert.equal(replay.replayed, true); assert.deepEqual(replay.response_audio, result.response_audio)
  assert.equal(calls.stt, 1); assert.equal(calls.tts, 1)
  await assert.rejects(core.turn(device, metadata, pcmToWav(Buffer.alloc(1600, 2))), { code: 'idempotency_conflict' })
})
test('follow-up sees history; character changes, skills and memory are applied on the next turn', async () => {
  const { core, store, calls } = fixture()
  const first = await core.turn(device, metadata, wav)
  store.data.characters['tenant-1:buddy'] = { ...DEFAULT_CHARACTER, personality: 'Teacher', instructions: 'You are a dinosaur guide.', enabled_skills: ['dinosaurs'], version: 2 }
  store.data.memories['tenant-1:profile-1'] = [{ id: 'memory', text: 'I enjoy dinosaurs.' }]
  const second = await core.turn(device, { ...metadata, request_id: 'request-2', session_id: first.session_id }, wav)
  assert.equal(second.configuration_version, 2); assert.equal(second.selected_skill, 'dinosaurs')
  assert.equal(calls.messages[1].length, 4)
  assert.match(calls.messages[1][0].content, /dinosaur guide/); assert.match(calls.messages[1][0].content, /I enjoy dinosaurs/)
})
test('session and profile isolation rejects cross-tenant access and unauthorized profiles', async () => {
  const { core } = fixture(), first = await core.turn(device, metadata, wav)
  await assert.rejects(core.turn(device, { ...metadata, profile_id: 'other', request_id: 'other' }, wav), { code: 'unauthorized_device' })
  await assert.rejects(core.turn({ ...device, tenant_id: 'tenant-2' }, { ...metadata, request_id: 'other', session_id: first.session_id }, wav), { code: 'unauthorized_device' })
  await assert.rejects(core.turn(device, { ...metadata, request_id: 'other', session_id: 'missing' }, wav), { code: 'session_expired' })
})
test('audio validation rejects bad formats, oversized audio, truncation and invalid base64', () => {
  assert.equal(validateWav(wav).duration_ms, 50)
  assert.throws(() => validateWav(Buffer.from('invalid')), { code: 'invalid_audio' })
  const stereo = Buffer.from(wav); stereo.writeUInt16LE(2, 22)
  assert.throws(() => validateWav(stereo), { code: 'unsupported_format' })
  assert.throws(() => validateWav(wav.subarray(0, 50)), { code: 'invalid_audio' })
  assert.throws(() => validateWav(pcmToWav(Buffer.alloc(960002))), { code: 'too_long' })
  assert.throws(() => decodeAudio('@@@@'), { code: 'invalid_audio' })
})
test('input and output safety checks use a safe fallback', async () => {
  const { core, provider, calls } = fixture()
  provider.safe = async () => false
  const result = await core.turn(device, metadata, wav)
  assert.equal(result.safety_status, 'fallback'); assert.equal(calls.llm, 0)
  assert.match(result.response_text, /trusted adult/)
})
test('unsafe model output is replaced before any response text or speech is emitted', async () => {
  const { core, provider } = fixture(), events = []
  provider.generate = async () => ({ text: 'unsafe output' })
  provider.safe = async text => text !== 'unsafe output'
  let spoken
  provider.speak = async function* (text) { spoken = text; yield Buffer.alloc(100) }
  const result = await core.turn(device, metadata, wav, { onEvent: event => events.push(event) })
  assert.equal(result.safety_status, 'fallback'); assert.doesNotMatch(spoken, /unsafe output/)
  assert.doesNotMatch(JSON.stringify(events), /unsafe output/)
})
test('stage timeout aborts provider processing and returns a stable recoverable error', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { core, provider } = fixture()
  provider.transcribe = (_audio, _language, signal) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
  const turn = core.turn(device, metadata, wav)
  t.mock.timers.tick(20000)
  await assert.rejects(turn, { code: 'upstream_timeout', status: 504, recoverable: true })
})
test('rate limits reject extra turns without creating extra sessions', async () => {
  const { core, store } = fixture()
  for (let index = 0; index < 12; index++) await core.turn(device, { ...metadata, request_id: `rate-${index}` }, wav)
  await assert.rejects(core.turn(device, { ...metadata, request_id: 'rate-13' }, wav), { code: 'rate_limited' })
  assert.equal(Object.keys(store.data.sessions).length, 12)
})
test('structured logs and persistent records contain no audio or credentials', async () => {
  const { core, store, logs } = fixture()
  await core.turn(device, metadata, wav)
  assert.equal(store.data.requests['tenant-1:device-1:request-1'].result.response_audio, null)
  const text = JSON.stringify(logs)
  assert.doesNotMatch(text, /Dinosaurs lived|Tell me|device-secret|audio_base64/)
  assert.equal(logs[0].mode, 'ptt'); assert.ok(logs[0].latency.stt_ms >= 0)
})
test('expired replay audio returns metadata without duplicate charges', async () => {
  const { core, calls } = fixture()
  await core.turn(device, metadata, wav); core.audioCache.clear()
  const replay = await core.turn(device, metadata, wav)
  assert.equal(replay.audio_expired, true); assert.equal(replay.response_audio, null); assert.equal(calls.tts, 1)
})
test('unknown and revoked credentials are rejected', () => {
  assert.throws(() => authenticate({ authorization: 'Bearer wrong' }, [device]), { code: 'unauthorized_device' })
  assert.throws(() => authenticate({ authorization: 'Bearer device-secret' }, [{ ...device, revoked: true }]), { code: 'unauthorized_device' })
})
test('concurrent duplicate requests are rejected; cancellation does not commit history or permit an unsafe retry', async () => {
  const { core, provider, store } = fixture()
  let began
  const started = new Promise(resolve => { began = resolve })
  provider.transcribe = (_audio, _language, signal) => new Promise((resolve, reject) => {
    began(); signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
  const controller = new AbortController()
  const turn = core.turn(device, metadata, wav, { signal: controller.signal })
  await started
  await assert.rejects(core.turn(device, metadata, wav), { code: 'request_in_progress' })
  controller.abort(new VoiceError('response_cancelled', 'Cancelled.', 409, true))
  await assert.rejects(turn, { code: 'response_cancelled' })
  assert.equal(Object.values(store.data.sessions)[0].history.length, 0)
  await assert.rejects(core.turn(device, metadata, wav), { code: 'request_interrupted' })
})
test('HTTP JSON and multipart PTT both work; malformed uploads and missing auth fail safely', async t => {
  const { post, base } = await service(t)
  const json = await post('/api/voice/push-to-talk', { ...metadata, audio_base64: wav.toString('base64') })
  assert.equal(json.status, 200); assert.equal(json.body.transcript_text, 'Tell me about dinosaurs')
  const form = new FormData()
  form.append('metadata', JSON.stringify({ ...metadata, request_id: 'multipart' }))
  form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'speech.wav')
  const response = await fetch(`${base}/v1/voice/ptt`, { method: 'POST', headers: { Authorization: 'Bearer device-secret' }, body: form })
  assert.equal(response.status, 200)
  assert.equal((await post('/api/voice/push-to-talk', metadata)).body.error.code, 'invalid_audio')
  assert.equal((await post('/api/voice/push-to-talk', {}, 'unknown')).status, 401)
  assert.equal((await post('/api/voice/push-to-talk', null)).body.error.code, 'invalid_metadata')
})
test('memory requires consent; edit and forget remove stored preference and associated history', async t => {
  const { post, store } = await service(t)
  const memory = { profile_id: 'profile-1', text: 'I enjoy dinosaurs.' }
  assert.equal((await post('/api/voice/admin/memory', memory, 'admin-secret', 'PUT')).status, 400)
  const saved = await post('/api/voice/admin/memory', { ...memory, consent: true }, 'admin-secret', 'PUT')
  assert.equal(saved.status, 200)
  assert.equal((await post('/api/voice/admin/memory', { ...memory, consent: true, id: saved.body.memory.id, text: 'I enjoy dinosaur stories.' }, 'admin-secret', 'PUT')).status, 200)
  await post('/api/voice/push-to-talk', { ...metadata, audio_base64: wav.toString('base64') })
  assert.equal((await post('/api/voice/admin/memory', { profile_id: 'profile-1' }, 'admin-secret', 'DELETE')).status, 200)
  assert.deepEqual(store.data.memories['tenant-1:profile-1'], []); assert.deepEqual(store.data.sessions, {}); assert.deepEqual(store.data.requests, {})
})
test('WebSocket supports multiple streamed turns, heartbeat and sequence validation', async t => {
  const { connect, calls } = await service(t), { ws, next, events } = await connect()
  const pong = next(event => event.type === 'pong'); ws.send(JSON.stringify({ type: 'ping' })); await pong
  for (const id of ['ws-1', 'ws-2']) {
    const complete = next(event => event.type === 'response.completed' && event.request_id === id)
    submit(ws, id)
    assert.equal((await complete).status, 'completed')
  }
  assert.equal(calls.messages[1].length, 4)
  const chunks = events.filter(event => event.type === 'audio.output.chunk' && event.request_id === 'ws-1')
  assert.deepEqual(chunks.map(chunk => chunk.sequence), [0, 1])
  assert.equal(chunks.reduce((sum, chunk) => sum + Buffer.from(chunk.data, 'base64').length, 0), 6002)
  const invalid = next(event => event.type === 'error')
  ws.send(JSON.stringify({ type: 'audio.input', sequence: 9, data: Buffer.alloc(1600).toString('base64') }))
  assert.equal((await invalid).error.code, 'invalid_sequence')
})
test('WebSocket cancellation aborts the pipeline and leaves session available for a new turn', async t => {
  const setup = await service(t), { ws, next } = await setup.connect()
  const original = setup.provider.transcribe
  setup.provider.transcribe = (_audio, _language, signal) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
  const cancelled = next(event => event.type === 'error' && event.error.code === 'response_cancelled')
  submit(ws, 'cancelled'); ws.send(JSON.stringify({ type: 'response.cancel' }))
  await cancelled
  setup.provider.transcribe = original
  const complete = next(event => event.type === 'response.completed')
  submit(ws, 'after-cancel'); await complete
})
test('WebSocket credentials are single use and provider secrets are never returned', async t => {
  const setup = await service(t), { ws, session } = await setup.connect()
  assert.doesNotMatch(JSON.stringify(session), /api.openai.com|device-secret|OPENAI_API_KEY/)
  ws.close(); await once(ws, 'close')
  const replay = new WebSocket(`${setup.base.replace('http:', 'ws:')}/v1/voice/stream`, session.websocket_subprotocols)
  const [error] = await once(replay, 'error')
  assert.match(error.message, /401/)
})
test('WebSocket disconnect aborts a turn, and a fresh credential resumes only completed history', async t => {
  const setup = await service(t), { ws, session } = await setup.connect()
  let began, aborted
  const started = new Promise(resolve => { began = resolve }), stopped = new Promise(resolve => { aborted = resolve })
  setup.provider.transcribe = (_audio, _language, signal) => new Promise((resolve, reject) => {
    began(); signal.addEventListener('abort', () => { aborted(); reject(signal.reason) }, { once: true })
  })
  submit(ws, 'disconnect'); await started
  ws.terminate(); await stopped
  assert.equal(setup.store.data.sessions[session.session_id].history.length, 0)
  const reconnect = await setup.post('/api/voice/websocket', { ...metadata, session_id: session.session_id })
  assert.equal(reconnect.status, 200); assert.equal(reconnect.body.session_id, session.session_id)
})
test('OpenAI adapter uses server credentials, multipart transcription, bounded text and PCM streaming', async () => {
  const calls = []
  const provider = createOpenAIProvider({ OPENAI_API_KEY: 'server-only' }, async (url, options) => {
    calls.push({ url, options })
    if (url.endsWith('transcriptions')) return Response.json({ text: 'Hello' })
    if (url.endsWith('moderations')) return Response.json({ results: [{ flagged: false }] })
    if (url.endsWith('completions')) return Response.json({ choices: [{ message: { content: 'Hi!' } }] })
    return new Response(Buffer.alloc(100))
  })
  const signal = new AbortController().signal
  assert.equal(await provider.transcribe(wav, 'en', signal), 'Hello')
  assert.equal(await provider.safe('Hello', signal), true)
  assert.equal((await provider.generate([], signal)).text, 'Hi!')
  for await (const chunk of provider.speak('Hi!', DEFAULT_CHARACTER, 0.85, signal)) assert.equal(chunk.length, 100)
  assert.equal(calls[0].options.body.get('language'), 'en')
  assert.equal(JSON.parse(calls[3].options.body).response_format, 'pcm')
  assert.ok(calls.every(call => call.options.headers.Authorization === 'Bearer server-only'))
})
test('Vercel proxy preserves device credentials and upload bytes; fails clearly without deployment configuration', async t => {
  const oldBase = process.env.VOICE_SERVICE_URL, oldFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = oldFetch; if (oldBase === undefined) delete process.env.VOICE_SERVICE_URL; else process.env.VOICE_SERVICE_URL = oldBase })
  process.env.VOICE_SERVICE_URL = 'https://voice.example'
  let forwarded
  globalThis.fetch = async (url, options) => { forwarded = { url: url.toString(), options }; return Response.json({ status: 'completed' }) }
  const req = Readable.from([Buffer.from('upload bytes')])
  req.method = 'POST'; req.headers = { authorization: 'Bearer device-secret', 'content-type': 'multipart/form-data; boundary=test' }
  const res = { setHeader() {}, status(code) { this.code = code; return this }, json(body) { this.body = body }, end() {} }
  await proxyVoiceRequest(req, res, '/api/voice/push-to-talk')
  assert.equal(res.code, 200); assert.equal(forwarded.url, 'https://voice.example/api/voice/push-to-talk')
  assert.equal(forwarded.options.headers.Authorization, 'Bearer device-secret')
  assert.equal(forwarded.options.body.toString(), 'upload bytes')
  delete process.env.VOICE_SERVICE_URL
  await proxyVoiceRequest({ method: 'POST', headers: {} }, res, '/api/voice/websocket')
  assert.equal(res.code, 503); assert.equal(res.body.error.code, 'generation_failed')
})
