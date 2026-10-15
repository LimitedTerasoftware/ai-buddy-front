import { VoiceCore, DEFAULT_CHARACTER, PERSONALITIES, SKILLS } from './core.js'
import { VoiceStore } from './store.js'
import { createOpenAIProvider } from './provider.js'
import { VoiceError, authenticate, verifyToken, readBody, decodeAudio } from './protocol.js'

// Every invocation owns its state. Never rely on a warm function for continuity.
export async function handleServerlessVoice(req, res, path, env = process.env, provider) {
  if (path === '/api/voice/health') {
    return res.status(200).json({ status: 'ok', mode: 'stateless', protocol_version: '1',
      capabilities: { wav_upload: true, sessions: false, memory: false, websocket: false, idempotency: false } })
  }
  let devices, admins
  try {
    devices = JSON.parse(env.VOICE_DEVICES || '[]')
    admins = JSON.parse(env.VOICE_ADMINS || '[]')
    if (!Array.isArray(devices) || !Array.isArray(admins) || !devices.length ||
        devices.some(device => !/^[a-f0-9]{64}$/.test(device.token_sha256 || '') ||
          !device.tenant_id || !device.device_id || !Array.isArray(device.profile_ids) || !Array.isArray(device.character_ids))) throw new Error()
  } catch {
    throw new VoiceError('generation_failed', 'Configure VOICE_DEVICES with device token hashes and identity allowlists.', 503)
  }
  if (path.startsWith('/api/voice/admin')) {
    const token = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1]
    const admin = admins.find(item => !item.revoked && verifyToken(token, item.token_sha256))
    if (!admin) throw new VoiceError('unauthorized_device', 'Admin authentication is required.', 401)
    if (path !== '/api/voice/admin' || req.method !== 'GET') {
      throw new VoiceError('generation_failed', 'Saved character settings and memory require a persistent voice backend.', 503)
    }
    return res.status(200).json({ mode: 'stateless', characters: [DEFAULT_CHARACTER],
      personalities: Object.keys(PERSONALITIES), skills: Object.keys(SKILLS), turns: [],
      devices: devices.filter(device => device.tenant_id === admin.tenant_id).map(device => ({
        device_id: device.device_id, profile_ids: device.profile_ids, character_ids: device.character_ids, revoked: !!device.revoked
      })) })
  }
  const device = authenticate(req.headers, devices)
  if (path === '/api/voice/websocket') throw new VoiceError('generation_failed', 'Device WebSockets require a persistent VOICE_SERVICE_URL. Use push-to-talk for Vercel-only WAV uploads.', 503)
  if (!env.OPENAI_API_KEY && !provider) throw new VoiceError('generation_failed', 'Configure OPENAI_API_KEY on Vercel.', 503)
  const body = await readBody(req)
  if (body.session_id) throw new VoiceError('session_expired', 'Vercel-only uploads are independent turns. Omit session_id.', 409, true)
  if (req.headers['idempotency-key']) {
    if (body.request_id && body.request_id !== req.headers['idempotency-key']) throw new VoiceError('idempotency_conflict', 'Header and request IDs do not match.', 409)
    body.request_id = req.headers['idempotency-key']
  }
  const audio = Buffer.isBuffer(body.audio) ? body.audio : decodeAudio(body.audio_base64)
  const core = new VoiceCore({ store: new VoiceStore(), devices, provider: provider || createOpenAIProvider(env),
    maxResponseAudioBytes: 48000 * 60 })
  const controller = new AbortController()
  const disconnect = () => { if (!res.writableEnded) controller.abort() }
  res.on?.('close', disconnect)
  try {
    const result = await core.turn(device, body, audio, { signal: controller.signal })
    // A session ID from a local core has no meaning in the next invocation.
    res.status(200).json({ ...result, session_id: null, mode: 'stateless', idempotency_supported: false })
  } finally { res.off?.('close', disconnect) }
}
