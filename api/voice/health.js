import { proxyVoiceRequest } from '../../server/voice/vercelProxy.js'

export default function handler(req, res) {
  return proxyVoiceRequest(req, res, process.env.VOICE_SERVICE_URL ? '/health' : '/api/voice/health', ['GET'])
}
