# Vercel-only WAV testing

Deploy this `frontend` folder as the Vercel project root for https://ai-buddy-two-iota.vercel.app. `vercel.json` selects Vite, builds `dist`, and gives the Node API functions 120 seconds. Use Node.js 22 or later in Vercel project settings.

## Production environment variables

Set these in **Vercel → Project → Settings → Environment Variables → Production**, then redeploy:

| Variable | Value |
| --- | --- |
| `OPENAI_API_KEY` | Your provider key, server only |
| `VOICE_DEVICES` | JSON below, with your generated token's SHA-256 hash |
| `FRONTEND_ORIGIN` | `https://ai-buddy-two-iota.vercel.app` |
| `VOICE_SERVICE_URL` | Leave unset or empty for Vercel-only WAV processing |

Generate a device token and its hash locally (works in PowerShell and Bash):

```sh
node --input-type=module -e "import {randomBytes,createHash} from 'node:crypto'; const token=randomBytes(32).toString('base64url'); console.log('DEVICE_TOKEN:',token); console.log('SHA256:',createHash('sha256').update(token).digest('hex'))"
```

Keep the token for the Authorization header. Paste only its hash into `VOICE_DEVICES` as a single JSON string, without wrapping shell quotes in the Vercel UI:

```json
[{"device_id":"device-1","tenant_id":"account-1","profile_ids":["profile-1"],"character_ids":["buddy"],"token_sha256":"PASTE_SHA256_HERE","revoked":false}]
```

Optional model overrides are in `.env.example`. `VOICE_ADMINS` is optional: WAV testing does not require an admin. Keep `VITE_DEVICE_VOICE_API_URL` empty for same-origin API calls. The browser Buddy demo separately needs `OPENAI_API_KEY` on Vercel as well.

## APIs

| Method and path | Purpose |
| --- | --- |
| `GET /api/voice/health` | Liveness and deployment capabilities; does not call or verify the provider |
| `POST /api/voice/push-to-talk` | Authenticated WAV → transcript, reply text, base64 speech |

Input must be a complete WAV, **16 kHz, mono, signed PCM16**, at most **30 seconds**. Convert a recording if needed:

```sh
ffmpeg -i recording.wav -t 30 -ac 1 -ar 16000 -c:a pcm_s16le test.wav
```

### Bash / macOS / Linux curl

```sh
export DEVICE_TOKEN='PASTE_GENERATED_DEVICE_TOKEN'
curl --fail-with-body 'https://ai-buddy-two-iota.vercel.app/api/voice/health'

curl --fail-with-body --max-time 120 \
  'https://ai-buddy-two-iota.vercel.app/api/voice/push-to-talk' \
  -H "Authorization: Bearer $DEVICE_TOKEN" \
  -F 'audio=@test.wav;type=audio/wav' \
  -F 'metadata={"device_id":"device-1","profile_id":"profile-1","character_id":"buddy","request_id":"wav-test-001","language":"en","speed":0.85}' \
  -o response.json
```

### Windows PowerShell curl

Using a metadata file avoids differences in native argument quoting between PowerShell versions:

```powershell
$deviceToken = 'PASTE_GENERATED_DEVICE_TOKEN'
'{"device_id":"device-1","profile_id":"profile-1","character_id":"buddy","request_id":"wav-test-001","language":"en","speed":0.85}' | Set-Content -Encoding ascii metadata.json
curl.exe --fail-with-body 'https://ai-buddy-two-iota.vercel.app/api/voice/health'
curl.exe --fail-with-body --max-time 120 'https://ai-buddy-two-iota.vercel.app/api/voice/push-to-talk' -H "Authorization: Bearer $deviceToken" -F 'audio=@test.wav;type=audio/wav' -F 'metadata=<metadata.json' -o response.json
$reply = Get-Content -Raw response.json | ConvertFrom-Json
$reply.transcript_text
$reply.response_text
```

Do not manually set multipart Content-Type; curl supplies its boundary. JSON uploads with the same fields plus `audio_base64` are also supported. `401` means a missing, unknown or revoked device token; `403` means the device/profile/character or browser origin is not allowed; `400` means invalid metadata or WAV format; `413` means an oversized body; `503` means missing server configuration or a feature requiring the persistent service.

## Decode the reply

A successful response has `status: "completed"`, `transcript_text`, `response_text`, and `response_audio.data`. Speech is **base64 raw PCM16, 24 kHz, mono**, with no WAV header. Use Python to save a playable WAV:

```sh
python -c "import json,base64,wave; r=json.load(open('response.json')); a=r['response_audio']; w=wave.open('reply.wav','wb'); w.setnchannels(a['channels']); w.setsampwidth(2); w.setframerate(a['sample_rate_hz']); w.writeframes(base64.b64decode(a['data'])); w.close()"
```

In the web app choose **Device voice console → Test device audio**, enter your device credential, `device-1`, `profile-1`, and select the WAV. The console plays the response.

## Vercel-only behavior

Each request is an independent turn with the default Buddy character. Responses explicitly return `mode: "stateless"`, `session_id: null`, and `idempotency_supported: false`. Omit `session_id`. No session, transcript, memory, ticket or credential is saved to local disk. Repeating a request, even with the same request ID, can call and charge providers again; do not configure automatic POST retries. Request IDs are for correlation only in this mode. The persistent service's 12-turns/minute limit does not span serverless invocations; configure production traffic limits in Vercel Firewall and provider spending limits.

Output is limited to 60 seconds of PCM so the base64 JSON remains below Vercel's 4.5 MB function response limit. Excess output returns a structured error. [Vercel function limits](https://vercel.com/docs/functions/limitations).

For WebSocket audio on Vercel, follow [native Vercel WebSocket setup](vercel-websocket.md). Saved memory, editable characters and durable idempotency remain available through the optional persistent backend described in [voice-api.md](voice-api.md). Setting `VOICE_SERVICE_URL` switches those endpoints back to proxy mode. Do not set it to this same Vercel app URL, which would create a proxy loop.

Local `npm run dev` still proxies device routes to `npm run voice:server`. To exercise the Vercel-only handlers locally, use Vercel CLI `vercel dev` with `VOICE_SERVICE_URL` unset.
