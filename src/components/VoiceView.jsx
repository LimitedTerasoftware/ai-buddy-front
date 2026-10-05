import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import {
  LogIn,
  LogOut,
  Menu,
  X,
  Bot,
  BrainCircuit,
  Gamepad2,
  Heart,
  Home,
  Loader,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Play,
  Sparkles,
  Smile,
  Check,
  User,
  Volume2,
  WandSparkles
} from 'lucide-react'
import { CLASS_LEVELS, STORY_TOPICS, getChildInstructions, getStoryPrompt } from './voiceLearning'
import { ANIMAL_CHARACTERS } from './animalCharacters'

const AnimalPlayground = lazy(() => import('./AnimalPlayground'))

const REALTIME_CALL_URL = 'https://api.openai.com/v1/realtime/calls'
const QUICK_ACTIVITIES = [
  { label: 'Tell a story', prompt: 'Tell me a short, child-friendly adventure story with a happy ending.' },
  { label: 'Ask a question', prompt: 'I would like to ask you a question. Ask me what I am curious about and wait for my question.' },
  { label: 'Practice reading', prompt: 'Help me practice reading. Give me one short, simple sentence to read aloud, then wait for me and offer gentle feedback.' }
]
const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'voice', label: 'Voice Chat', icon: Mic },
  { id: 'stories', label: 'Stories', icon: Sparkles },
  { id: 'activities', label: 'Activities', icon: Gamepad2 },
  { id: 'characters', label: 'Characters', icon: Smile },
  { id: 'progress', label: 'Progress', icon: Heart }
]
const CHARACTER_OPTIONS = ANIMAL_CHARACTERS
const DEFAULT_CHARACTER = { appearance: 'puppy', name: 'Buddy' }

function readCharacter() {
  try {
    const saved = JSON.parse(sessionStorage.getItem('ai-buddy-character'))
    if (CHARACTER_OPTIONS.some(option => option.id === saved?.appearance) && typeof saved.name === 'string' && saved.name.trim()) {
      return { appearance: saved.appearance, name: saved.name.trim().slice(0, 32) }
    }
  } catch { /* Use the default character when storage is unavailable. */ }
  return DEFAULT_CHARACTER
}

function BuddyAvatar({ appearance, speaking = false }) {
  if (!['puppy', 'kitten', 'robot'].includes(appearance)) {
    const animal = ANIMAL_CHARACTERS.find(item => item.id === appearance) || ANIMAL_CHARACTERS[0]
    return <div className={`buddy-avatar buddy-animal-icon ${speaking ? 'speaking' : ''}`} aria-hidden="true">{animal.icon}</div>
  }
  return <div className={`buddy-avatar buddy-${appearance} ${speaking ? 'speaking' : ''}`} aria-hidden="true">
    <div className="buddy-ear left" /><div className="buddy-ear right" />
    <div className="buddy-face">
      <span className="buddy-eye left" /><span className="buddy-eye right" />
      <span className="buddy-nose" /><span className="buddy-mouth" />
      <span className="buddy-badge"><Mic size={15} /></span>
    </div>
  </div>
}
const LEARNING_ACTIVITIES = [
  { title: 'Read with Buddy', prompt: 'Help me practice reading. Give me one short sentence for my class to read aloud, then wait and offer gentle feedback.', icon: Volume2 },
  { title: 'Count together', prompt: 'Play a counting game for my class. Ask one simple counting question and wait for my answer.', icon: Gamepad2 },
  { title: 'Find the pattern', prompt: 'Play a pattern game for my class using familiar colors or shapes. Ask one question and wait for my answer.', icon: BrainCircuit },
  { title: 'Picture puzzle', prompt: 'Play a child-friendly picture puzzle for my class. Describe three simple clues about a familiar object, animal, fruit, or place, then ask me to guess and wait for my answer.', icon: WandSparkles },
  { title: 'Word puzzle', prompt: 'Play a gentle word puzzle for my class. Give me one age-appropriate missing-letter or rhyming word clue, then wait for my answer and help if I need it.', icon: Volume2 },
  { title: 'Logic puzzle', prompt: 'Play a very simple logic puzzle for my class using toys, fruits, colors, or shapes. Ask only one question, wait for my answer, and explain the thinking kindly.', icon: BrainCircuit }
]

