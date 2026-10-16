# Native Vercel voice streaming

This deployment runs `/api/voice/stream` as a Node HTTP server with WebSocket upgrades, using Vercel's WebSocket Functions support. It does not need a separate persistent Node host. See [Vercel WebSockets](https://vercel.com/docs/functions/websockets).

## Configure the backend project

For `ai-buddy-backend-ten.vercel.app`, set these **Production** environment variables and redeploy the updated code:

| Variable | Value |
| --- | --- |
| `VOICE_DEVICES` | Your existing device identities and SHA-256 token hashes |
| `OPENAI_API_KEY` | Your existing server-side provider key |
| `UPSTASH_REDIS_REST_URL` | HTTPS REST URL from an Upstash Redis database |
| `UPSTASH_REDIS_REST_TOKEN` | The database's read/write REST token |
| `VOICE_PUBLIC_WS_URL` | `wss://ai-buddy-backend-ten.vercel.app/api/voice/stream` |
| `FRONTEND_ORIGIN` | Your frontend origin, such as `https://ai-buddy-two-iota.vercel.app` |
| `VOICE_SERVICE_URL` | **Unset/empty** on this backend project |

Connect an Upstash Redis database through Vercel Marketplace or supply its REST variables. `KV_REST_API_URL` and `KV_REST_API_TOKEN` are also accepted. Keep credentials on the server. The read-only token cannot issue or consume tickets. See [Upstash REST API](https://upstash.com/docs/redis/features/restapi).

The frontend project can set `VOICE_SERVICE_URL=https://ai-buddy-backend-ten.vercel.app` to proxy its HTTP requests to this backend. Never point the backend to itself. Audio travels directly over WSS to the backend, bypassing the frontend HTTP proxy.

## Connect

1. POST identity metadata with the device Bearer token to `https://ai-buddy-backend-ten.vercel.app/api/voice/websocket`.
2. Open the returned `websocket_url` with the returned `websocket_subprotocols`.
3. Send `session.start` with the same identity, returned session ID and audio contract; wait for `session.ready`.
4. Push `audio.input` JSON messages containing base64 raw 16 kHz mono PCM16 chunks of 20–100 ms. Sequence starts at zero for each turn. Maximum input is 30 seconds.
5. Send `audio.input.end` with a fresh request ID. Queue `audio.output.chunk` events for 24 kHz PCM16 playback. Wait for `response.completed` before starting another turn.

The payloads are the same as [API B](voice-api.md#api-b-websocket-session-and-streaming). Input streams live, but transcription and response generation start at `audio.input.end`; there is no automatic speech-end detection.

For the built-in file test, open **Device voice console → Test device audio**. The console checks health and enables the WebSocket button when Redis variables are configured. Health is configuration discovery, not a live provider/Redis connectivity check.

## Lifetime and storage

- Tickets expire after 60 seconds and are consumed atomically in Redis, including when the HTTP request and upgrade reach different instances. Failed upgrades need a fresh ticket.
- Each device can create four tickets per minute and open two simultaneous connections. Connection leases expire after a crashed function, within 290 seconds.
- Each socket has its own conversation history and in-memory retry cache. Multiple turns on that socket share history. There is no shared conversation history across sockets.
- Connections close after at most 290 seconds, before the configured 300-second Vercel function limit. Idle timeout is still 120 seconds. Reconnect with a new ticket and omit `session_id`; this starts a fresh conversation. Do not automatically resend an interrupted turn: it may already have incurred provider charges.
- Saved memory, editable characters, continuity after reconnect, and durable idempotency remain features of the persistent service. Redis stores only short-lived handshake metadata and connection leases, not audio or transcripts.
- The 12-turns/minute processing limit applies per connection, not globally across instances. Configure account-level traffic and spending limits separately.

## Verify after redeployment

```sh
curl https://ai-buddy-backend-ten.vercel.app/api/voice/health

curl https://ai-buddy-backend-ten.vercel.app/api/voice/websocket \
  -H "Authorization: Bearer $DEVICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"device_id":"device-1","profile_id":"profile-1","character_id":"buddy","language":"en"}'
```

Health should advertise `capabilities.websocket: true`. The POST should return `mode: "vercel-websocket"` and a WSS URL ending in `/api/voice/stream`. Then test an actual upgrade and audio turn. A successful HTTP POST alone does not verify deployed WebSocket routing, provider availability or playback.
