import { useState, useRef, useEffect } from 'react'
import { Send, User, BrainCircuit, Loader, Search, MessageSquare, Layers, FileText, CheckCircle2, SlidersHorizontal, Database, Cloud, Mail, FileVideo } from 'lucide-react'
import RichContentRenderer from './RichContentRenderer'

export default function SearchView() {
  const [mode, setMode] = useState('chat') // 'chat' or 'search'
  const [searchType, setSearchType] = useState('GRAPH_COMPLETION')
  const [onlyContext, setOnlyContext] = useState(false)
  const [messages, setMessages] = useState([
    { 
      role: 'ai', 
      text: 'Hello! I am your Company Brain connected to Cognee. You can test Chat/Q&A or Independent Retrieval Search across uploaded multi-files, OneDrive, and Outlook connectors.',
      sources: []
    }
  ])
  const [searchResults, setSearchResults] = useState(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    if (mode === 'chat') {
      scrollToBottom()
    }
  }, [messages, mode])

  const handleSend = async (e) => {
    e?.preventDefault()
    if (!input.trim()) return

    const queryText = input
    setInput('')
    setLoading(true)

    if (mode === 'chat') {
      setMessages(prev => [...prev, { role: 'user', text: queryText }])
    } else {
      setSearchResults(null)
    }

    try {
      const res = await fetch('http://localhost:3001/api/brain/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryText,
          searchType: searchType,
          mode: mode,
          onlyContext: mode === 'search' || onlyContext
        })
      })
      
      const data = await res.json()
      
      if (res.ok) {
        const aiResponse = typeof data.answer === 'string' 
          ? data.answer 
          : JSON.stringify(data.answer, null, 2)

        if (mode === 'chat') {
          setMessages(prev => [...prev, {
            role: 'ai',
            text: aiResponse,
            tableData: data.tableData,
            sources: data.sources || [],
            searchType: data.searchType
          }])
        } else {
          setSearchResults({
            query: queryText,
            answer: aiResponse,
            tableData: data.tableData,
            sources: data.sources || [],
            rawResult: data.rawResult,
            searchType: data.searchType
          })
        }
      } else {
        const errorMsg = `Error: ${data.error || 'Failed to execute query'}`
        if (mode === 'chat') {
          setMessages(prev => [...prev, { role: 'ai', text: errorMsg }])
        } else {
          setSearchResults({ error: errorMsg })
        }
      }
    } catch (err) {
      console.error("Search / Query error", err)
      const errText = 'Sorry, encountered an error processing your query.'
      if (mode === 'chat') {
        setMessages(prev => [...prev, { role: 'ai', text: errText }])
      } else {
        setSearchResults({ error: errText })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      {/* Mode Switcher & Search Config Bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        marginBottom: '1rem'
      }}>
        {/* Chat Mode vs Independent Search Mode Toggle */}
        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <button 
            className={`tab-btn ${mode === 'chat' ? 'active' : ''}`}
            onClick={() => setMode('chat')}
            style={{ padding: '6px 14px', fontSize: '0.85rem' }}
          >
            <MessageSquare size={16} style={{ display: 'inline', marginRight: '6px' }} />
            Chat / Q&A Mode
          </button>
          <button 
            className={`tab-btn ${mode === 'search' ? 'active' : ''}`}
            onClick={() => setMode('search')}
            style={{ padding: '6px 14px', fontSize: '0.85rem' }}
          >
            <Search size={16} style={{ display: 'inline', marginRight: '6px' }} />
            Independent Search Mode
          </button>
        </div>

        {/* Search Type Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <SlidersHorizontal size={14} /> Search Algorithm:
          </span>
          <select 
            value={searchType}
            onChange={(e) => setSearchType(e.target.value)}
            style={{
              background: 'rgba(17, 24, 39, 0.8)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '0.82rem'
            }}
          >
            <option value="GRAPH_COMPLETION">GRAPH_COMPLETION (Cognee Knowledge Graph)</option>
            <option value="CHUNKS">CHUNKS (Vector Text Chunks)</option>
            <option value="SUMMARIES">SUMMARIES (Document Summaries)</option>
            <option value="HYBRID_COMPLETION">HYBRID_COMPLETION (Graph + Chunks)</option>
          </select>
        </div>
      </div>

      {/* Main Mode Content */}
      {mode === 'chat' ? (
        /* Chat / Q&A Interface */
        <div className="chat-container">
          <div className="chat-history">
            {messages.map((msg, idx) => (
              <div key={idx} className={`message ${msg.role}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', opacity: 0.8, fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {msg.role === 'user' ? <User size={14} /> : <BrainCircuit size={14} />}
                    {msg.role === 'user' ? 'You' : 'Company Brain'}
                  </div>
                  {msg.searchType && (
                    <span style={{ fontSize: '0.72rem', background: 'rgba(99, 102, 241, 0.2)', color: '#a5b4fc', padding: '2px 6px', borderRadius: '4px' }}>
                      {msg.searchType}
                    </span>
                  )}
                </div>
                <RichContentRenderer text={msg.text} tableData={msg.tableData} />

                {/* Sources Citation Box */}
                {msg.sources && msg.sources.length > 0 && (
                  <div style={{ marginTop: '0.8rem', paddingTop: '0.6rem', borderTop: '1px dashed rgba(255,255,255,0.15)' }}>
                    <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginBottom: '0.4rem', fontWeight: 600 }}>
                      Retrieved Sources & Attributions:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {msg.sources.map((src, i) => (
                        <div key={i} style={{
                          fontSize: '0.75rem',
                          background: 'rgba(0,0,0,0.3)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          {src.sourceType === 'DATABASE' ? (
                            <Database size={12} color="#38bdf8" />
                          ) : src.sourceType === 'MEDIA_UPLOAD' ? (
                            <FileVideo size={12} color="#34d399" />
                          ) : src.sourceType === 'ONEDRIVE' ? (
                            <Cloud size={12} color="#38bdf8" />
                          ) : src.sourceType === 'OUTLOOK' ? (
                            <Mail size={12} color="#fbbf24" />
                          ) : (
                            <FileText size={12} color="#818cf8" />
                          )}
                          <span style={{ fontWeight: 600, color: '#e0e7ff' }}>{src.title}</span>
                          <span style={{ color: '#34d399', fontSize: '0.7rem' }}>({Math.round(src.relevance * 100)}% match)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="message ai">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: 0.8 }}>
                  <Loader size={16} className="lucide-spin" style={{ animation: 'spin 2s linear infinite' }} />
                  Cognee is querying Knowledge Graph & Vector Indexes...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          
          {/* Quick Query Suggestion Chips */}
          <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', padding: '0.4rem 0', marginBottom: '0.4rem' }}>
            {[
              { label: '📊 List Database Tables', query: 'What database tables and records are connected?' },
              { label: '🔍 Search Table Data', query: 'Show me data records from the database tables' },
              { label: '☁️ OneDrive Documents', query: 'What documents are stored on OneDrive?' },
              { label: '📧 Ganesh Outlook Email', query: 'What did Ganesh say in his latest email?' }
            ].map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setInput(chip.query)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '16px',
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSend} className="chat-input-area">
            <input 
              type="text" 
              className="chat-input"
              placeholder="Ask about database tables, schema records, OneDrive files, Ganesh's email..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button type="submit" className="btn-primary" disabled={loading || !input.trim()}>
              <Send size={18} />
            </button>
          </form>
        </div>
      ) : (
        /* Independent Search & Retrieval Lab Interface */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', flex: 1 }}>
          <form onSubmit={handleSend} style={{ display: 'flex', gap: '0.8rem' }}>
            <input 
              type="text" 
              className="chat-input"
              placeholder="Enter search query to test direct retrieval chunks & graph nodes..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button type="submit" className="btn-primary" disabled={loading || !input.trim()} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Search size={18} /> Test Search
            </button>
          </form>

          {loading && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Loader size={24} style={{ animation: 'spin 2s linear infinite' }} />
              <div style={{ marginTop: '0.5rem' }}>Executing independent search query...</div>
            </div>
          )}

          {searchResults && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              {/* Search Quality Summary */}
              <div style={{
                background: 'rgba(17, 24, 39, 0.7)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                borderRadius: '10px',
                padding: '1.2rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <CheckCircle2 size={18} /> Search Retrieval Results
                  </h3>
                  <span style={{ fontSize: '0.78rem', background: 'rgba(99, 102, 241, 0.2)', color: '#a5b4fc', padding: '3px 10px', borderRadius: '12px' }}>
                    {searchResults.searchType}
                  </span>
                </div>

                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', fontFamily: 'sans-serif' }}>
                  <RichContentRenderer text={searchResults.answer} tableData={searchResults.tableData} />
                </div>
              </div>

              {/* Source Retrieval Breakdown */}
              {searchResults.sources && searchResults.sources.length > 0 && (
                <div style={{
                  background: 'rgba(17, 24, 39, 0.7)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '10px',
                  padding: '1.2rem'
                }}>
                  <h4 style={{ margin: '0 0 0.8rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Layers size={16} color="#34d399" /> Cited Retrieval Sources ({searchResults.sources.length})
                  </h4>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.8rem' }}>
                    {searchResults.sources.map((src, idx) => (
                      <div key={idx} style={{
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        padding: '0.8rem'
                      }}>
                        <div style={{ fontWeight: 600, color: '#f3f4f6', marginBottom: '0.3rem', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {src.sourceType === 'DATABASE' ? (
                            <Database size={14} color="#38bdf8" />
                          ) : src.sourceType === 'MEDIA_UPLOAD' ? (
                            <FileVideo size={14} color="#34d399" />
                          ) : src.sourceType === 'ONEDRIVE' ? (
                            <Cloud size={14} color="#38bdf8" />
                          ) : src.sourceType === 'OUTLOOK' ? (
                            <Mail size={14} color="#fbbf24" />
                          ) : (
                            <FileText size={14} color="#818cf8" />
                          )}
                          <span>{src.title}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          <span style={{
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: src.sourceType === 'DATABASE' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255,255,255,0.05)',
                            color: src.sourceType === 'DATABASE' ? '#38bdf8' : '#cbd5e1'
                          }}>
                            {src.sourceType}
                          </span>
                          <span style={{ color: '#34d399', fontWeight: 600 }}>{Math.round(src.relevance * 100)}% Match</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