export default function VoiceView() {
  const [displayName, setDisplayName] = useState(() => {
    try { return sessionStorage.getItem('ai-buddy-name')?.trim().slice(0, 48) || '' } catch { return '' }
  })
  const [loginName, setLoginName] = useState('')
  const [loginError, setLoginError] = useState('')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const loginDialogRef = useRef(null)
  const sidebarRef = useRef(null)
  const [activeView, setActiveView] = useState('home')
  const [character, setCharacter] = useState(readCharacter)
  const [characterAppearance, setCharacterAppearance] = useState(character.appearance)
  const [characterName, setCharacterName] = useState(character.name)
  const [characterFeedback, setCharacterFeedback] = useState('')
  const [classId, setClassId] = useState('nursery')
  const [speechSpeed, setSpeechSpeed] = useState(0.85)
  const [selectedStoryId, setSelectedStoryId] = useState('colors')
  const [finishedStories, setFinishedStories] = useState([])
  const [activeStoryTitle, setActiveStoryTitle] = useState('')
  const storyRequestRef = useRef(null)
  const preferencesRef = useRef({ classId: 'nursery', speed: 0.85 })
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [conversation, setConversation] = useState([])
  const [isMuted, setIsMuted] = useState(false)
  const [isChannelReady, setIsChannelReady] = useState(false)
  const [isResponding, setIsResponding] = useState(false)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const responsePendingRef = useRef(false)
  const pcRef = useRef(null)
  const streamRef = useRef(null)
  const dataChannelRef = useRef(null)
  const audioRef = useRef(null)
  const conversationEndRef = useRef(null)

  useEffect(() => {
    if (!isMenuOpen) return
    const previousFocus = document.activeElement
    const sidebar = sidebarRef.current
    const buttons = [...sidebar.querySelectorAll('button:not(:disabled)')]
    buttons[0]?.focus()
    const handleKey = event => {
      if (event.key === 'Escape') setIsMenuOpen(false)
      if (event.key !== 'Tab') return
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    const desktop = window.matchMedia('(min-width: 641px)')
    const handleResize = () => { if (desktop.matches) setIsMenuOpen(false) }
    document.addEventListener('keydown', handleKey)
    desktop.addEventListener('change', handleResize)
    return () => {
      document.removeEventListener('keydown', handleKey)
      desktop.removeEventListener('change', handleResize)
      previousFocus?.focus()
    }
  }, [isMenuOpen])

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [conversation])

  useEffect(() => () => {
    dataChannelRef.current?.close()
    pcRef.current?.close()
    streamRef.current?.getTracks().forEach(track => track.stop())
  }, [])

  useEffect(() => {
    preferencesRef.current = { classId, speed: speechSpeed }
    const channel = dataChannelRef.current
    if (isChannelReady && !isResponding && channel?.readyState === 'open') {
      channel.send(JSON.stringify({
        type: 'session.update',
        session: {
          type: 'realtime',
          instructions: getChildInstructions(classId),
          audio: { output: { speed: speechSpeed }, input: { turn_detection: { type: 'semantic_vad', eagerness: 'low' } } }
        }
      }))
    }
  }, [classId, speechSpeed, isChannelReady, isResponding])

  const updateTranscript = (id, role, text, isFinal = false, replace = false) => {
    if (!text) return

    setConversation(previous => {
      const index = previous.findIndex(message => message.id === id && message.role === role)
      if (index === -1) {
        return [...previous, { id, role, text, isFinal }].slice(-50)
      }

      const next = [...previous]
      next[index] = {
        ...next[index],
        text: replace ? text : `${next[index].text}${text}`,
        isFinal: next[index].isFinal || isFinal
      }
      return next
    })
  }

  const stopSession = () => {
    dataChannelRef.current?.close()
    pcRef.current?.close()
    streamRef.current?.getTracks().forEach(track => track.stop())
    dataChannelRef.current = null
    pcRef.current = null
    streamRef.current = null
    setStatus('idle')
    setIsMuted(false)
    setIsChannelReady(false)
    setIsResponding(false)
    setIsAudioPlaying(false)
    responsePendingRef.current = false
    storyRequestRef.current = null
    setActiveStoryTitle('')
    if (audioRef.current) audioRef.current.srcObject = null
  }

  const toggleMute = () => {
    const audioTracks = streamRef.current?.getAudioTracks() || []
    const nextMuted = !isMuted
    audioTracks.forEach(track => {
      track.enabled = !nextMuted
    })
    setIsMuted(nextMuted)
  }

  const sendActivity = (prompt, story = null) => {
    const channel = dataChannelRef.current
    if (channel?.readyState !== 'open') {
      setError('The voice connection is not ready. Please start a voice session again.')
      return
    }
    if (responsePendingRef.current) return

    try {
      const preferences = preferencesRef.current
      channel.send(JSON.stringify({
        type: 'session.update',
        session: {
          type: 'realtime',
          instructions: getChildInstructions(preferences.classId),
          audio: { output: { speed: preferences.speed } }
        }
      }))
      const id = `activity_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`
      channel.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          id,
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: prompt }]
        }
      }))
      channel.send(JSON.stringify({ type: 'response.create' }))
      responsePendingRef.current = true
      storyRequestRef.current = story ? { ...story, classId: preferences.classId, responseId: null } : null
      setActiveStoryTitle(story?.title || '')
      setIsResponding(true)
      setError('')
      updateTranscript(id, 'user', prompt, true)
    } catch (err) {
      setError(err.message || 'Unable to start the activity. Please try again.')
    }
  }

  const startSession = async (initialPrompt = null, story = null) => {
    if (status !== 'idle') return
    setStatus('connecting')
    setError('')
    setConversation([])

    try {
      const sessionResponse = await fetch('http://localhost:3001/api/voice/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions: getChildInstructions(classId), speed: speechSpeed })
      })
      const session = await sessionResponse.json()

      if (!sessionResponse.ok) {
        throw new Error(session.error || 'Failed to create voice session')
      }

      const ephemeralKey = session.client_secret?.value || session.value
      if (!ephemeralKey) {
        throw new Error('Realtime session did not return a client secret')
      }

      const pc = new RTCPeerConnection()
      pcRef.current = pc

      pc.ontrack = (event) => {
        if (audioRef.current) {
          audioRef.current.srcObject = event.streams[0]
          audioRef.current.play().catch(() => {})
        }
      }

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') setStatus('connected')
        if (['failed', 'closed', 'disconnected'].includes(pc.connectionState) && pcRef.current === pc) stopSession()
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = mediaStream
      mediaStream.getTracks().forEach(track => pc.addTrack(track, mediaStream))

      const dataChannel = pc.createDataChannel('oai-events')
      dataChannelRef.current = dataChannel
      dataChannel.onopen = () => {
        setIsChannelReady(true)
        if (initialPrompt) sendActivity(initialPrompt, story)
      }
      dataChannel.onclose = () => {
        setIsChannelReady(false)
        setIsResponding(false)
        setIsAudioPlaying(false)
        responsePendingRef.current = false
      }
      dataChannel.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          const itemId = payload.item_id || payload.response_id || 'current'
          if (payload.type === 'output_audio_buffer.started') setIsAudioPlaying(true)
          if (payload.type === 'output_audio_buffer.stopped') {
            setIsAudioPlaying(false)
            const storyRequest = storyRequestRef.current
            if (storyRequest?.completed && storyRequest.responseId === payload.response_id) {
              setFinishedStories(previous => [...previous, { title: storyRequest.title, classId: storyRequest.classId, id: storyRequest.responseId }])
              storyRequestRef.current = null
              setActiveStoryTitle('')
            }
          }
          if (payload.type === 'output_audio_buffer.cleared') {
            setIsAudioPlaying(false)
            storyRequestRef.current = null
            setActiveStoryTitle('')
          }
          if (payload.type === 'response.created') {
            if (storyRequestRef.current && !storyRequestRef.current.responseId) {
              storyRequestRef.current.responseId = payload.response?.id
            }
            responsePendingRef.current = true
            setIsResponding(true)
          }
          if (payload.type === 'response.done') {
            const storyRequest = storyRequestRef.current
            if (storyRequest?.responseId === payload.response?.id) {
              if (payload.response.status === 'completed') {
                storyRequest.completed = true
              } else {
                storyRequestRef.current = null
                setActiveStoryTitle('')
              }
            }
            responsePendingRef.current = false
            setIsResponding(false)
            if (payload.response?.status === 'failed') {
              setError(payload.response.status_details?.error?.message || 'The activity response failed. Please try again.')
            }
          }

          if (payload.type === 'conversation.item.input_audio_transcription.delta') {
            updateTranscript(itemId, 'user', payload.delta)
          }
          if (payload.type === 'conversation.item.input_audio_transcription.completed') {
            updateTranscript(itemId, 'user', payload.transcript, true, true)
          }
          if (payload.type === 'response.output_audio_transcript.delta') {
            updateTranscript(itemId, 'assistant', payload.delta)
          }
          if (payload.type === 'response.output_audio_transcript.done') {
            updateTranscript(itemId, 'assistant', payload.transcript, true, true)
          }
          if (payload.type === 'response.output_text.delta') {
            updateTranscript(itemId, 'assistant', payload.delta)
          }
          if (payload.type === 'response.output_text.done') {
            updateTranscript(itemId, 'assistant', payload.text, true, true)
          }
          if (payload.type === 'error') {
            storyRequestRef.current = null
            setActiveStoryTitle('')
            responsePendingRef.current = false
            setIsResponding(false)
            setError(payload.error?.message || 'The realtime session reported an error')
          }
        } catch (parseError) {
          console.warn('Unable to read realtime event', parseError)
        }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const formData = new FormData()
      formData.append('sdp', offer.sdp)

      const realtimeResponse = await fetch(REALTIME_CALL_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ephemeralKey}`
        },
        body: formData
      })

      const answerSdp = await realtimeResponse.text()
      if (!realtimeResponse.ok) {
        throw new Error(answerSdp || 'Realtime WebRTC call failed')
      }

      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })
      setStatus('connected')
    } catch (err) {
      console.error('Voice session error', err)
      setError(err.message || 'Failed to start voice session')
      stopSession()
    }
  }

  const isConnecting = status === 'connecting'
  const isConnected = status === 'connected'
  const activityDisabled = isConnecting || isResponding || isAudioPlaying || (isConnected && !isChannelReady)
  const availableStories = STORY_TOPICS.filter(story => story.levels.includes(classId))
  const selectedStory = availableStories.find(story => story.id === selectedStoryId) || availableStories[0]
  const selectedClass = CLASS_LEVELS.find(level => level.id === classId)
  const runActivity = (prompt, story = null) => {
    if (activityDisabled) return
    if (isConnected) sendActivity(prompt, story)
    else startSession(prompt, story)
  }

  const statusLabel = isConnecting ? 'Connecting' : isConnected ? (isAudioPlaying ? `${character.name} is speaking` : isMuted ? 'Listening paused' : 'Live voice session') : 'Ready to start'
  const statusTone = isConnected ? 'online' : isConnecting ? 'pending' : 'idle'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const openLogin = () => {
    setLoginName('')
    setLoginError('')
    setIsMenuOpen(false)
    loginDialogRef.current?.showModal()
  }

  const login = event => {
    event.preventDefault()
    const name = loginName.trim().replace(/\s+/g, ' ')
    if (!name) { setLoginError('Please enter your name.'); return }
    setDisplayName(name)
    try { sessionStorage.setItem('ai-buddy-name', name) } catch { /* Keep the name in memory when storage is unavailable. */ }
    loginDialogRef.current?.close()
  }

  const logout = () => {
    stopSession()
    setDisplayName('')
    setConversation([])
    setFinishedStories([])
    setActiveStoryTitle('')
    setError('')
    setActiveView('home')
    setIsMenuOpen(false)
    setCharacter(DEFAULT_CHARACTER)
    setCharacterAppearance(DEFAULT_CHARACTER.appearance)
    setCharacterName(DEFAULT_CHARACTER.name)
    setCharacterFeedback('')
    try { sessionStorage.removeItem('ai-buddy-character') } catch { /* Clear the in-memory character even without storage. */ }
    try { sessionStorage.removeItem('ai-buddy-name') } catch { /* In-memory logout still works. */ }
  }

  const saveCharacter = event => {
    event.preventDefault()
    const name = characterName.trim().replace(/\s+/g, ' ')
    if (!name) { setCharacterFeedback('Please give your character a name.'); return }
    const nextCharacter = { appearance: characterAppearance, name }
    setCharacter(nextCharacter)
    setCharacterName(name)
    setCharacterFeedback(`${name} is ready!`)
    try { sessionStorage.setItem('ai-buddy-character', JSON.stringify(nextCharacter)) } catch { /* Keep the character in memory when storage is unavailable. */ }
  }

  return (
    <div className="voice-demo-shell">
      <audio ref={audioRef} autoPlay />

      {isMenuOpen && <button className="voice-menu-backdrop" aria-label="Close navigation" onClick={() => setIsMenuOpen(false)} />}
      <aside ref={sidebarRef} id="buddy-navigation" className={`voice-sidebar ${isMenuOpen ? 'open' : ''}`} aria-label="AI Buddy sidebar">
        <div className="voice-brand">
          <div className="voice-brand-mark"><BrainCircuit size={20} /></div>
          <strong>AI Buddy</strong>
          <button className="voice-icon-button voice-mobile-close" aria-label="Close navigation" onClick={() => setIsMenuOpen(false)}><X size={20} /></button>
        </div>
        <nav className="voice-menu" aria-label="AI Buddy navigation">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className={activeView === id ? 'active' : ''} aria-current={activeView === id ? 'page' : undefined} onClick={() => { setActiveView(id); setIsMenuOpen(false) }}>
              <Icon size={18} /> <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="voice-sidebar-footer">
          <div className="voice-account-summary">
            <span className="voice-profile-avatar">{displayName ? Array.from(displayName)[0].toUpperCase() : <User size={18} />}</span>
            <div><strong>{displayName || 'Guest'}</strong><span>{displayName ? 'Your learning space' : 'Welcome to AI Buddy'}</span></div>
          </div>
          <button className="voice-account-button" disabled={isConnecting} onClick={displayName ? logout : openLogin}>
            {displayName ? <LogOut size={18} /> : <LogIn size={18} />}{displayName ? 'Log out' : 'Log in'}
          </button>
        </div>
      </aside>

      <section className="voice-dashboard">
        <header className="voice-dashboard-header">
          <div>
            <div className="voice-mobile-heading"><button className="voice-icon-button voice-menu-toggle" aria-label="Open navigation" aria-expanded={isMenuOpen} aria-controls="buddy-navigation" onClick={() => setIsMenuOpen(true)}><Menu size={20} /></button><span>AI Buddy</span></div>
            <p>{displayName ? `${greeting}, ${displayName}` : 'Welcome to AI Buddy'}</p>
            <h2>{activeView === 'home' ? 'What would you like to do today?' : NAV_ITEMS.find(item => item.id === activeView).label}</h2>
          </div>
          <div className="voice-profile">
            {displayName ? <><span>{displayName}</span><div className="voice-profile-avatar">{Array.from(displayName)[0].toUpperCase()}</div></> : <button className="voice-account-button" onClick={openLogin}><LogIn size={18} /> Log in</button>}
          </div>
        </header>

        {activeView === 'home' && <div className="voice-hero">
          <div className="voice-hero-copy">
            <span className="voice-pill"><WandSparkles size={14} /> Realtime demo</span>
            <h3>Chat with {character.name}</h3>
            <p>A little story, a big discovery. Let's learn together!</p>
          </div>
          <div className="buddy-stage" aria-hidden="true">
            <BuddyAvatar appearance={character.appearance} speaking={isAudioPlaying} />
          </div>
        </div>}

        <div className="voice-learning-settings">
          <label>Class
            <select value={classId} disabled={isConnecting || isResponding || isAudioPlaying} onChange={event => setClassId(event.target.value)}>
              {CLASS_LEVELS.map(level => <option key={level.id} value={level.id}>{level.label}</option>)}
            </select>
          </label>
          <label>Narration pace
            <select value={speechSpeed} disabled={isConnecting || isResponding || isAudioPlaying} onChange={event => setSpeechSpeed(Number(event.target.value))}>
              <option value={0.75}>Extra gentle (0.75x)</option>
              <option value={0.85}>Gentle (0.85x)</option>
              <option value={1}>Normal (1x)</option>
            </select>
          </label>
          <span className="voice-pill"><Heart size={14} /> {selectedClass.label} learning</span>
        </div>

        {activeView === 'home' && <div className="voice-home-links">
          <button onClick={() => setActiveView('stories')}><Sparkles size={22} /><strong>Story time</strong><span>Little adventures with Buddy</span></button>
          <button onClick={() => setActiveView('voice')}><Mic size={22} /><strong>Talk with Buddy</strong><span>What's on your mind?</span></button>
          <button onClick={() => setActiveView('activities')}><Gamepad2 size={22} /><strong>Let's learn</strong><span>Words, numbers, and patterns</span></button>
        </div>}

        {activeView === 'stories' && <section className="voice-story-library" aria-label="Stories">
          <div className="voice-section-heading"><div><h3>Stories for {selectedClass.label}</h3><p>AI adventures and little discoveries</p></div><span>{availableStories.length} stories</span></div>
          <div className="voice-story-grid" role="radiogroup" aria-label="Choose a story">
            {availableStories.map(story => <label key={story.id} className={`voice-story-option ${story.color} ${selectedStory.id === story.id ? 'selected' : ''}`}>
              <input type="radio" name="story" value={story.id} checked={selectedStory.id === story.id} onChange={() => setSelectedStoryId(story.id)} />
              <span className="voice-story-art" aria-hidden="true"><Bot size={42} /><Sparkles size={22} /></span>
              <span className="voice-story-topic">{story.topic}</span><strong>{story.title}</strong>
            </label>)}
          </div>
          <div className="voice-story-playbar">
            <div><strong>{activeStoryTitle || selectedStory.title}</strong><span>{activeStoryTitle ? 'Story time with Buddy' : `${selectedClass.label} / ${speechSpeed}x pace`}</span></div>
            <button className="voice-primary-btn" disabled={activityDisabled} onClick={() => runActivity(getStoryPrompt(selectedStory, classId), selectedStory)}>
              {isConnecting ? <Loader size={18} className="voice-spin" /> : <Play size={18} />} {isConnecting ? 'Connecting' : 'Play story'}
            </button>
          </div>
        </section>}

        {activeView === 'activities' && <section className="voice-activity-library" aria-label="Learning activities">
          <div className="voice-section-heading"><div><h3>Learn with Buddy</h3><p>A little practice for {selectedClass.label}</p></div></div>
          <div className="voice-home-links">{LEARNING_ACTIVITIES.map(({ title, prompt, icon: Icon }) => <button key={title} disabled={activityDisabled} onClick={() => runActivity(prompt)}><Icon size={26} /><strong>{title}</strong><span>Start activity</span></button>)}</div>
        </section>}

        {activeView === 'characters' && <section className="voice-character-library" aria-label="Create a character">
          <div className="voice-section-heading"><div><h3>Create your character</h3></div></div>
          <form className="voice-character-form" onSubmit={saveCharacter}>
            <Suspense fallback={<div className="voice-character-loading" role="status"><Loader size={24} className="voice-spin" /> Loading characters</div>}>
              <AnimalPlayground appearance={characterAppearance} onSelect={id => { setCharacterAppearance(id); setCharacterFeedback('') }} />
            </Suspense>
            <div className="voice-character-details">
              <label htmlFor="buddy-character-name">Character name</label>
              <input id="buddy-character-name" autoComplete="off" maxLength={32} required value={characterName} onChange={event => { setCharacterName(event.target.value); setCharacterFeedback('') }} />
              <button className="voice-primary-btn" type="submit"><Check size={18} /> Save character</button>
              <p role="status">{characterFeedback}</p>
            </div>
          </form>
        </section>}

        {activeView === 'progress' && <section className="voice-progress" aria-label="Learning progress">
          <div className="voice-section-heading"><div><h3>Little steps, big discoveries</h3><p>This visit</p></div></div>
          <div className="voice-progress-stats"><div><Heart size={22} /><strong>{finishedStories.length}</strong><span>Stories finished</span></div><div><BrainCircuit size={22} /><strong>{new Set(finishedStories.map(story => story.classId)).size}</strong><span>Classes explored</span></div></div>
          {finishedStories.length ? <ul>{finishedStories.map(story => <li key={story.id}><Sparkles size={16} /><strong>{story.title}</strong><span>{CLASS_LEVELS.find(level => level.id === story.classId).label}</span></li>)}</ul> : <p>Your story journey starts here.</p>}
          <button className="voice-primary-btn" onClick={() => setActiveView('stories')}><Sparkles size={18} /> Explore stories</button>
        </section>}

        {error && (
          <div className="voice-error">
            {error}
          </div>
        )}

        {!['progress', 'characters'].includes(activeView) && <div className="voice-content-grid">
          <section className="voice-control-card">
            <div className="voice-card-heading">
              <span className="voice-card-icon"><Volume2 size={21} /></span>
              <div>
                <h3>Realtime Voice AI</h3>
                <p>{activeStoryTitle ? activeStoryTitle : 'A kind voice, ready to listen.'}</p>
              </div>
            </div>

            <div className={`voice-status-orb ${statusTone}`}>
              <div className="voice-live-character"><BuddyAvatar appearance={character.appearance} speaking={isAudioPlaying} /></div>
              {isConnecting ? (
                <Loader size={46} className="voice-spin" />
              ) : isConnected ? (
                <Mic size={22} />
              ) : (
                <MicOff size={22} />
              )}
              <span>{statusLabel}</span>
            </div>

            <div className="voice-actions">
              {!isConnected ? (
                <button className="voice-primary-btn" onClick={() => startSession()} disabled={isConnecting}>
                  {isConnecting ? <Loader size={18} className="voice-spin" /> : <PhoneCall size={18} />}
                  {isConnecting ? 'Connecting' : 'Start Voice'}
                </button>
              ) : (
                <>
                  <button className={`voice-secondary-btn ${isMuted ? 'warning' : ''}`} onClick={toggleMute}>
                    {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                    {isMuted ? 'Unmute' : 'Mute'}
                  </button>
                  <button className="voice-danger-btn" onClick={stopSession}>
                    <PhoneOff size={18} /> End
                  </button>
                </>
              )}
            </div>

            <div className="voice-quick-actions">
              {QUICK_ACTIVITIES.map(activity => (
                <button
                  key={activity.label}
                  type="button"
                  onClick={() => activity.label === 'Tell a story' ? setActiveView('stories') : runActivity(activity.prompt)}
                  disabled={activity.label === 'Tell a story' ? false : activityDisabled}
                  title={isResponding || isAudioPlaying ? 'AI Buddy is responding' : activity.label}
                >
                  {activity.label}
                </button>
              ))}
            </div>
          </section>

          <section className="voice-chat-card">
            <div className="voice-card-heading compact">
              <span className="voice-card-icon chat"><Bot size={20} /></span>
              <div>
                <h3>Live Conversation</h3>
                <p>Our words and stories</p>
              </div>
            </div>
            <div className="voice-transcript">
              {conversation.length === 0 ? (
                <div className="voice-empty-chat">
                  <Bot size={28} />
                  <strong>{isConnected ? 'Ready when you are.' : 'Start a voice session to begin.'}</strong>
                  <span>{isConnected ? 'What would you like to discover?' : 'Choose a story or say hello to Buddy.'}</span>
                </div>
              ) : conversation.map(message => (
                <div key={`${message.role}-${message.id}`} className={`voice-message ${message.role}`}>
                  <div title={message.role === 'user' ? 'You' : 'AI'} className="voice-message-avatar">
                    {message.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                  </div>
                  <div className="voice-bubble">
                    <span>{message.role === 'user' ? 'You' : character.name}</span>
                    <p>
                      {message.text}
                      {!message.isFinal && <span className="voice-cursor" />}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={conversationEndRef} />
            </div>
          </section>
        </div>}
      </section>

      <dialog ref={loginDialogRef} className="voice-login-dialog" aria-labelledby="buddy-login-title">
        <form onSubmit={login}>
          <div className="voice-login-heading"><span className="voice-brand-mark"><BrainCircuit size={22} /></span><button type="button" className="voice-icon-button" aria-label="Close login" onClick={() => loginDialogRef.current.close()}><X size={20} /></button></div>
          <h2 id="buddy-login-title">Hello, let's meet!</h2>
          <label htmlFor="buddy-login-name">Your name</label>
          <input id="buddy-login-name" name="name" autoComplete="given-name" placeholder="Enter your name" maxLength={48} required value={loginName} onChange={event => { setLoginName(event.target.value); setLoginError('') }} aria-invalid={!!loginError} aria-describedby={loginError ? 'buddy-login-error' : undefined} />
          {loginError && <p id="buddy-login-error" role="alert">{loginError}</p>}
          <button className="voice-primary-btn" type="submit"><LogIn size={18} /> Log in</button>
        </form>
      </dialog>

      <style>{`
        .voice-demo-shell {
          display: grid;
          grid-template-columns: 232px minmax(0, 1fr);
          min-height: 100vh;
          min-height: 100dvh;
          color: #1d2b5c;
        }
        .voice-control-card,
        .voice-chat-card {
          border: 1px solid #dce8ff;
          background: rgba(255, 255, 255, 0.86);
          box-shadow: 0 14px 35px rgba(59, 130, 246, 0.1);
        }
        .voice-sidebar {
          position: sticky;
          top: 0;
          height: 100vh;
          height: 100dvh;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 2rem;
          padding: 1.5rem 1rem;
          border-right: 1px solid #e2e8f0;
          background: #fff;
        }
        .voice-brand {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          color: #2563eb;
          font-size: 1.05rem;
          flex-shrink: 0;
          margin: 0;
        }
        .voice-brand-mark {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          display: grid;
          place-items: center;
          color: #fff;
          background: linear-gradient(135deg, #4f7cff, #8b5cf6);
        }
        .voice-menu {
          display: grid;
          gap: 0.5rem;
        }
        .voice-menu button {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          color: #64748b;
          font-size: 0.82rem;
          font-weight: 700;
          min-height: 48px;
          padding: 0.62rem 0.9rem;
          border-radius: 8px;
          border: 0;
          background: transparent;
          text-align: left;
          cursor: pointer;
          min-width: 0;
        }
        .voice-menu button svg { flex-shrink: 0; }
        .voice-menu button:hover {
          background: #f1f5f9;
        }
        .voice-menu button:focus-visible,
        .voice-home-links button:focus-visible {
          outline: 2px solid #2563eb;
          outline-offset: 2px;
        }
        .voice-learning-settings {
          display: flex;
          align-items: end;
          flex-wrap: wrap;
          gap: 1rem;
          padding: 0.75rem 0 1rem;
        }
        .voice-learning-settings label {
          display: grid;
          gap: 0.35rem;
          color: #475569;
          font-size: 0.82rem;
          font-weight: 700;
          min-width: 0;
        }
        .voice-learning-settings select {
          min-height: 40px;
          max-width: 100%;
          padding: 0.5rem 1.8rem 0.5rem 0.65rem;
          color: #172554;
          background: #fff;
          border: 1px solid #bfdbfe;
          border-radius: 6px;
          font: inherit;
        }
        .voice-home-links,
        .voice-story-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.8rem;
          margin-bottom: 1rem;
        }
        .voice-home-links button {
          display: grid;
          justify-items: start;
          gap: 0.55rem;
          text-align: left;
          padding: 1rem;
          background: #eff6ff;
          color: #2563eb;
          border: 1px solid #bfdbfe;
          border-radius: 8px;
          cursor: pointer;
          min-width: 0;
        }
        .voice-home-links button:nth-child(2) { background: #fff1f2; color: #be185d; border-color: #fecdd3; }
        .voice-home-links button:nth-child(3) { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
        .voice-home-links button span { color: #475569; font-size: 0.82rem; }
        .voice-home-links button:hover:not(:disabled) { filter: brightness(0.97); }
        .voice-home-links button:disabled { opacity: 0.55; cursor: not-allowed; }
        .voice-section-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.8rem;
          margin: 0.4rem 0 1rem;
          color: #64748b;
          font-size: 0.82rem;
        }
        .voice-section-heading h3 { margin: 0; color: #172554; font-size: 1.15rem; }
        .voice-section-heading p { margin: 0.35rem 0 0; }
        .voice-story-option {
          position: relative;
          display: grid;
          gap: 0.55rem;
          padding: 0.9rem;
          background: #fff;
          border: 2px solid #e2e8f0;
          border-radius: 8px;
          cursor: pointer;
          min-width: 0;
        }
        .voice-story-option.selected { border-color: #2563eb; }
        .voice-story-option:focus-within { outline: 2px solid #2563eb; outline-offset: 2px; }
        .voice-story-option input { position: absolute; top: 0.8rem; right: 0.8rem; accent-color: #2563eb; width: 17px; height: 17px; }
        .voice-story-art { display: flex; align-items: center; justify-content: center; gap: 0.6rem; height: 82px; border-radius: 6px; background: #dbeafe; color: #2563eb; }
        .voice-story-option.pink .voice-story-art { background: #fce7f3; color: #be185d; }
        .voice-story-option.green .voice-story-art { background: #d1fae5; color: #047857; }
        .voice-story-option.yellow .voice-story-art { background: #fef3c7; color: #a16207; }
        .voice-story-topic { font-size: 0.75rem; color: #64748b; }
        .voice-story-option strong { font-size: 0.94rem; color: #172554; overflow-wrap: anywhere; }
        .voice-story-playbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.8rem; padding: 0.8rem 0 1.2rem; }
        .voice-story-playbar div { display: grid; gap: 0.3rem; min-width: 0; }
        .voice-story-playbar span { font-size: 0.82rem; color: #64748b; }
        .voice-progress { padding: 0 0 1.5rem; }
        .voice-progress-stats { display: flex; flex-wrap: wrap; gap: 2rem; padding: 1rem 0; }
        .voice-progress-stats div { display: grid; gap: 0.4rem; color: #047857; }
        .voice-progress-stats strong { font-size: 1.5rem; }
        .voice-progress-stats span { color: #64748b; font-size: 0.82rem; }
        .voice-progress ul { padding: 0; list-style: none; }
        .voice-progress li { display: flex; flex-wrap: wrap; gap: 0.75rem; padding: 0.75rem 0; border-bottom: 1px solid #dbeafe; font-size: 0.88rem; }
        .voice-progress li span { color: #64748b; }
        .voice-dashboard { min-width: 0; }
        .voice-sidebar-footer { margin-top: auto; padding-top: 1rem; border-top: 1px solid #e2e8f0; }
        .voice-account-summary { display: flex; gap: 0.65rem; align-items: center; margin-bottom: 1rem; min-width: 0; }
        .voice-account-summary > div { display: grid; gap: 0.25rem; min-width: 0; }
        .voice-account-summary strong { font-size: 0.88rem; overflow-wrap: anywhere; color: #263449; }
        .voice-account-summary div span { font-size: 0.72rem; color: #64748b; }
        .voice-account-button { display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; min-height: 44px; padding: 0.6rem 0.9rem; border: 1px solid #dce8ff; border-radius: 8px; background: #fff; color: #2563eb; font: inherit; font-size: 0.85rem; font-weight: 700; cursor: pointer; }
        .voice-sidebar-footer .voice-account-button { width: 100%; }
        .voice-account-button:hover { background: #eff6ff; }
        .voice-account-button:disabled { opacity: 0.55; cursor: not-allowed; }
        .voice-account-button:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
        .voice-profile-avatar { flex-shrink: 0; }
        .voice-profile > span { overflow-wrap: anywhere; min-width: 0; }
        .voice-mobile-heading, .voice-icon-button.voice-mobile-close, .voice-icon-button.voice-menu-toggle { display: none; }
        .voice-login-dialog { width: min(420px, calc(100% - 2rem)); padding: 1.5rem; border: 1px solid #e2e8f0; border-radius: 8px; color: #263449; box-shadow: 0 24px 80px #0f172a33; }
        .voice-login-dialog::backdrop { background: #0f172a66; }
        .voice-login-dialog form { display: grid; gap: 1rem; }
        .voice-login-heading { display: flex; align-items: center; justify-content: space-between; }
        .voice-login-dialog h2 { margin: 0; font-size: 1.4rem; }
        .voice-login-dialog label { font-size: 0.88rem; font-weight: 700; }
        .voice-login-dialog input { width: 100%; min-height: 48px; padding: 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px; font: inherit; }
        .voice-login-dialog input:focus { outline: 2px solid #2563eb; outline-offset: 2px; }
        .voice-login-dialog p { margin: 0; color: #b91c1c; font-size: 0.85rem; }
        .voice-login-dialog .voice-primary-btn { width: 100%; }
        .voice-character-form { padding: 0.5rem 0 2rem; }
        .voice-character-loading { display: flex; gap: 0.75rem; align-items: center; justify-content: center; min-height: 440px; color: #64748b; }
        .voice-character-details { display: grid; gap: 0.65rem; width: min(100%, 360px); margin-top: 1.5rem; }
        .voice-character-details label { font-size: 0.88rem; font-weight: 700; color: #475569; }
        .voice-character-details input { width: 100%; min-height: 44px; padding: 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px; font: inherit; color: #263449; }
        .voice-character-details input:focus { outline: 2px solid #2563eb; outline-offset: 2px; }
        .voice-character-details p { min-height: 1.5rem; margin: 0; font-size: 0.85rem; color: #475569; overflow-wrap: anywhere; }
        .voice-menu .active {
          color: #2563eb;
          background: #eaf2ff;
        }
        .voice-dashboard {
          padding: 1.5rem 2rem;
          background: #f5f8ff;
        }
        .voice-dashboard-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid #e2e8f0;
        }
        .voice-dashboard-header > div:first-child { min-width: 0; }
        .voice-dashboard-header p, .voice-dashboard-header h2 { overflow-wrap: anywhere; }
        .voice-dashboard-header p,
        .voice-dashboard-header h2,
        .voice-card-heading h3,
        .voice-card-heading p,
        .voice-bubble p {
          margin: 0;
        }
        .voice-dashboard-header p {
          color: #64748b;
          font-size: 0.84rem;
          font-weight: 700;
        }
        .voice-dashboard-header h2 {
          color: #172554;
          font-size: 1.2rem;
          margin-top: 0.18rem;
        }
        .voice-profile {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          color: #475569;
          font-size: 0.82rem;
          font-weight: 700;
          max-width: 45%;
        }
        .voice-icon-button {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          border: 1px solid #dbeafe;
          border-radius: 8px;
          color: #2563eb;
          background: #fff;
          cursor: pointer;
        }
        .voice-profile-avatar {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          color: #fff;
          background: #0f766e;
        }
        .voice-hero {
          position: relative;
          overflow: hidden;
          min-height: 190px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 270px;
          align-items: center;
          gap: 1rem;
          border-radius: 8px;
          padding: 1.4rem 1.6rem;
          margin-bottom: 1rem;
          background:
            radial-gradient(circle at 78% 24%, rgba(255, 237, 213, 0.95), transparent 27%),
            radial-gradient(circle at 88% 84%, rgba(191, 219, 254, 0.95), transparent 30%),
            linear-gradient(135deg, #bfe4ff 0%, #eef8ff 50%, #fff7ed 100%);
        }
        .voice-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          color: #2563eb;
          background: rgba(255, 255, 255, 0.72);
          border: 1px solid rgba(147, 197, 253, 0.8);
          border-radius: 999px;
          padding: 0.34rem 0.65rem;
          font-size: 0.75rem;
          font-weight: 800;
        }
        .voice-hero h3 {
          margin: 0.85rem 0 0.45rem;
          color: #172554;
          font-size: 2rem;
          line-height: 1.05;
        }
        .voice-hero p {
          max-width: 520px;
          margin: 0;
          color: #475569;
          line-height: 1.55;
        }
        .buddy-stage {
          position: relative;
          min-height: 170px;
          display: grid;
          place-items: center;
        }
        .buddy-avatar {
          position: relative;
          width: 142px;
          height: 128px;
        }
        .buddy-animal-icon { display: grid; place-items: center; font-size: 100px; line-height: 1; }
        .buddy-ear,
        .buddy-face {
          position: absolute;
          background: #b97952;
          box-shadow: inset -12px -14px 0 rgba(99, 45, 22, 0.13);
        }
        .buddy-ear {
          width: 56px;
          height: 86px;
          top: 22px;
          border-radius: 48% 48% 58% 58%;
        }
        .buddy-ear.left {
          left: 0;
          transform: rotate(18deg);
        }
        .buddy-ear.right {
          right: 0;
          transform: rotate(-18deg);
        }
        .buddy-face {
          left: 22px;
          top: 0;
          width: 98px;
          height: 102px;
          border-radius: 46% 46% 50% 50%;
          background: linear-gradient(145deg, #f8c998, #ba7850);
        }
        .buddy-face::before {
          content: '';
          position: absolute;
          left: 22px;
          right: 22px;
          bottom: 16px;
          height: 38px;
          border-radius: 45%;
          background: #fff4df;
        }
        .buddy-eye {
          position: absolute;
          z-index: 1;
          top: 36px;
          width: 12px;
          height: 16px;
          border-radius: 50%;
          background: #1f2937;
        }
        .buddy-eye.left { left: 31px; }
        .buddy-eye.right { right: 31px; }
        .buddy-nose {
          position: absolute;
          z-index: 1;
          left: 44px;
          top: 61px;
          width: 12px;
          height: 9px;
          border-radius: 50%;
          background: #1f2937;
        }
        .buddy-mouth {
          position: absolute;
          z-index: 1;
          left: 45px;
          top: 73px;
          width: 20px;
          height: 10px;
          border-bottom: 2px solid #7f1d1d;
          border-radius: 0 0 18px 18px;
        }
        .buddy-badge {
          position: absolute;
          z-index: 2;
          left: 36px;
          bottom: -16px;
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #fff;
          background: linear-gradient(135deg, #38bdf8, #2563eb);
          border: 4px solid #fff;
        }
        .buddy-avatar.speaking {
          animation: buddy-bob 1.25s ease-in-out infinite;
        }
        .buddy-kitten .buddy-ear { top: -8px; height: 55px; width: 47px; background: #d9a4b9; border-radius: 6px; clip-path: polygon(50% 0, 100% 100%, 0 100%); transform: none; }
        .buddy-kitten .buddy-ear.left { left: 17px; }
        .buddy-kitten .buddy-ear.right { right: 17px; }
        .buddy-kitten .buddy-face { background: #e7b8cb; box-shadow: inset -8px -9px 0 #ce91aa; }
        .buddy-kitten .buddy-face::before { background: #fff3f7; }
        .buddy-kitten .buddy-nose { background: #9d476a; }
        .buddy-robot .buddy-face { background: #99dacb; border: 3px solid #248571; border-radius: 22px; box-shadow: inset -7px -8px 0 #73bdae; }
        .buddy-robot .buddy-face::before { left: 12px; right: 12px; top: 24px; height: 38px; border-radius: 8px; background: #18463d; }
        .buddy-robot .buddy-ear { width: 18px; height: 34px; top: 34px; border-radius: 6px; background: #248571; box-shadow: none; transform: none; }
        .buddy-robot .buddy-ear.left { left: 11px; }
        .buddy-robot .buddy-ear.right { right: 11px; }
        .buddy-robot .buddy-eye { top: 33px; width: 9px; height: 14px; background: #b8ffe7; border-radius: 4px; }
        .buddy-robot .buddy-eye.left { left: 24px; }
        .buddy-robot .buddy-eye.right { right: 24px; }
        .buddy-robot .buddy-nose { display: none; }
        .buddy-robot .buddy-mouth { left: 32px; top: 68px; width: 26px; border-color: #18463d; }
        .voice-live-character { height: 128px; width: 142px; display: grid; place-items: center; }
        .voice-error {
          color: #b91c1c;
          background: #fff1f2;
          border: 1px solid #fecdd3;
          border-radius: 8px;
          padding: 0.8rem;
          margin-bottom: 1rem;
          font-size: 0.86rem;
          font-weight: 700;
        }
        .voice-content-grid {
          display: grid;
          grid-template-columns: minmax(0, 0.78fr) minmax(0, 1.22fr);
          gap: 1rem;
        }
        .voice-control-card,
        .voice-chat-card {
          min-width: 0;
          border-radius: 8px;
          padding: 1.2rem;
          min-height: 360px;
        }
        .voice-card-heading {
          display: flex;
          align-items: flex-start;
          gap: 0.8rem;
          margin-bottom: 1rem;
        }
        .voice-card-heading.compact {
          margin-bottom: 0.8rem;
        }
        .voice-card-icon {
          width: 42px;
          height: 42px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: 8px;
          color: #2563eb;
          background: #dbeafe;
        }
        .voice-card-icon.chat {
          color: #7c3aed;
          background: #ede9fe;
        }
        .voice-card-heading h3 {
          color: #172554;
          font-size: 1.08rem;
        }
        .voice-card-heading p {
          color: #64748b;
          font-size: 0.88rem;
          line-height: 1.45;
          margin-top: 0.24rem;
        }
        .voice-status-orb {
          min-height: 170px;
          display: grid;
          place-items: center;
          gap: 0.7rem;
          border: 1px solid #dbeafe;
          border-radius: 8px;
          color: #94a3b8;
          background: #f8fbff;
          font-weight: 800;
          text-align: center;
          padding: 1rem;
        }
        .voice-status-orb > span { overflow-wrap: anywhere; max-width: 100%; }
        .voice-status-orb.online {
          color: #059669;
          background: linear-gradient(180deg, #ecfdf5, #f8fbff);
          border-color: #bbf7d0;
        }
        .voice-status-orb.pending {
          color: #4f46e5;
          background: linear-gradient(180deg, #eef2ff, #f8fbff);
        }
        .voice-actions {
          display: flex;
          gap: 0.7rem;
          flex-wrap: wrap;
          margin: 1rem 0;
        }
        .voice-primary-btn,
        .voice-secondary-btn,
        .voice-danger-btn {
          min-height: 42px;
          border: 0;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.72rem 1rem;
          color: #fff;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 10px 18px rgba(37, 99, 235, 0.18);
        }
        .voice-primary-btn {
          background: #2563eb;
        }
        .voice-primary-btn:disabled {
          cursor: not-allowed;
          opacity: 0.74;
        }
        .voice-secondary-btn {
          background: #0f766e;
        }
        .voice-secondary-btn.warning {
          background: #d97706;
        }
        .voice-danger-btn {
          background: #ef4444;
          box-shadow: 0 10px 18px rgba(239, 68, 68, 0.16);
        }
        .voice-quick-actions {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.55rem;
        }
        .voice-quick-actions button {
          min-height: 52px;
          border: 1px solid #dbeafe;
          border-radius: 8px;
          color: #2563eb;
          background: #f8fbff;
          font-size: 0.78rem;
          font-weight: 800;
          cursor: pointer;
        }
        .voice-quick-actions button:hover:not(:disabled) {
          background: #eaf2ff;
          border-color: #93c5fd;
        }
        .voice-quick-actions button:focus-visible {
          outline: 2px solid #2563eb;
          outline-offset: 2px;
        }
        .voice-quick-actions button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }
        .voice-transcript {
          display: flex;
          flex-direction: column;
          gap: 0.8rem;
          max-height: 470px;
          overflow-y: auto;
          padding-right: 0.25rem;
        }
        .voice-empty-chat {
          min-height: 270px;
          display: grid;
          place-items: center;
          align-content: center;
          gap: 0.45rem;
          color: #64748b;
          text-align: center;
          border: 1px dashed #bfdbfe;
          border-radius: 8px;
          background: #f8fbff;
          padding: 1rem;
        }
        .voice-empty-chat svg {
          color: #60a5fa;
        }
        .voice-empty-chat strong {
          color: #172554;
        }
        .voice-empty-chat span {
          max-width: 330px;
          font-size: 0.86rem;
          line-height: 1.45;
        }
        .voice-message {
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr);
          gap: 0.65rem;
          align-items: start;
        }
        .voice-message.user {
          grid-template-columns: minmax(0, 1fr) 34px;
        }
        .voice-message.user .voice-message-avatar {
          order: 2;
          color: #fff;
          background: #60a5fa;
        }
        .voice-message.user .voice-bubble {
          order: 1;
          background: #3b82f6;
          color: #fff;
          border-color: #3b82f6;
        }
        .voice-message.user .voice-bubble span,
        .voice-message.user .voice-bubble p {
          color: #fff;
        }
        .voice-message-avatar {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #7c3aed;
          background: #ede9fe;
        }
        .voice-bubble {
          min-width: 0;
          border: 1px solid #dbeafe;
          border-radius: 8px;
          padding: 0.78rem 0.9rem;
          background: #f8fbff;
        }
        .voice-bubble span {
          display: block;
          color: #2563eb;
          font-size: 0.72rem;
          font-weight: 900;
          margin-bottom: 0.28rem;
        }
        .voice-bubble p {
          color: #334155;
          line-height: 1.55;
          overflow-wrap: anywhere;
        }
        @media (max-width: 840px) {
          .voice-demo-shell { grid-template-columns: 200px minmax(0, 1fr); }
          .voice-content-grid,
          .voice-hero {
            grid-template-columns: 1fr;
          }
          .voice-dashboard { padding: 1.25rem 1rem; }
          .voice-story-grid,
          .voice-home-links { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .voice-profile { white-space: normal; }
          .voice-dashboard-header {
            align-items: flex-start;
            flex-direction: column;
          }
          .voice-hero {
            padding: 1.1rem;
          }
          .voice-hero h3 {
            font-size: 1.5rem;
          }
          .voice-quick-actions {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 640px) {
          .voice-demo-shell { grid-template-columns: minmax(0, 1fr); }
          .voice-sidebar { display: none; }
          .voice-sidebar.open { display: flex; position: fixed; inset: 0 auto 0 0; width: min(280px, 85vw); z-index: 20; box-shadow: 8px 0 32px #0f172a26; }
          .voice-menu-backdrop { position: fixed; inset: 0; z-index: 19; background: #0f172a66; border: 0; cursor: pointer; }
          .voice-icon-button.voice-mobile-close, .voice-icon-button.voice-menu-toggle { display: grid; }
          .voice-mobile-close { margin-left: auto; }
          .voice-mobile-heading { display: flex; gap: 0.65rem; align-items: center; color: #2563eb; font-weight: 800; margin-bottom: 1rem; }
          .voice-profile { max-width: 100%; }
        }
        @media (max-width: 480px) {
          .voice-dashboard { padding: 0.8rem; }
          .voice-story-grid,
          .voice-home-links { grid-template-columns: 1fr; }
          .voice-control-card,
          .voice-chat-card { padding: 0.8rem; }
          .voice-learning-settings label { width: 100%; }
          .voice-learning-settings select { width: 100%; }
          .voice-section-heading { flex-wrap: wrap; }
          .voice-story-playbar strong { overflow-wrap: anywhere; }
          .voice-hero h3 { overflow-wrap: anywhere; }
        }
        .voice-cursor {
          display: inline-block;
          width: 2px;
          height: 1em;
          margin-left: 3px;
          vertical-align: -2px;
          background: #6ee7b7;
          animation: voice-blink 0.9s steps(1) infinite;
        }
        .voice-spin {
          animation: spin 2s linear infinite;
        }
        @keyframes buddy-bob {
          50% { transform: translateY(-5px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .buddy-avatar.speaking { animation: none; }
        }
        @keyframes voice-blink { 50% { opacity: 0; } }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
