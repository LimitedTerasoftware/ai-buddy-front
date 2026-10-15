# Device voice APIs — protocol v1

The two device APIs now use one server-side AI Core: WAV validation → transcription → input safety → character/personality/history/memory/skill orchestration → text generation → output safety → streamed speech. No provider key or provider session credential is returned to the device. A phone/browser is not required.

The old examples containing only `instructions` and `speed` do not contain a user utterance or a device identity. PTT now requires recorded audio and metadata. Character instructions are configured by an authenticated admin; arbitrary device-supplied `instructions` are ignored.

## Run locally

Requires Node.js 22 or later. Merge the relevant settings from `.env.example` into your existing `.env`; do not overwrite existing configuration. Generate a different random credential for every device and admin:

```sh
node --input-type=module -e "import {randomBytes,createHash} from 'node:crypto'; const token=randomBytes(32).toString('base64url'); console.log('credential:',token); console.log('sha256:',createHash('sha256').update(token).digest('hex'))"
```

Deliver the device credential through your secure provisioning process. Put its hash, device ID, account/tenant ID and explicit allowed profile/character IDs into `VOICE_DEVICES`. Put a separate admin credential hash and tenant ID into `VOICE_ADMINS`. Example placeholders intentionally cannot authenticate. Configure `OPENAI_API_KEY` only on the service.

```sh
npm install
npm run voice:server
# In another terminal:
npm run dev
```

On PowerShell where script execution is disabled, use `npm.cmd`. The frontend's **Device voice console** opens the admin tools and file-based PTT/WebSocket test client. Credentials remain in component memory and are cleared when the console closes; no local-storage token persistence is used. The legacy **Back to Buddy** browser demo still uses `/api/voice/session`; it is separate from the device protocol and is not a firmware integration endpoint.

## Deploy

For **Vercel-only independent WAV uploads**, follow [Vercel WAV deployment and curl tests](vercel-wav.md). Leave `VOICE_SERVICE_URL` empty and configure `OPENAI_API_KEY` plus `VOICE_DEVICES` on Vercel. That mode has no persistent sessions, memory, WebSockets, cross-request rate limiting or retry deduplication. The deployment and continuity guarantees below apply only when using the persistent service.

Deploy `server/voice/index.js` as a **single persistent Node process** with an encrypted persistent volume for `VOICE_STORE_PATH`. Set `VOICE_HOST=0.0.0.0` if the host requires it, `VOICE_PORT` to its assigned port, `NODE_ENV=production`, and `VOICE_PUBLIC_WS_URL=wss://YOUR_VOICE_HOST/v1/voice/stream`. Terminate TLS at the hosting ingress and forward WebSocket upgrades. Permit only your console origin in `FRONTEND_ORIGIN` (comma-separated). Exclude Authorization and Sec-WebSocket-Protocol headers, audio bodies, query parameters, and transcripts from ingress/access logs.

Deploy the frontend and its `api/voice` proxies on Vercel. Set `VOICE_SERVICE_URL=https://YOUR_VOICE_HOST` and `FRONTEND_ORIGIN=https://ai-buddy-two-iota.vercel.app` there. Configure the HTTP function's maximum duration to allow the 95-second backend timeout, subject to your plan. The POST WebSocket endpoint returns the service's WSS URL; WebSocket audio does not traverse an HTTP proxy function.

