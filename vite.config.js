import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/voice/push-to-talk': 'http://127.0.0.1:8787',
      '/api/voice/websocket': 'http://127.0.0.1:8787',
      '/api/voice/admin': 'http://127.0.0.1:8787',
      '/api/voice/health': { target: 'http://127.0.0.1:8787', rewrite: () => '/health' },
      '/v1/voice': { target: 'http://127.0.0.1:8787', ws: true }
    }
  },
})
