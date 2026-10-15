import { useEffect, useRef, useState } from 'react'
import './DeviceVoiceConsole.css'

const base = import.meta.env.VITE_DEVICE_VOICE_API_URL || ''
const wavCharacter = { character_id: 'buddy', display_name: 'AI Buddy', language: 'en', voice: 'marin',
  personality: 'Friendly', instructions: 'You are AI Buddy.', enabled_skills: [] }
const toBase64 = bytes => {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return btoa(binary)
}

export default function DeviceVoiceConsole() {
  const [adminToken, setAdminToken] = useState(''), [deviceToken, setDeviceToken] = useState('')
  const [data, setData] = useState(null), [character, setCharacter] = useState(null)
  const [deviceId, setDeviceId] = useState(''), [profileId, setProfileId] = useState('')
  const [sessionId, setSessionId] = useState(''), [file, setFile] = useState(null)
  const [memories, setMemories] = useState([]), [memoryText, setMemoryText] = useState(''), [memoryId, setMemoryId] = useState('')
  const [consent, setConsent] = useState(false), [status, setStatus] = useState('Ready'), [error, setError] = useState('')
  const [result, setResult] = useState(null), [busy, setBusy] = useState(false)
  const socket = useRef(null), player = useRef(null), playAt = useRef(0), request = useRef(null)
  const stateless = data?.mode === 'stateless'
  useEffect(() => () => {
    request.current?.abort(); socket.current?.close(); player.current?.close()
  }, [])
  async function api(path, method = 'GET', body, token = adminToken, signal) {
    const response = await fetch(`${base}/api/voice/${path}`, { method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal })
    const responseData = await response.json()
    if (!response.ok) throw new Error(responseData.error?.message || 'Request failed.')
    return responseData
  }
  async function action(fn) {
    setError('')
    try { await fn() } catch (err) { setError(err.message); setStatus('Ready') }
  }
  async function load() {
    const next = await api('admin')
    setData(next)
    if (!character) setCharacter(next.characters[0])
  }
  async function loadMemories() {
    const next = await api('admin/memory', 'POST', { profile_id: profileId })
    setMemories(next.memories)
  }
  async function play(chunk) {
    if (!player.current) player.current = new AudioContext({ sampleRate: 24000 })
    await player.current.resume()
    const raw = Uint8Array.from(atob(chunk.data), char => char.charCodeAt(0))
    const view = new DataView(raw.buffer), buffer = player.current.createBuffer(1, raw.length / 2, 24000)
    const channel = buffer.getChannelData(0)
    for (let index = 0; index < channel.length; index++) channel[index] = view.getInt16(index * 2, true) / 32768
    const source = player.current.createBufferSource()
    source.buffer = buffer; source.connect(player.current.destination)
    playAt.current = Math.max(playAt.current, player.current.currentTime + 0.03)
    source.start(playAt.current); playAt.current += buffer.duration
  }
  function stop() {
    request.current?.abort()
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: 'response.cancel' }))
    socket.current?.close(); socket.current = null
    player.current?.close(); player.current = null; playAt.current = 0
    setBusy(false); setStatus('Stopped')
  }
  async function test(mode) {
    if (!file || !character) throw new Error('Select a character and a 16 kHz mono PCM16 WAV recording.')
    if (file.size > 964096) throw new Error('Use a recording of 30 seconds or less.')
    if (!player.current) player.current = new AudioContext({ sampleRate: 24000 })
    await player.current.resume()
    const recording = new Uint8Array(await file.arrayBuffer())
    const metadata = { device_id: deviceId, profile_id: profileId, character_id: character.character_id,
      language: character.language, speed: 0.85, ...(sessionId ? { session_id: sessionId } : {}) }
    const request_id = crypto.randomUUID()
    setBusy(true); setResult(null); setStatus('Processing'); setError('')
    try {
      if (mode === 'ptt') {
        request.current = new AbortController()
        const turn = await api('push-to-talk', 'POST', { ...metadata, request_id, audio_base64: toBase64(recording) }, deviceToken, request.current.signal)
        setSessionId(turn.session_id || ''); setResult(turn); setStatus('Playback')
        if (turn.response_audio) await play(turn.response_audio)
        setBusy(false)
        return
      }
      // WAV parsing for the test client; the backend independently validates uploaded PTT audio.
      const view = new DataView(recording.buffer)
      if (recording.length < 44 || String.fromCharCode(...recording.subarray(0, 4)) !== 'RIFF') throw new Error('Select a complete WAV file.')
      let pcm, validFormat = false
      for (let offset = 12; offset + 8 <= recording.length;) {
        const size = view.getUint32(offset + 4, true), start = offset + 8
        if (start + size > recording.length) throw new Error('WAV is truncated.')
        const type = String.fromCharCode(...recording.subarray(offset, offset + 4))
        if (type === 'fmt ' && size >= 16) validFormat = view.getUint16(start, true) === 1 && view.getUint16(start + 2, true) === 1 &&
          view.getUint32(start + 4, true) === 16000 && view.getUint16(start + 14, true) === 16
        if (type === 'data') pcm = recording.subarray(start, start + size)
        offset = start + size + size % 2
      }
      if (!validFormat || !pcm?.length || pcm.length > 960000 || pcm.length % 2) throw new Error('Use 16 kHz mono PCM16 WAV, up to 30 seconds.')
      if (!socket.current || socket.current.readyState !== WebSocket.OPEN) {
        const session = await api('websocket', 'POST', metadata, deviceToken)
        setSessionId(session.session_id)
        const ws = new WebSocket(session.websocket_url, session.websocket_subprotocols)
        socket.current = ws
        await new Promise((resolve, reject) => {
          ws.onopen = () => ws.send(JSON.stringify({ ...metadata, session_id: session.session_id, language: metadata.language,
            type: 'session.start', protocol_version: '1', input_audio: session.input_audio, output_audio: session.output_audio }))
          ws.onerror = () => reject(new Error('WebSocket connection failed.'))
          ws.onclose = () => { reject(new Error('WebSocket disconnected. Restart the turn.')); setBusy(false); setStatus('Disconnected') }
          ws.onmessage = event => {
            const payload = JSON.parse(event.data)
            if (payload.type === 'session.ready') resolve()
            if (payload.type === 'error') reject(new Error(payload.error.message))
          }
        })
      }
      const ws = socket.current
      ws.onmessage = event => {
        const payload = JSON.parse(event.data)
        if (payload.type === 'audio.output.chunk') { setStatus('Playback'); play(payload).catch(err => setError(err.message)) }
        if (payload.type === 'input.transcript.final' || payload.type === 'response.text.final') setResult(previous => ({ ...previous, ...payload }))
        if (payload.type === 'response.completed') { setResult(payload); setBusy(false); setStatus('Turn complete — connection ready') }
        if (payload.type === 'error') { setError(payload.error.message); setBusy(false); setStatus('Ready') }
      }
      let sequence = 0
      for (let offset = 0; offset < pcm.length; offset += 1600) {
        let chunk = pcm.subarray(offset, Math.min(offset + 1600, pcm.length))
        if (chunk.length < 640) { const padded = new Uint8Array(640); padded.set(chunk); chunk = padded }
        ws.send(JSON.stringify({ type: 'audio.input', sequence: sequence++, data: toBase64(chunk) }))
      }
      ws.send(JSON.stringify({ type: 'audio.input.end', request_id }))
    } catch (err) { socket.current?.close(); socket.current = null; setBusy(false); throw err }
  }
  function edit(field, value) { setCharacter(current => ({ ...current, [field]: value })); setSessionId(''); stop() }
  return <section className="device-console">
    <h1>Device voice console</h1>
    <p>Configure your character, review saved preferences, and test the device’s voice APIs. Responses use an AI-generated voice.</p>
    <div className="device-console-grid">
      <label>Admin credential<input type="password" autoComplete="off" value={adminToken} onChange={event => setAdminToken(event.target.value)} /></label>
      <button onClick={() => action(load)}>Connect / refresh</button>
      <button onClick={() => { stop(); setSessionId(''); setCharacter(wavCharacter); setData({ mode: 'stateless', characters: [wavCharacter], personalities: ['Friendly'], skills: [], devices: [], turns: [] }) }}>Test WAV upload only</button>
    </div>
    {error && <p role="alert" className="device-console-error">{error}</p>}
    {data && <>
      {stateless && <p>WAV uploads use independent turns with the default Buddy character. Saved settings, memory and device WebSockets require a persistent backend. Retrying an upload can incur another provider charge.</p>}
      <h2>Character</h2>
      <label>Selected character<select value={character?.character_id || ''} onChange={event => { stop(); setSessionId(''); setCharacter(data.characters.find(item => item.character_id === event.target.value)) }}>{data.characters.map(item => <option key={item.character_id}>{item.character_id}</option>)}</select></label>
      {character && <fieldset disabled={stateless} className="device-console-grid">
        <label>Display name<input value={character.display_name} onChange={event => edit('display_name', event.target.value)} /></label>
        <label>Personality<select value={character.personality} onChange={event => edit('personality', event.target.value)}>{data.personalities.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Language<input maxLength={2} value={character.language} onChange={event => edit('language', event.target.value)} /></label>
        <label>Voice<select value={character.voice} onChange={event => edit('voice', event.target.value)}>{['marin','cedar','alloy','ash','ballad','coral','echo','fable','onyx','nova','sage','shimmer','verse'].map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="device-console-wide">Character instructions<textarea value={character.instructions} onChange={event => edit('instructions', event.target.value)} /></label>
        <fieldset className="device-console-wide"><legend>Enabled skills</legend>{data.skills.map(id => <label key={id}><input type="checkbox" checked={character.enabled_skills.includes(id)} onChange={event => edit('enabled_skills', event.target.checked ? [...character.enabled_skills, id] : character.enabled_skills.filter(item => item !== id))} />{id}</label>)}</fieldset>
        <button onClick={() => action(async () => { setCharacter(await api('admin/character', 'PUT', character)); await load(); setStatus('Character saved') })}>Save character</button>
      </fieldset>}
      <h2>Test a conversation</h2>
      <div className="device-console-grid">
        <label>Device credential<input type="password" autoComplete="off" value={deviceToken} onChange={event => { stop(); setDeviceToken(event.target.value); setSessionId('') }} /></label>
        <label>Device ID<input value={deviceId} onChange={event => { stop(); setDeviceId(event.target.value); setSessionId('') }} /></label>
        <label>Profile ID<input value={profileId} onChange={event => { stop(); setProfileId(event.target.value); setSessionId(''); setMemories([]) }} /></label>
        <label>Recording (16 kHz mono PCM16 WAV)<input type="file" accept=".wav" onChange={event => setFile(event.target.files[0])} /></label>
      </div>
      <p role="status">{status} · Session: {sessionId || 'new'}</p>
      <div className="device-console-actions">
        <button disabled={busy} onClick={() => action(() => test('ptt'))}>Send push-to-talk</button>
        <button disabled={busy || stateless} onClick={() => action(() => test('websocket'))}>Send WebSocket turn</button>
        <button onClick={stop}>Stop / disconnect</button>
        <button onClick={() => { stop(); setSessionId(''); setResult(null) }}>New conversation</button>
      </div>
      {result && <div><p><strong>You:</strong> {result.transcript_text}</p><p><strong>Buddy:</strong> {result.response_text}</p><details><summary>Turn diagnostics</summary><pre>{JSON.stringify({ ...result, response_audio: undefined }, null, 2)}</pre></details></div>}
      {!stateless && <><h2>Saved preferences</h2>
      <p>Save only safe preferences with parent consent. Forgetting also clears this profile’s conversation history.</p>
      <button onClick={() => action(loadMemories)}>Review profile memory</button>
      {memories.map(item => <div className="device-console-memory" key={item.id}><span>{item.text}</span><button onClick={() => { setMemoryId(item.id); setMemoryText(item.text) }}>Edit</button><button onClick={() => action(async () => { await api('admin/memory', 'DELETE', { profile_id: profileId, id: item.id }); stop(); setSessionId(''); await loadMemories() })}>Forget</button></div>)}
      <label>Preference<input maxLength={500} value={memoryText} onChange={event => setMemoryText(event.target.value)} /></label>
      <label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> Parent/admin consent to save this preference</label>
      <div className="device-console-actions"><button disabled={!consent} onClick={() => action(async () => { await api('admin/memory', 'PUT', { profile_id: profileId, text: memoryText, consent, ...(memoryId ? { id: memoryId } : {}) }); setMemoryId(''); setMemoryText(''); await loadMemories() })}>Save preference</button>
      <button onClick={() => action(async () => { await api('admin/memory', 'DELETE', { profile_id: profileId }); stop(); setSessionId(''); await loadMemories() })}>Forget profile data</button></div>
      <h2>Device connectivity</h2>
      <ul>{data.devices.map(item => <li key={item.device_id}>{item.device_id} · {item.revoked ? 'Revoked' : `${item.connections} active connections`} · Last seen: {item.last_seen ? new Date(item.last_seen).toLocaleString() : 'Never'}</li>)}</ul>
      <details><summary>Recent turn latency and outcomes</summary><pre>{JSON.stringify(data.turns, null, 2)}</pre></details></>}
    </>}
  </section>
}
