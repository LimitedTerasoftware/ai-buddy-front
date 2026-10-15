import VoiceView from './components/VoiceView'
import DeviceVoiceConsole from './components/DeviceVoiceConsole'
import { useState } from 'react'

function App() {
  const [consoleOpen, setConsoleOpen] = useState(false)
  return (
    <main className="app-container buddy-app">
      <button onClick={() => setConsoleOpen(!consoleOpen)} style={{ position: 'relative', zIndex: 2, margin: 12, padding: 10 }}>
        {consoleOpen ? 'Back to Buddy' : 'Device voice console'}
      </button>
      {consoleOpen ? <DeviceVoiceConsole /> : <VoiceView />}
    </main>
  )
}

export default App
