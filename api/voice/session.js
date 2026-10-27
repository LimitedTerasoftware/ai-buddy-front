import {
  buildRealtimeSession,
  createRealtimeClientSecret,
  getInstructions,
  parseSpeed,
  readJson,
  setCorsHeaders
} from '../../server/voice/realtimeSession.js'

export default async function handler(req, res) {
  setCorsHeaders(req, res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: 'OPENAI_API_KEY is not configured for this deployment.' })
    return
  }

  try {
    const body = await readJson(req)
    const data = await createRealtimeClientSecret(req, buildRealtimeSession({
      instructions: getInstructions(body.instructions),
      speed: parseSpeed(body.speed),
      turnDetection: { type: 'semantic_vad', eagerness: 'high' }
    }))

    res.status(200).json(data)
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Failed to create voice session.' })
  }
}
