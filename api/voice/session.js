import { createHash } from 'node:crypto'

const OPENAI_REALTIME_CLIENT_SECRET_URL = 'https://api.openai.com/v1/realtime/client_secrets'
const DEFAULT_MODEL = 'gpt-realtime'
const DEFAULT_VOICE = 'marin'
const FALLBACK_INSTRUCTIONS = 'You are AI Buddy, a warm, patient learning companion for young children. Keep replies short, kind, and age appropriate.'

function setCorsHeaders(req, res) {
  const origin = req.headers.origin
  const allowedOrigins = [
    process.env.FRONTEND_ORIGIN,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '',
    'https://ai-buddy-backend-ten.vercel.app',
    'http://127.0.0.1:5173'
  ].filter(Boolean)

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function parseSpeed(value) {
  const speed = Number(value)
  if (!Number.isFinite(speed)) return 0.85
  return Math.min(1.5, Math.max(0.25, speed))
}

function getSafetyIdentifier(req) {
  const salt = process.env.SAFETY_IDENTIFIER_SALT || 'ai-buddy'
  const source = [
    req.headers['x-forwarded-for']?.split(',')[0]?.trim(),
    req.headers['user-agent'],
    salt
  ].filter(Boolean).join(':')

  return createHash('sha256').update(source || salt).digest('hex')
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}')

  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const body = Buffer.concat(chunks).toString('utf8')
  return body ? JSON.parse(body) : {}
}

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
    const instructions = typeof body.instructions === 'string' && body.instructions.trim()
      ? body.instructions.trim().slice(0, 6000)
      : FALLBACK_INSTRUCTIONS
    const speed = parseSpeed(body.speed)

    const openaiResponse = await fetch(OPENAI_REALTIME_CLIENT_SECRET_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Safety-Identifier': getSafetyIdentifier(req)
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: process.env.OPENAI_REALTIME_MODEL || DEFAULT_MODEL,
          instructions,
          audio: {
            input: {
              turn_detection: { type: 'semantic_vad', eagerness: 'low' },
              transcription: { model: process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe' }
            },
            output: {
              voice: process.env.OPENAI_REALTIME_VOICE || DEFAULT_VOICE,
              speed
            }
          }
        }
      })
    })

    const text = await openaiResponse.text()
    let data
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = { error: text || 'OpenAI returned a non-JSON response.' }
    }

    if (!openaiResponse.ok) {
      res.status(openaiResponse.status).json({
        error: data.error?.message || data.error || 'Failed to create voice session.'
      })
      return
    }

    res.status(200).json(data)
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to create voice session.' })
  }
}
