import { useState, useRef, useEffect } from 'react'
import { UploadCloud, File, Layers, Sparkles, Cloud, Mail, Key, RefreshCw, Database, FileVideo } from 'lucide-react'
import DatabaseManager from './DatabaseManager'

export default function UploadView() {
  const [dragActive, setDragActive] = useState(false)
  const [documents, setDocuments] = useState([])
  const [uploading, setUploading] = useState(false)
  const [connectorIngesting, setConnectorIngesting] = useState(false)
  const [authToken, setAuthToken] = useState('')
  const [connectorNotice, setConnectorNotice] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    fetchDocuments()
  }, [])

  const fetchDocuments = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/documents')
      if (res.ok) {
        const data = await res.json()
        setDocuments(data.documents)
      }
    } catch (err) {
      console.error("Failed to fetch documents", err)
    }
  }

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUploads(Array.from(e.dataTransfer.files))
    }
  }

  const handleChange = (e) => {
    e.preventDefault()
    if (e.target.files && e.target.files.length > 0) {
      handleFileUploads(Array.from(e.target.files))
    }
  }

  const handleFileUploads = async (files) => {
    setUploading(true)
    const formData = new FormData()
    files.forEach(file => {
      formData.append('files', file)
    })

    try {
      const res = await fetch('http://localhost:3001/api/documents/upload', {
        method: 'POST',
        body: formData
      })
      if (res.ok) {
        fetchDocuments()
      } else {
        alert("Failed to upload files.")
      }
    } catch (err) {
      console.error("Upload error", err)
      alert("Error connecting to server.")
    } finally {
      setUploading(false)
    }
  }

  const handleIngestConnector = async (sourceType) => {
    setConnectorIngesting(true)
    setConnectorNotice(null)
    try {
      const res = await fetch('http://localhost:3001/api/documents/connectors/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType,
          authToken: authToken.trim()
        })
      })

      const data = await res.json()
      if (res.ok) {
        setConnectorNotice(`Successfully started ${sourceType} connector ingestion (${data.documents.length} items)!`)
        fetchDocuments()
      } else {
        setConnectorNotice(`Connector Error: ${data.error}`)
      }
    } catch (err) {
      console.error("Connector error", err)
      setConnectorNotice(`Failed to connect to ${sourceType} API`)
    } finally {
      setConnectorIngesting(false)
    }
  }

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Data Sources & Knowledge Ingestion</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.92rem' }}>
        Ingest multi-files or sync external data connectors (OneDrive & Outlook API) into Cognee for chunking, embedding, and Knowledge Graph creation.
      </p>

      {/* Grid layout: Drag & Drop Multi-file + Connector Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* Multi-file Upload Box */}
        <div 
          className={`upload-dropzone ${dragActive ? "drag-active" : ""}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{ height: '100%', minHeight: '220px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
        >
          <UploadCloud className="upload-icon" />
          <div>
            <h3 style={{ margin: '0 0 0.4rem 0' }}>Drag & Drop Multi-Files</h3>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.85rem' }}>
              Select multiple files simultaneously (PDF, DOCX, XLSX, CSV, TXT, MP4, MP3, WAV)
            </p>
          </div>
          <button className="btn-primary" disabled={uploading} style={{ marginTop: '1rem' }}>
            {uploading ? 'Ingesting Files...' : 'Select File(s)'}
          </button>
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleChange}
            multiple
            accept=".pdf,.doc,.docx,.xlsx,.xls,.csv,.txt,.md,.json,.mp4,.mp3,.wav,.m4a,.webm,.ogg,.flac,audio/*,video/*"
            style={{ display: 'none' }} 
          />
        </div>

        {/* Data Connectors Card */}
        <div style={{
          background: 'rgba(17, 24, 39, 0.7)',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.1)',
          padding: '1.2rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div>
            <h3 style={{ margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Cloud color="#38bdf8" size={22} /> External Data Connectors
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>
              Ingest from OneDrive and Outlook API connectors Ganesh provided (`testingagnoconnectors.fyndo.ai`).
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.78rem', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
                <Key size={12} style={{ display: 'inline', marginRight: '4px' }} /> Connector Bearer Token (Optional):
              </label>
              <input 
                type="text" 
                placeholder="Bearer eyJhbGciOi..."
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(0,0,0,0.3)',
                  color: '#fff',
                  fontSize: '0.82rem'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.8rem', flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <button 
                onClick={() => handleIngestConnector('ONEDRIVE')}
                disabled={connectorIngesting}
                className="btn-primary"
                style={{ flex: 1, background: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
              >
                <Cloud size={16} /> Sync OneDrive
              </button>

              <button 
                onClick={() => handleIngestConnector('OUTLOOK')}
                disabled={connectorIngesting}
                className="btn-primary"
                style={{ flex: 1, background: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
              >
                <Mail size={16} /> Sync Outlook
              </button>
            </div>

            {connectorNotice && (
              <div style={{
                fontSize: '0.8rem',
                padding: '8px 10px',
                borderRadius: '6px',
                background: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                color: '#a5b4fc'
              }}>
                {connectorNotice}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Multi-Database Connection & Table Synchronization Engine */}
      <DatabaseManager onSyncComplete={fetchDocuments} />

      {/* Ingested Sources List */}
      {documents.length > 0 && (
        <div className="document-list" style={{ marginTop: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>Ingested Knowledge Sources ({documents.length})</h3>
            <button 
              onClick={fetchDocuments}
              style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}
            >
              <RefreshCw size={14} /> Refresh List
            </button>
          </div>

          {documents.map(doc => (
            <div className="document-item" key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {doc.source_type === 'DATABASE' ? (
                  <Database size={22} color="#38bdf8" />
                ) : doc.source_type === 'MEDIA_UPLOAD' ? (
                  <FileVideo size={22} color="#34d399" />
                ) : (
                  <File size={22} color="var(--primary)" />
                )}
                <div>
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {doc.original_name}
                    <span style={getSourceBadge(doc.source_type)}>
                      {doc.source_type || 'FILE_UPLOAD'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                    {(doc.size_bytes / 1024).toFixed(1)} KB • Ingested: {new Date(doc.created_at).toLocaleString()}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
                <div style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', gap: '0.8rem', color: '#e0e7ff' }}>
                    <span><Layers size={12} style={{ display: 'inline', marginRight: '3px' }} /> {doc.chunks_count || 1} Chunks</span>
                    <span><Sparkles size={12} style={{ display: 'inline', marginRight: '3px' }} /> {doc.entities_count || 1} Entities</span>
                  </div>
                </div>

                <span className={`status-badge ${doc.status.toLowerCase()}`}>
                  {doc.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function getSourceBadge(type) {
  let bg = 'rgba(99, 102, 241, 0.2)'
  let color = '#a5b4fc'

  if (type === 'ONEDRIVE') {
    bg = 'rgba(14, 165, 233, 0.2)'
    color = '#38bdf8'
  } else if (type === 'OUTLOOK') {
    bg = 'rgba(245, 158, 11, 0.2)'
    color = '#fbbf24'
  } else if (type === 'DATABASE') {
    bg = 'rgba(16, 185, 129, 0.2)'
    color = '#34d399'
  } else if (type === 'MEDIA_UPLOAD') {
    bg = 'rgba(20, 184, 166, 0.2)'
    color = '#5eead4'
  }

  return {
    fontSize: '0.7rem',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '4px',
    background: bg,
    color: color
  }
}
