import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { handleServerlessVoice } from './serverless.js'
import { pcmToWav, tokenHash } from './protocol.js'
import { proxyVoiceRequest } from './vercelProxy.js'

const device = { tenant_id: 'account-1', device_id: 'device-1', profile_ids: ['profile-1'],
  character_ids: ['buddy'], token_sha256: tokenHash('test-token') }
const env = { VOICE_DEVICES: JSON.stringify([device]) }
const metadata = { device_id: 'device-1', profile_id: 'profile-1', character_id: 'buddy', request_id: 'wav-1' }
const audio = pcmToWav(Buffer.alloc(3200))
function response() {
  return { setHeader() {}, status(code) { this.code = code; return this }, json(body) { this.body = body }, end() {} }
}
function provider(bytes = 4800) {
  return { id: 'mock', models: {}, async transcribe() { return 'Hello Buddy' }, async safe() { return true },
    async generate() { return { text: 'Hello!' } }, async *speak() { yield Buffer.alloc(bytes) } }
}
function request(body) {
  return { method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' }, body }
}

test('Vercel parsed JSON processes audio without persistent storage and never advertises a reusable session', async () => {
  const req = request({ ...metadata, audio_base64: audio.toString('base64') })
  for (let i = 0; i < 2; i++) {
    const res = response()
    await handleServerlessVoice(req, res, '/api/voice/push-to-talk', env, provider())
    assert.equal(res.code, 200)
    assert.equal(res.body.transcript_text, 'Hello Buddy')
    assert.equal(res.body.mode, 'stateless')
    assert.equal(res.body.session_id, null)
    assert.equal(res.body.idempotency_supported, false)
    assert.equal(Buffer.from(res.body.response_audio.data, 'base64').length, 4800)
  }
})

test('Vercel multipart stream preserves WAV bytes and metadata', async () => {
  const form = new FormData()
  form.set('audio', new Blob([audio], { type: 'audio/wav' }), 'test.wav')
  form.set('metadata', JSON.stringify(metadata))
  const upload = new Request('http://localhost', { method: 'POST', body: form })
  const req = Readable.from([Buffer.from(await upload.arrayBuffer())])
  req.method = 'POST'
  req.headers = { authorization: 'Bearer test-token', 'content-type': upload.headers.get('content-type') }
  const mock = provider()
  mock.transcribe = async received => { assert.deepEqual(received, audio); return 'Hello' }
  const res = response()
  await handleServerlessVoice(req, res, '/api/voice/push-to-talk', env, mock)
  assert.equal(res.code, 200)
})

test('stateless uploads reject bad credentials, cross-profile requests, old sessions and oversized bodies', async () => {
  const body = { ...metadata, audio_base64: audio.toString('base64') }
  const req = request(body)
  req.headers.authorization = 'Bearer wrong'
  await assert.rejects(handleServerlessVoice(req, response(), '/api/voice/push-to-talk', env, provider()), { status: 401 })
  for (const [extra, code] of [[{ profile_id: 'other' }, 'unauthorized_device'],
    [{ session_id: 'old-session' }, 'session_expired'], [{ audio_base64: 'x'.repeat(1400001) }, 'too_long']]) {
    await assert.rejects(handleServerlessVoice(request({ ...body, ...extra }), response(), '/api/voice/push-to-talk', env, provider()), { code })
  }
})

test('response PCM is bounded to fit Vercel JSON response payload limits', async () => {
  await assert.rejects(handleServerlessVoice(request({ ...metadata, audio_base64: audio.toString('base64') }),
    response(), '/api/voice/push-to-talk', env, provider(48000 * 60 + 2)), { code: 'generation_failed', status: 502 })
})

test('production browser origin works without extra CORS config and foreign origins fail', async t => {
  const old = process.env.VOICE_SERVICE_URL
  delete process.env.VOICE_SERVICE_URL
  t.after(() => { if (old !== undefined) process.env.VOICE_SERVICE_URL = old })
  for (const [origin, code] of [['https://ai-buddy-two-iota.vercel.app', 200], ['https://foreign.example', 403]]) {
    const res = response()
    await proxyVoiceRequest({ method: 'GET', headers: { origin } }, res, '/api/voice/health', ['GET'])
    assert.equal(res.code, code)
    if (code === 200) assert.equal(res.body.capabilities.sessions, false)
  }
})
