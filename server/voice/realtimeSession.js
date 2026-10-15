import { createHash } from 'node:crypto'

const OPENAI_REALTIME_CLIENT_SECRET_URL = 'https://api.openai.com/v1/realtime/client_secrets'
const DEFAULT_MODEL = 'gpt-realtime'
const DEFAULT_VOICE = 'marin'
const FALLBACK_INSTRUCTIONS = 'You are AI Buddy, a warm, patient learning companion for young children. Keep replies short, kind, and age appropriate.'
const DEFAULT_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe'
const WEBSOCKET_BASE_URL = 'wss://api.openai.com/v1/realtime'

export function setCorsHeaders(req, res) {
  const origin = req.headers.origin
  const allowedOrigins = [
    ...(process.env.FRONTEND_ORIGIN || '').split(',').map(value => value.trim()),
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '',
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '',
    'https://ai-buddy-two-iota.vercel.app',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ].filter(Boolean)

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export function parseSpeed(value) {
  const speed = Number(value)
  if (!Number.isFinite(speed)) return 0.85
  return Math.min(1.5, Math.max(0.25, speed))
}

export function getInstructions(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 6000)
    : FALLBACK_INSTRUCTIONS
}

export function getRealtimeModel() {
  return process.env.OPENAI_REALTIME_MODEL || DEFAULT_MODEL
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

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}')

  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const body = Buffer.concat(chunks).toString('utf8')
  return body ? JSON.parse(body) : {}
}

export function buildRealtimeSession({ instructions, speed, turnDetection, metadata }) {
  return {
    type: 'realtime',
    model: getRealtimeModel(),
    instructions,
    audio: {
      input: {
        turn_detection: turnDetection,
        transcription: { model: process.env.OPENAI_TRANSCRIPTION_MODEL || DEFAULT_TRANSCRIPTION_MODEL }
      },
      output: {
        voice: process.env.OPENAI_REALTIME_VOICE || DEFAULT_VOICE,
        speed
      }
    },
    ...(metadata ? { metadata } : {})
  }
}

export async function createRealtimeClientSecret(req, session) {
  const openaiResponse = await fetch(OPENAI_REALTIME_CLIENT_SECRET_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
      'OpenAI-Safety-Identifier': getSafetyIdentifier(req)
    },
    body: JSON.stringify({ session })
  })

  const text = await openaiResponse.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { error: text || 'OpenAI returned a non-JSON response.' }
  }

  if (!openaiResponse.ok) {
    const message = data.error?.message || data.error || 'Failed to create voice session.'
    const error = new Error(message)
    error.status = openaiResponse.status
    throw error
  }

  return data
}

export function getWebSocketUrl(model = getRealtimeModel()) {
  return `${WEBSOCKET_BASE_URL}?model=${encodeURIComponent(model)}`
}