The local JSON store and ticket/rate-limit/lock maps are deliberately single-instance prototype components. Do not horizontally scale this service or put the file store in ephemeral function storage. A distributed deployment needs a shared database plus atomic idempotency/session locks and shared one-use credential storage. Vercel now supports WebSocket functions, but its documentation also requires external storage for durable state across instances; adopting that deployment model requires replacing this prototype store. [Vercel WebSocket documentation](https://vercel.com/docs/functions/websockets).

Rotate a device credential by replacing its hash in deployment configuration, then restarting the service. Revoke a device by setting `revoked:true` and restarting. Old connections end on restart, old credentials fail, and pending connection tickets are lost. Lost-device handling uses the same revocation flow. Do not distribute one shared permanent device secret.

## Audio contract

| Setting | PTT input | WebSocket input | Output (both modes) |
| --- | --- | --- | --- |
| Container | Complete RIFF WAV | Raw PCM in JSON base64 | Raw PCM in JSON base64 |
| Encoding | Signed PCM16 little-endian | Signed PCM16 little-endian | Signed PCM16 little-endian |
| Sample rate | 16000 Hz | 16000 Hz | 24000 Hz |
| Channels | 1 | 1 | 1 |
| Limit | 30 s / 960000 PCM bytes, 1.4 MB HTTP body | 30 s total; 640–3200 bytes per input chunk (20–100 ms) | 120 s maximum response |

This is the implemented prototype contract and must be confirmed with hardware. The provider adapter wraps streaming input PCM in WAV at the turn boundary. Output PCM has no WAV header. OpenAI's speech documentation specifies 24 kHz, signed 16-bit PCM and supports streaming response audio. [Official OpenAI speech documentation](https://developers.openai.com/api/docs/guides/text-to-speech).

## API A: push-to-talk

`POST /api/voice/push-to-talk` on the frontend, or `POST /v1/voice/ptt` directly on the service.

Headers: `Authorization: Bearer DEVICE_CREDENTIAL`, `Content-Type: multipart/form-data` or `application/json`, optional `Idempotency-Key` (must match `request_id` if both supplied).

Multipart fields: `audio` file and `metadata` JSON. JSON alternative: same metadata plus `audio_base64` containing the complete WAV file.

Required metadata: `device_id`, `profile_id`, `character_id`, and `request_id` (or `idempotency_key`). IDs use letters, digits, underscores or hyphens, up to 100 characters. `profile_id` must be pseudonymous and explicitly assigned to the device. Optional `session_id` reuses a live session; otherwise one is created. Optional `language` is a two-letter ISO 639-1 code; defaults to the character language. Optional `speed` is 0.25–1.5, default 0.85.

```sh
curl --location 'https://ai-buddy-two-iota.vercel.app/api/voice/push-to-talk' \
  --header "Authorization: Bearer $DEVICE_TOKEN" \
  --form 'audio=@utterance.wav;type=audio/wav' \
  --form 'metadata={"device_id":"device-1","profile_id":"profile-1","character_id":"buddy","request_id":"utterance-001","speed":0.85}'
```

Do not manually add a multipart Content-Type header; curl supplies the boundary. The next turn uses a new `request_id` and the returned `session_id`.

```json
{
  "request_id": "utterance-001",
  "session_id": "server-generated-uuid",
  "status": "completed",
  "transcript_text": "Tell me about dinosaurs",
  "response_text": "Dinosaurs lived long ago!",
  "response_audio": {
    "data": "BASE64_PCM_BYTES",
    "transfer_encoding": "base64",
    "audio_format": "pcm",
    "sample_rate_hz": 24000,
    "channels": 1,
    "encoding": "pcm_s16le"
  },
  "audio_format": "pcm",
  "sample_rate_hz": 24000,
  "channels": 1,
  "encoding": "pcm_s16le",
  "selected_skill": "dinosaurs",
  "safety_status": "passed",
  "latency": { "stt_ms": 0, "llm_ms": 0, "tts_ms": 0, "total_ms": 0 }
}
```

The latency values above are schema examples, not benchmarks. The response also includes configured provider/model IDs, character configuration version, language, and LLM usage when available. The frontend decodes PCM and plays it through Web Audio; firmware must feed decoded bytes to its speaker pipeline at 24 kHz.

### Retries and continuity

Reuse exactly the same metadata and WAV for a network retry. Within 24 hours a repeated key never calls providers again. Different data with the same key gets `idempotency_conflict`; a currently active key gets `request_in_progress`. Completed PTT audio can be replayed from RAM for five minutes. After cache expiry or service restart, the same key returns its transcript/text with `response_audio:null`, `replayed:true`, `audio_expired:true`; it never generates billable audio again. Cache the completed response on the device if you need longer playback retries.

If a request may have reached a provider but did not complete, the persistent reservation yields `request_interrupted` for retries rather than silently charging again. Start a deliberate new recording with a new key. Idempotency keys expire after 24 hours and must never be reused for a new turn. Sessions also expire after 24 hours; only the most recent ten completed turns are passed to the model. Expired sessions get `session_expired` and must be replaced.

## API B: WebSocket session and streaming

First obtain a credential:

```sh
curl --location 'https://ai-buddy-two-iota.vercel.app/api/voice/websocket' \
  --header "Authorization: Bearer $DEVICE_TOKEN" \
  --header 'Content-Type: application/json' \
  --data '{"device_id":"device-1","profile_id":"profile-1","character_id":"buddy","language":"en","speed":0.85}'
```

This returns `websocket_url`, `session_id`, `session_credential`, `expires_at` (Unix milliseconds), `websocket_subprotocols`, protocol/audio settings, and limits. The credential expires in 60 seconds and is usable once. Connect with `Sec-WebSocket-Protocol: voice.v1, ticket.CREDENTIAL`; the server selects `voice.v1`. Do not put credentials in URLs. In a browser: `new WebSocket(result.websocket_url, result.websocket_subprotocols)`.

Send `session.start` with exactly the identity/session/language used for the credential and negotiated settings:

```json
{
  "type": "session.start",
  "protocol_version": "1",
  "device_id": "device-1",
  "profile_id": "profile-1",
  "character_id": "buddy",
  "session_id": "RETURNED_SESSION_ID",
  "language": "en",
  "input_audio": { "audio_format": "pcm", "sample_rate_hz": 16000, "channels": 1, "encoding": "pcm_s16le" },
  "output_audio": { "audio_format": "pcm", "sample_rate_hz": 24000, "channels": 1, "encoding": "pcm_s16le" }
}
```

Wait for `session.ready`. Send JSON `audio.input` chunks, starting at sequence zero for each new turn, then `audio.input.end`:

```json
{"type":"audio.input","sequence":0,"data":"BASE64_20_TO_100_MS_PCM"}
```

```json
{"type":"audio.input.end","request_id":"utterance-002"}
```

| Server event | Fields / behavior |
| --- | --- |
| `session.ready` | Session ID, protocol, audio settings, connection expiry |
| `input.transcript.final` | `request_id`, `transcript_text` |
| `response.started` | `request_id` |
| `response.text.final` | `request_id`, `response_text` after output safety |
| `audio.output.chunk` | `request_id`, monotonic `sequence`, base64 `data`, output audio settings |
| `response.completed` | Final transcript/text, request/session IDs, status, safety, skills, latency/usage; streamed audio is not duplicated in this event |
| `pong` | Reply to application `ping` |
| `error` | Request ID when available, stable `error.code`, safe message, recoverability |

Partial transcript/text events are optional and not emitted in v1: input transcription happens after the explicit end-of-turn marker, and full text is checked before speech starts. There is no server VAD. Speech output streams as the TTS provider supplies bytes, in chunks of at most 100 ms. Playback must queue chunks by sequence and ignore chunks from cancelled request IDs.

Send `response.cancel` to abort the active turn and clear pending input. The server sends a recoverable `response_cancelled` error for an active cancellation; wait for that before submitting another turn. Already delivered audio must be stopped locally. Only completed turns enter conversation history. Input during an active response gets `session_busy`; interruption is explicit. Up to two connections per device are allowed. The server uses WebSocket ping/pong every 20 seconds, a 120-second application idle timeout, and a 15-minute connection lifetime. Firmware must respond to protocol ping frames.

On disconnect, discard partial recording/playback; buffered input is not persisted and an interrupted response is not added to history. Reconnect with a new short-lived credential, the same live conversation ID, and exponential backoff (1–30 seconds). Restart the utterance with a new request ID. An old completed WebSocket request can return replayed text/status without re-synthesizing audio. There is no mid-audio resume.

## Admin configuration and memory

All endpoints require a separate admin Bearer credential and are tenant scoped. They are available through the frontend proxy and directly on the service.

| Endpoint | Contract |
| --- | --- |
| `GET /api/voice/admin` | Assigned devices/last-seen/connectivity, characters, personalities, skills and latest 50 turn metadata entries |
| `PUT /api/voice/admin/character` | `character_id`, `display_name`, `instructions`, `voice`, `language`, `personality`, `enabled_skills`; server increments configuration version and enforces child safety |
| `POST /api/voice/admin/memory` | `profile_id`; returns saved preferences |
| `PUT /api/voice/admin/memory` | `profile_id`, `text`, `consent:true`, optional `id` to edit; safety checked, maximum 50 memories, 500 characters each |
| `DELETE /api/voice/admin/memory` | `profile_id`, optional `id`; deletes a preference or all preferences, and clears associated sessions, request records, cached generated audio and diagnostics |

Memory is saved only through explicit parent/admin action, never automatically from a child's speech. Relevant preferences are retrieved by keyword overlap; prototype skills are prompt-based and enabled server-side, not arbitrary tool execution. Memory remains until forgotten; history/request metadata last 24 hours; diagnostic turn metadata lasts up to 24 hours with a 200-entry global cap. Forget is rejected while that profile has an active turn. The console can inspect the last test's transcript and response, but routine diagnostic logs include only pseudonymous IDs, providers, stage latencies and outcomes.

Provider implementation lives in `server/voice/provider.js`; STT, LLM, TTS and moderation models are selected through backend environment settings. `VoiceCore` takes an injected provider adapter so another vendor can implement `transcribe`, `safe`, `generate`, and streaming `speak` without firmware changes. Only the OpenAI adapter is implemented in this release. Uploaded raw audio is never stored on disk. Provider-side retention is governed separately by the configured provider/account settings.

## Errors, timeouts and firmware behavior

Errors use `{ "status":"error", "error":{"code":"...","message":"...","recoverable":true} }`. Categories include `invalid_audio`, `unsupported_format`, `too_long`, `unauthorized_device`, `rate_limited`, `upstream_timeout`, `generation_failed`, `internal_error`, `session_busy`, `session_expired`, `invalid_sequence`, `response_cancelled`, `request_in_progress`, `request_interrupted`, and `idempotency_conflict`.

The upload deadline is 30 seconds; stage deadlines are 20 seconds STT, 30 seconds LLM, 30 seconds TTS, 15 seconds per safety check; a full turn has a 90-second deadline. Each device is limited to 12 newly processed turns/minute. Failed provider responses never expose vendor error bodies. Unsafe input/output gets a child-safe fallback. The output safety classifier does not replace age-appropriate prompt guidance or parent review.

Firmware should indicate recording, processing and playback, stop at its 30-second recording limit, keep bounded input/output buffers, stop playback on cancellation/disconnect, and show recoverable failures. Device playback/battery/firmware telemetry is not fabricated by this backend. Hardware integration, Wi-Fi-loss tests, playback timing, and measured latency targets still require device-team validation.

## Verification

`npm test` covers HTTP JSON/multipart PTT, audio rejection, retry deduplication, session continuity, character/skill/memory changes, tenant isolation, consent/forget, output framing, multi-turn WebSocket, cancellation and single-use credentials using a mock provider. `npm run lint` and `npm run build` validate the frontend. These do not prove live provider availability, deployed ingress behavior, physical recording/playback or child-safety coverage. Run the same flows in the console with configured credentials and a hardware-produced WAV before firmware sign-off.
