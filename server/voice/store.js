import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// Single-instance prototype store. Deploy on an encrypted persistent volume.
export class VoiceStore {
  constructor(path) {
    this.path = path
    this.data = { characters: {}, sessions: {}, memories: {}, requests: {}, devices: {}, turns: [] }
    if (path) {
      try { this.data = { ...this.data, ...JSON.parse(readFileSync(path, 'utf8')) } }
      catch (error) { if (error.code !== 'ENOENT') throw error }
    }
  }
  save() {
    if (!this.path) return
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(`${this.path}.tmp`, JSON.stringify(this.data), { mode: 0o600 })
    renameSync(`${this.path}.tmp`, this.path)
  }
  prune(now = Date.now()) {
    for (const [key, value] of Object.entries(this.data.sessions)) if (value.expires_at <= now) delete this.data.sessions[key]
    for (const [key, value] of Object.entries(this.data.requests)) if (value.expires_at <= now) delete this.data.requests[key]
    this.data.turns = this.data.turns.filter(turn => turn.timestamp > now - 86400000).slice(-200)
    this.save()
  }
}
