import { createVercelStreamServer } from '../../server/voice/vercelStream.js'

// Vercel's WebSocket runtime accepts an exported Node HTTP server.
export default createVercelStreamServer()
