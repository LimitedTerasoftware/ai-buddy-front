import { randomBytes, createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { handleServerlessVoice } from '../server/voice/serverless.js'

const token = randomBytes(32).toString('base64url')
const devices = JSON.stringify([{ device_id: 'device-1', tenant_id: 'account-1', profile_ids: ['profile-1'], character_ids: ['buddy'], token_sha256: createHash('sha256').update(token).digest('hex'), revoked: false }])
let env = readFileSync('.env', 'utf8')
const line = `VOICE_DEVICES='${devices}'`
env = /^VOICE_DEVICES\s*=/m.test(env) ? env.replace(/^VOICE_DEVICES\s*=.*$/m, line) : `${env.trimEnd()}\n${line}\n`
writeFileSync('.env', env)
writeFileSync('.env.vercel.voice.local', `${line}\n`)
writeFileSync('.env.device-token.local', `DEVICE_TOKEN=${token}\n`)
await assert.rejects(() => handleServerlessVoice({ headers: { authorization: 'Bearer invalid-token' } }, {}, '/api/voice/websocket', { VOICE_DEVICES: devices }), e => e.code === 'unauthorized_device')
console.log('PASS: device configuration accepted; invalid credentials rejected. Local configuration and Vercel import file prepared; token saved separately.')
