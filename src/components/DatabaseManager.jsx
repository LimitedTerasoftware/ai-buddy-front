import { useState, useEffect } from 'react'
import { Database, Plus, RefreshCw, CheckCircle2, AlertCircle, Trash2, Table, Eye, Zap, Layers, Server, ArrowRight, ShieldCheck, HardDrive } from 'lucide-react'

export default function DatabaseManager({ onSyncComplete }) {
  const [databases, setDatabases] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  
  // New connection form state
  const [formData, setFormData] = useState({
    name: 'Local PostgreSQL',
    db_type: 'postgres',
    host: 'localhost',
    port: 5432,
    database_name: 'postgres',
    username: 'postgres',
    password: '',
    ssl: false,
    filepath: ''
  })
  
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [syncingId, setSyncingId] = useState(null)
  const [syncNotice, setSyncNotice] = useState(null)
  const [expandedDbId, setExpandedDbId] = useState(null)
  const [dbTables, setDbTables] = useState({})
  const [loadingTablesId, setLoadingTablesId] = useState(null)
  
  // Table preview modal state
  const [previewData, setPreviewData] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  useEffect(() => {
    fetchDatabases()
  }, [])

  const fetchDatabases = async () => {
    setLoading(true)
    try {
      const res = await fetch('http://localhost:3001/api/databases')
      if (res.ok) {
        const data = await res.json()
        setDatabases(data.databases || [])
      }
    } catch (err) {
      console.error('Failed to fetch databases:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('http://localhost:3001/api/databases/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      const data = await res.json()
      setTestResult(data)
    } catch (err) {
      setTestResult({ success: false, error: err.message })
    } finally {
      setTesting(false)
    }
  }

  const handleCreateConnection = async (e) => {
    e.preventDefault()
    setTesting(true)
    try {
      const res = await fetch('http://localhost:3001/api/databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      const data = await res.json()
      if (res.ok) {
        setShowAddModal(false)
        setTestResult(null)
        fetchDatabases()
      } else {
        alert(`Failed to save database connection: ${data.error}`)
      }
    } catch (err) {
      alert(`Error saving database: ${err.message}`)
    } finally {
      setTesting(false)
    }
  }

  const handleDeleteConnection = async (id, name) => {
    if (!confirm(`Are you sure you want to disconnect and delete '${name}'?`)) return
    try {
      const res = await fetch(`http://localhost:3001/api/databases/${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchDatabases()
        if (onSyncComplete) onSyncComplete()
      }
    } catch (err) {
      alert('Failed to delete database connection')
    }
  }

  const handleExploreTables = async (dbId) => {
    if (expandedDbId === dbId) {
      setExpandedDbId(null)
      return
    }
    setExpandedDbId(dbId)
    setLoadingTablesId(dbId)
    try {
      const res = await fetch(`http://localhost:3001/api/databases/${dbId}/tables`)
      if (res.ok) {
        const data = await res.json()
        setDbTables(prev => ({ ...prev, [dbId]: data.tables }))
      }
    } catch (err) {
      console.error('Error fetching tables:', err)
    } finally {
      setLoadingTablesId(null)
    }
  }

  const handleSyncAllTables = async (dbId, name) => {
    setSyncingId(dbId)
    setSyncNotice(null)
    try {
      const res = await fetch(`http://localhost:3001/api/databases/${dbId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxRowsPerTable: 150 })
      })
      const data = await res.json()
      if (res.ok) {
        setSyncNotice({ type: 'success', text: `Successfully synced ${data.tablesCount} tables from '${name}' into Cognee Knowledge Graph!` })
        fetchDatabases()
        if (onSyncComplete) onSyncComplete()
      } else {
        setSyncNotice({ type: 'error', text: `Sync failed: ${data.error}` })
      }
    } catch (err) {
      setSyncNotice({ type: 'error', text: `Sync request error: ${err.message}` })
    } finally {
      setSyncingId(null)
    }
  }

  const handlePreviewTable = async (dbId, tableName) => {
    setLoadingPreview(true)
    setPreviewData(null)
    try {
      const res = await fetch(`http://localhost:3001/api/databases/${dbId}/tables/${tableName}/rows?limit=20`)
      if (res.ok) {
        const data = await res.json()
        setPreviewData(data)
      }
    } catch (err) {
      console.error('Error previewing table:', err)
    } finally {
      setLoadingPreview(false)
    }
  }

  return (
    <div style={{
      background: 'rgba(17, 24, 39, 0.75)',
      borderRadius: '12px',
      border: '1px solid rgba(255,255,255,0.1)',
      padding: '1.4rem',
      marginTop: '1.5rem'
    }}>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', flexWrap: 'wrap', gap: '0.8rem' }}>
        <div>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#60a5fa' }}>
            <Database size={22} color="#38bdf8" /> Multi-Database Connections & All-Tables Sync
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
            Connect PostgreSQL, MySQL, or SQLite databases without disturbance. Introspect schemas, explore tables, and ingest all table data into Cognee Knowledge Graph.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button 
            onClick={fetchDatabases} 
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem', padding: '6px 12px' }}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'lucide-spin' : ''} /> Refresh
          </button>

          <button 
            onClick={() => setShowAddModal(true)} 
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem', padding: '6px 14px', background: '#2563eb' }}
          >
            <Plus size={16} /> Connect Database
          </button>
        </div>
      </div>

      {/* Sync notification banner */}
      {syncNotice && (
        <div style={{
          marginBottom: '1rem',
          padding: '10px 14px',
          borderRadius: '8px',
          fontSize: '0.85rem',
          background: syncNotice.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          border: `1px solid ${syncNotice.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          color: syncNotice.type === 'success' ? '#6ee7b7' : '#fca5a5',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          {syncNotice.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{syncNotice.text}</span>
        </div>
      )}

      {/* List of Connected Databases */}
      {databases.length === 0 ? (
        <div style={{
          padding: '2.5rem',
          textAlign: 'center',
          background: 'rgba(0,0,0,0.2)',
          borderRadius: '8px',
          border: '1px dashed rgba(255,255,255,0.1)'
        }}>
          <Server size={36} color="#6b7280" style={{ margin: '0 auto 0.8rem auto', display: 'block' }} />
          <div style={{ fontWeight: 600, color: '#e5e7eb', marginBottom: '0.3rem' }}>No Databases Connected Yet</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.2rem', maxWidth: '460px', margin: '0 auto 1.2rem auto' }}>
            Connect your PostgreSQL, MySQL, or SQLite databases to automatically discover all tables and synchronize records directly into the Company Brain.
          </div>
          <button 
            onClick={() => setShowAddModal(true)} 
            className="btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
          >
            <Plus size={16} /> Connect Your First Database
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {databases.map(dbConn => (
            <div key={dbConn.id} style={{
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.08)',
              padding: '1.2rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.8rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: '#f3f4f6' }}>{dbConn.name}</span>
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: 'rgba(56, 189, 248, 0.15)',
                      color: '#38bdf8',
                      textTransform: 'uppercase'
                    }}>
                      {dbConn.db_type}
                    </span>
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: dbConn.status === 'CONNECTED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: dbConn.status === 'CONNECTED' ? '#34d399' : '#f87171'
                    }}>
                      {dbConn.status}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                    <span>Host: <strong style={{ color: '#d1d5db' }}>{dbConn.host || 'localhost'}</strong>:{dbConn.port || 5432}</span>
                    <span>Database: <strong style={{ color: '#d1d5db' }}>{dbConn.database_name}</strong></span>
                    <span>Tables: <strong style={{ color: '#818cf8' }}>{dbConn.tables_count || 0}</strong></span>
                    <span>Last Synced: <strong style={{ color: '#9ca3af' }}>{dbConn.last_synced_at ? new Date(dbConn.last_synced_at).toLocaleString() : 'Never'}</strong></span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <button
                    onClick={() => handleExploreTables(dbConn.id)}
                    className="btn-secondary"
                    style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Table size={14} /> {expandedDbId === dbConn.id ? 'Hide Tables' : 'Explore Tables'}
                  </button>

                  <button
                    onClick={() => handleSyncAllTables(dbConn.id, dbConn.name)}
                    disabled={syncingId === dbConn.id}
                    className="btn-primary"
                    style={{
                      fontSize: '0.8rem',
                      padding: '6px 14px',
                      background: '#059669',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    <Zap size={14} className={syncingId === dbConn.id ? 'lucide-spin' : ''} />
                    {syncingId === dbConn.id ? 'Syncing All Tables...' : 'Sync All Tables to Cognee'}
                  </button>

                  <button
                    onClick={() => handleDeleteConnection(dbConn.id, dbConn.name)}
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      color: '#f87171',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                    title="Disconnect database"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Expanded Tables Explorer */}
              {expandedDbId === dbConn.id && (
                <div style={{
                  marginTop: '1rem',
                  paddingTop: '1rem',
                  borderTop: '1px solid rgba(255,255,255,0.08)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e0e7ff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Layers size={15} color="#818cf8" /> Discovered Tables & Schemas in {dbConn.name}
                    </div>
                    {loadingTablesId === dbConn.id && (
                      <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Introspecting schema...</span>
                    )}
                  </div>

                  {dbTables[dbConn.id] && dbTables[dbConn.id].length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.8rem' }}>
                      {dbTables[dbConn.id].map(table => (
                        <div key={table.tableName} style={{
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: '8px',
                          padding: '0.8rem',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between'
                        }}>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 600, color: '#67e8f9', fontSize: '0.9rem' }}>{table.tableName}</span>
                              <span style={{ fontSize: '0.75rem', background: 'rgba(0,0,0,0.4)', padding: '2px 6px', borderRadius: '4px', color: '#a5b4fc' }}>
                                {table.rowCount} rows
                              </span>
                            </div>

                            <div style={{ fontSize: '0.76rem', color: '#9ca3af', marginTop: '6px', maxHeight: '70px', overflowY: 'auto' }}>
                              {table.columns.map(col => col.name).join(', ')}
                            </div>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.8rem', paddingTop: '0.5rem', borderTop: '1px dashed rgba(255,255,255,0.06)' }}>
                            <span style={{ fontSize: '0.74rem', color: '#6b7280' }}>{table.columns.length} columns</span>
                            <button
                              onClick={() => handlePreviewTable(dbConn.id, table.tableName)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#38bdf8',
                                fontSize: '0.76rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '2px 6px'
                              }}
                            >
                              <Eye size={12} /> Preview Data
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.82rem', color: '#9ca3af', fontStyle: 'italic', padding: '0.5rem 0' }}>
                      {loadingTablesId === dbConn.id ? 'Loading table metadata...' : 'No tables detected or table introspection failed.'}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Database Connection Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: '#111827',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '520px',
            padding: '1.5rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            <h3 style={{ margin: '0 0 0.4rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Database size={20} color="#38bdf8" /> Connect New Database
            </h3>
            <p style={{ margin: '0 0 1.2rem 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Configure read-only access to introspect tables and index relational knowledge into Cognee.
            </p>

            <form onSubmit={handleCreateConnection} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Connection Name:</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.85rem' }}
                    placeholder="e.g. Analytics Postgres"
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Database Engine:</label>
                  <select
                    value={formData.db_type}
                    onChange={(e) => {
                      const t = e.target.value
                      setFormData({ 
                        ...formData, 
                        db_type: t, 
                        port: t === 'mysql' ? 3306 : t === 'postgres' ? 5432 : formData.port 
                      })
                    }}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.85rem' }}
                  >
                    <option value="postgres">PostgreSQL</option>
                    <option value="mysql">MySQL / MariaDB</option>
                    <option value="sqlite">SQLite</option>
                  </select>
                </div>
              </div>

              {formData.db_type !== 'sqlite' ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.8rem' }}>
                    <div>
                      <label style={{ fontSize: '0.78rem', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Host:</label>
                      <input
                        type="text"
                        required
                        value={formData.host}
                        onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.85rem' }}
                        placeholder="localhost"
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.78rem', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Port:</label>
                      <input
                        type="number"
                        required
                        value={formData.port}
                        onChange={(e) => setFormData({ ...formData, port: Number(e.target.value) })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.78rem', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Database Name:</label>
                    <input
                      type="text"
                      required
                      value={formData.database_name}
                      onChange={(e) => setFormData({ ...formData, database_name: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.85rem' }}
                      placeholder="postgres"
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                    <div>
                      <label style={{ fontSize: '0.78rem', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Username:</label>
                      <input
                        type="text"
                        value={formData.username}
                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.85rem' }}
                        placeholder="postgres"
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.78rem', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Password:</label>
                      <input
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.85rem' }}
                        placeholder="••••••"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label style={{ fontSize: '0.78rem', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>SQLite File Path:</label>
                  <input
                    type="text"
                    required
                    value={formData.filepath || formData.database_name}
                    onChange={(e) => setFormData({ ...formData, filepath: e.target.value, database_name: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.85rem' }}
                    placeholder="c:/path/to/data.sqlite"
                  />
                </div>
              )}

              {/* Test Connection Output Feedback */}
              {testResult && (
                <div style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  background: testResult.success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  border: `1px solid ${testResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  color: testResult.success ? '#6ee7b7' : '#fca5a5'
                }}>
                  {testResult.success ? (
                    <div>
                      ✓ <strong>Connected:</strong> {testResult.version} ({testResult.tableCount} tables discovered, {testResult.latencyMs}ms)
                    </div>
                  ) : (
                    <div>
                      ✗ <strong>Connection Failed:</strong> {testResult.error}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.8rem' }}>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="btn-secondary"
                  style={{ fontSize: '0.82rem', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  <ShieldCheck size={15} /> {testing ? 'Testing...' : 'Test Connection'}
                </button>

                <div style={{ display: 'flex', gap: '0.6rem' }}>
                  <button
                    type="button"
                    onClick={() => { setShowAddModal(false); setTestResult(null); }}
                    className="btn-secondary"
                    style={{ fontSize: '0.82rem', padding: '8px 14px' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={testing}
                    className="btn-primary"
                    style={{ fontSize: '0.82rem', padding: '8px 16px', background: '#2563eb' }}
                  >
                    Save & Register
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table Data Preview Modal */}
      {previewData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1.5rem'
        }}>
          <div style={{
            background: '#111827',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '850px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            padding: '1.5rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#38bdf8' }}>
                  <Table size={20} /> Preview Table: {previewData.tableName}
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Showing top {previewData.rowCount} records (read-only safe preview)</span>
              </div>
              <button 
                onClick={() => setPreviewData(null)}
                className="btn-secondary"
                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
              >
                Close
              </button>
            </div>

            <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, background: 'rgba(0,0,0,0.4)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
              {previewData.rows && previewData.rows.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      {Object.keys(previewData.rows[0]).map(col => (
                        <th key={col} style={{ padding: '8px 12px', color: '#93c5fd', fontWeight: 600 }}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.rows.map((row, rIdx) => (
                      <tr key={rIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        {Object.values(row).map((val, cIdx) => (
                          <td key={cIdx} style={{ padding: '8px 12px', color: '#e5e7eb', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {val === null ? <span style={{ color: '#6b7280' }}>NULL</span> : typeof val === 'object' ? JSON.stringify(val) : String(val)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>No rows found in table.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
