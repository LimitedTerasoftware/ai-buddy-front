import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { VoiceStore } from './store.js'
import { VoiceCore } from './core.js'
import { createOpenAIProvider } from './provider.js'
import { createVoiceService } from './service.js'

export function startVoiceServer(env = process.env) {
  const devices = JSON.parse(env.VOICE_DEVICES || '[]'), admins = JSON.parse(env.VOICE_ADMINS || '[]')
  if (!devices.length) throw new Error('Configure VOICE_DEVICES with unique per-device token hashes before starting.')
  const hashes = new Set(), identities = new Set()
  for (const identity of [...devices, ...admins]) {
    if (!/^[a-f0-9]{64}$/.test(identity.token_sha256 || '') || !/^[\w-]{1,100}$/.test(identity.tenant_id || '') || hashes.has(identity.token_sha256)) {
      throw new Error('Every device/admin requires a unique SHA-256 credential hash and tenant_id.')
    }
    hashes.add(identity.token_sha256)
  }
  for (const device of devices) {
    const key = `${device.tenant_id}:${device.device_id}`
    if (!/^[\w-]{1,100}$/.test(device.device_id || '') || identities.has(key) ||
        !Array.isArray(device.profile_ids) || !Array.isArray(device.character_ids) ||
        [...device.profile_ids, ...device.character_ids].some(id => !/^[\w-]{1,100}$/.test(id))) {
      throw new Error('Configure distinct device identities and explicit profile_ids/character_ids allowlists.')
    }
    identities.add(key)
  }
  const websocketUrl = env.VOICE_PUBLIC_WS_URL || 'ws://127.0.0.1:8787/v1/voice/stream'
  if (env.NODE_ENV === 'production' && !websocketUrl.startsWith('wss://')) throw new Error('Production requires VOICE_PUBLIC_WS_URL using WSS.')
  const store = new VoiceStore(resolve(env.VOICE_STORE_PATH || '.voice-data/state.json'))
  store.prune()
  const core = new VoiceCore({ store, devices, provider: createOpenAIProvider(env) })
  const server = createVoiceService({ core, devices, admins, websocketUrl,
    allowedOrigins: (env.FRONTEND_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(origin => origin.trim()) })
  server.listen(Number(env.VOICE_PORT || 8787), env.VOICE_HOST || '127.0.0.1', () => console.info('Voice service listening'))
  return server
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) startVoiceServer()
