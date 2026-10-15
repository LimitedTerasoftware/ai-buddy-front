import { proxyVoiceRequest } from '../../server/voice/vercelProxy.js'
export const config = { api: { bodyParser: false } }
export default function handler(req, res) { return proxyVoiceRequest(req, res, '/api/voice/admin', ['GET']) }
