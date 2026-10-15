import { createHash, timingSafeEqual } from 'node:crypto'

export const INPUT_AUDIO = { audio_format: 'pcm', sample_rate_hz: 16000, channels: 1, encoding: 'pcm_s16le' }
export const OUTPUT_AUDIO = { ...INPUT_AUDIO, sample_rate_hz: 24000 }
export const MAX_AUDIO_BYTES = 16000 * 2 * 30
export const MAX_BODY_BYTES = 1400000
export class VoiceError extends Error {
  constructor(code, message, status = 400, recoverable = false) {
    super(message)
    Object.assign(this, { code, status, recoverable })
  }
}
export function errorBody(error, request_id) {
  const known = error instanceof VoiceError
  return { request_id, status: 'error', error: {
    code: known ? error.code : 'internal_error',
    message: known ? error.message : 'The voice service could not complete the request.',
    recoverable: known ? error.recoverable : true
  } }
}
export function identifier(value, name) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) {
    throw new VoiceError('invalid_metadata', `${name} must be a pseudonymous identifier (letters, digits, _ or -).`)
  }
  return value
}
export function decodeAudio(value, max = MAX_AUDIO_BYTES + 4096) {
  if (typeof value !== 'string' || !value.length || value.length > Math.ceil(max / 3) * 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new VoiceError('invalid_audio', 'Audio must be valid, bounded base64.')
  }
  const audio = Buffer.from(value, 'base64')
  if (audio.length > max) throw new VoiceError('too_long', 'Audio exceeds the size limit.')
  return audio
}
export function validateWav(audio) {
  if (audio.length < 44 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') {
    throw new VoiceError('invalid_audio', 'Upload a complete WAV recording.')
  }
  if (audio.readUInt32LE(4) + 8 !== audio.length) throw new VoiceError('invalid_audio', 'WAV length is invalid.')
  let format, pcm
  for (let offset = 12; offset + 8 <= audio.length;) {
    const size = audio.readUInt32LE(offset + 4), start = offset + 8
    if (start + size > audio.length) throw new VoiceError('invalid_audio', 'WAV contains a truncated chunk.')
    const type = audio.toString('ascii', offset, offset + 4)
    if (type === 'fmt ' && size >= 16) {
      format = [audio.readUInt16LE(start), audio.readUInt16LE(start + 2), audio.readUInt32LE(start + 4),
        audio.readUInt32LE(start + 8), audio.readUInt16LE(start + 12), audio.readUInt16LE(start + 14)]
    }
    if (type === 'data') pcm = audio.subarray(start, start + size)
    offset = start + size + (size % 2)
  }
  if (!format || format.join(',') !== '1,1,16000,32000,2,16') {
    throw new VoiceError('unsupported_format', 'Use WAV PCM16 little-endian, 16000 Hz, mono.')
  }
  if (!pcm?.length || pcm.length % 2) throw new VoiceError('invalid_audio', 'WAV has no complete PCM samples.')
  if (pcm.length > MAX_AUDIO_BYTES) throw new VoiceError('too_long', 'Maximum utterance duration is 30 seconds.')
  return { duration_ms: pcm.length / 32 }
}
export function pcmToWav(pcm) {
  const header = Buffer.alloc(44)
  header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22)
  header.writeUInt32LE(16000, 24); header.writeUInt32LE(32000, 28)
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}
export function tokenHash(token) { return createHash('sha256').update(token).digest('hex') }
export function verifyToken(token, hash) {
  if (!token || !/^[a-f0-9]{64}$/.test(hash || '')) return false
  return timingSafeEqual(Buffer.from(tokenHash(token), 'hex'), Buffer.from(hash, 'hex'))
}
export function authenticate(headers, devices) {
  const token = /^Bearer (.+)$/.exec(headers.authorization || '')?.[1]
  const device = devices.find(item => !item.revoked && verifyToken(token, item.token_sha256))
  if (!device) throw new VoiceError('unauthorized_device', 'Device credential is unknown or revoked.', 401)
  return device
}
export async function readBody(req) {
  let size = 0
  const chunks = []
  // Vercel may already have consumed and parsed the incoming request stream.
  const source = req.body === undefined ? req : [Buffer.isBuffer(req.body) ? req.body :
    Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body))]
  for await (const chunk of source) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new VoiceError('too_long', 'Upload exceeds the size limit.', 413)
    chunks.push(chunk)
  }
  const bytes = Buffer.concat(chunks)
  const type = req.headers['content-type'] || ''
  try {
    if (type.startsWith('multipart/form-data')) {
      const form = await new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': type }, body: bytes }).formData()
      const audio = form.get('audio')
      if (!audio || typeof audio.arrayBuffer !== 'function') throw new Error('Missing file')
      const metadata = JSON.parse(form.get('metadata') || '{}')
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('Invalid metadata')
      return { ...metadata, audio: Buffer.from(await audio.arrayBuffer()) }
    }
    if (!type.startsWith('application/json')) throw new VoiceError('unsupported_format', 'Use multipart/form-data or application/json.', 415)
    const body = bytes.length ? JSON.parse(bytes.toString('utf8')) : {}
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid metadata')
    return body
  } catch (error) {
    if (error instanceof VoiceError) throw error
    throw new VoiceError('invalid_metadata', 'Malformed JSON or multipart upload.')
  }
}
