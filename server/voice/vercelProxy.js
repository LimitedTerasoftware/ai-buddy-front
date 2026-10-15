import { MAX_BODY_BYTES, VoiceError, errorBody } from './protocol.js'
import { handleServerlessVoice } from './serverless.js'

// Use direct stateless processing unless a persistent service is configured.
export async function proxyVoiceRequest(req, res, path, methods = ['POST']) {
  const origins = [...(process.env.FRONTEND_ORIGIN || '').split(',').map(value => value.trim()),
    'https://ai-buddy-two-iota.vercel.app',
    ...[process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean).map(host => `https://${host}`)]
  if (req.headers.origin && !origins.includes(req.headers.origin)) {
    res.status(403).json(errorBody(new VoiceError('unauthorized_device', 'Origin is not allowed.', 403))); return
  }
  if (req.headers.origin) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key')
  res.setHeader('Access-Control-Allow-Methods', [...methods, 'OPTIONS'].join(', '))
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (!methods.includes(req.method)) { res.setHeader('Allow', methods.join(', ')); res.status(405).json(errorBody(new VoiceError('method_not_allowed', 'Method is not supported.', 405))); return }
  const base = process.env.VOICE_SERVICE_URL
  if (base && (process.env.NODE_ENV === 'production' && !base.startsWith('https://'))) {
    res.status(503).json(errorBody(new VoiceError('generation_failed', 'Configure a secure VOICE_SERVICE_URL for the backend.', 503, true))); return
  }
  try {
    if (!base) return await handleServerlessVoice(req, res, path)
    let length = 0
    const chunks = []
    const source = req.body === undefined ? req : [Buffer.isBuffer(req.body) ? req.body :
      Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body))]
    for await (const chunk of source) {
      length += chunk.length
      if (length > MAX_BODY_BYTES) throw new VoiceError('too_long', 'Upload exceeds the size limit.', 413)
      chunks.push(chunk)
    }
    const response = await fetch(new URL(path, base), {
      method: req.method, headers: { 'Content-Type': req.headers['content-type'] || 'application/json',
        Authorization: req.headers.authorization || '',
        ...(req.headers['idempotency-key'] ? { 'Idempotency-Key': req.headers['idempotency-key'] } : {}) },
      ...(req.method !== 'GET' ? { body: Buffer.concat(chunks) } : {}), signal: AbortSignal.timeout(95000), redirect: 'error'
    })
    res.status(response.status).json(await response.json())
  } catch (error) {
    const safe = error.name === 'TimeoutError' ? new VoiceError('upstream_timeout', 'Voice service timed out.', 504, true) :
      error instanceof VoiceError ? error : new VoiceError('generation_failed', 'Voice service is unavailable.', 502, true)
    res.status(safe.status).json(errorBody(safe))
  }
}
