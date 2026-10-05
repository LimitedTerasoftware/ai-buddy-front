import React, { useState, useMemo } from 'react'
import { Table, Code, Copy, Check, Download, Search, Database, Layers, ExternalLink } from 'lucide-react'

// Helper to parse markdown table from string if tableData wasn't passed directly
function parseMarkdownTable(text) {
  if (!text || typeof text !== 'string') return null

  const lines = text.split('\n')
  let tableLines = []
  let inTable = false
  let preText = []
  let postText = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith('|') && line.endsWith('|')) {
      inTable = true
      tableLines.push(line)
    } else {
      if (!inTable) {
        preText.push(lines[i])
      } else {
        postText.push(lines[i])
      }
    }
  }

  if (tableLines.length >= 2) {
    // Parse headers
    const rawHeaders = tableLines[0].split('|').map(c => c.trim()).filter(Boolean)
    // Check if line 2 is divider
    const isDivider = tableLines[1].includes('---')
    const dataRowStart = isDivider ? 2 : 1
    
    const rows = []
    for (let r = dataRowStart; r < tableLines.length; r++) {
      const cells = tableLines[r].split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length)
      if (cells.length > 0) {
        const rowObj = {}
        rawHeaders.forEach((h, hIdx) => {
          let val = cells[hIdx] !== undefined ? cells[hIdx] : ''
          if (val === '*NULL*' || val === 'NULL') val = null
          rowObj[h] = val
        })
        rows.push(rowObj)
      }
    }

    // Extract table title if available in preText
    let tableName = 'Table Records'
    let dbSource = ''
    preText.forEach(l => {
      const matchTable = l.match(/Table(?:\s*:\s*|\s+from\s+)`?([a-zA-Z0-9_-]+)`?/i)
      if (matchTable) tableName = matchTable[1]
      const matchSrc = l.match(/Database Source:\s*\*{0,2}([^\*\n\(\)]+)/i)
      if (matchSrc) dbSource = matchSrc[1].trim()
    })

    return {
      tableName,
      dbSource,
      columns: rawHeaders,
      rows,
      preText: preText.join('\n').trim(),
      postText: postText.join('\n').trim()
    }
  }

  return null
}

function TableViewRenderer({ tableInfo }) {
  const { tableName, dbSource, columns, rows } = tableInfo
  const [viewMode, setViewMode] = useState('table') // 'table' | 'json'
  const [searchTerm, setSearchTerm] = useState('')
  const [copied, setCopied] = useState(false)

  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rows
    const term = searchTerm.toLowerCase()
    return rows.filter(r => 
      Object.values(r).some(v => String(v || '').toLowerCase().includes(term))
    )
  }, [rows, searchTerm])

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(rows, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownloadCsv = () => {
    if (!rows || rows.length === 0) return
    const cols = columns || Object.keys(rows[0])
    const headerLine = cols.map(c => `"${c}"`).join(',')
    const dataLines = rows.map(r => 
      cols.map(c => {
        const val = r[c] === null || r[c] === undefined ? '' : String(r[c]).replace(/"/g, '""')
        return `"${val}"`
      }).join(',')
    )
    const csvContent = [headerLine, ...dataLines].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `${tableName || 'table'}_records.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div style={{
      marginTop: '0.8rem',
      marginBottom: '0.8rem',
      background: 'rgba(15, 23, 42, 0.85)',
      border: '1px solid rgba(99, 102, 241, 0.35)',
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)'
    }}>
      {/* Header Controls Bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.75rem 1rem',
        background: 'linear-gradient(90deg, rgba(30, 41, 59, 0.9) 0%, rgba(17, 24, 39, 0.9) 100%)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        gap: '0.8rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{
            background: 'rgba(99, 102, 241, 0.25)',
            color: '#818cf8',
            padding: '6px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center'
          }}>
            <Database size={16} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#f8fafc' }}>
                {tableName}
              </span>
              <span style={{
                fontSize: '0.7rem',
                background: 'rgba(16, 185, 129, 0.2)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                padding: '2px 7px',
                borderRadius: '10px',
                fontWeight: 600
              }}>
                {rows.length} {rows.length === 1 ? 'row' : 'records'}
              </span>
            </div>
            {dbSource && (
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                Source: <span style={{ color: '#cbd5e1' }}>{dbSource}</span>
              </div>
            )}
          </div>
        </div>

        {/* View Switcher & Action Tools */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Table / JSON toggle */}
          <div style={{
            display: 'flex',
            background: 'rgba(0, 0, 0, 0.4)',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <button
              onClick={() => setViewMode('table')}
              style={{
                background: viewMode === 'table' ? 'rgba(99, 102, 241, 0.5)' : 'transparent',
                color: viewMode === 'table' ? '#fff' : '#94a3b8',
                border: 'none',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s'
              }}
            >
              <Table size={13} /> Table View
            </button>
            <button
              onClick={() => setViewMode('json')}
              style={{
                background: viewMode === 'json' ? 'rgba(99, 102, 241, 0.5)' : 'transparent',
                color: viewMode === 'json' ? '#fff' : '#94a3b8',
                border: 'none',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s'
              }}
            >
              <Code size={13} /> JSON Data
            </button>
          </div>

          {/* Quick Actions */}
          <button
            onClick={handleCopyJson}
            title="Copy records as JSON"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: copied ? '#34d399' : '#e2e8f0',
              padding: '5px 9px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s'
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'JSON'}
          </button>

          <button
            onClick={handleDownloadCsv}
            title="Export as CSV spreadsheet"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#e2e8f0',
              padding: '5px 9px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s'
            }}
          >
            <Download size={13} /> CSV
          </button>
        </div>
      </div>

      {/* Main View Area */}
      {viewMode === 'table' ? (
        <div>
          {/* Search / Filter in Table */}
          {rows.length > 3 && (
            <div style={{
              padding: '0.5rem 1rem',
              background: 'rgba(15, 23, 42, 0.5)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <Search size={13} color="#94a3b8" />
              <input
                type="text"
                placeholder={`Filter across ${rows.length} rows...`}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#fff',
                  fontSize: '0.78rem',
                  width: '100%'
                }}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '0.75rem'
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Scrollable Data Table Container */}
          <div style={{ overflowX: 'auto', maxHeight: '420px', overflowY: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '0.8rem'
            }}>
              <thead>
                <tr style={{
                  background: 'rgba(30, 41, 59, 0.8)',
                  position: 'sticky',
                  top: 0,
                  zIndex: 2
                }}>
                  <th style={{
                    padding: '8px 12px',
                    color: '#94a3b8',
                    fontWeight: 600,
                    fontSize: '0.72rem',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    width: '40px',
                    textAlign: 'center'
                  }}>
                    #
                  </th>
                  {columns.map((col, idx) => (
                    <th key={idx} style={{
                      padding: '8px 14px',
                      color: '#a5b4fc',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      letterSpacing: '0.02em',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                      whiteSpace: 'nowrap'
                    }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    style={{
                      background: rIdx % 2 === 0 ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.2)',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseOver={e => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.12)'}
                    onMouseOut={e => e.currentTarget.style.background = rIdx % 2 === 0 ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.2)'}
                  >
                    <td style={{
                      padding: '8px 12px',
                      color: '#64748b',
                      fontSize: '0.72rem',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                      textAlign: 'center'
                    }}>
                      {rIdx + 1}
                    </td>
                    {columns.map((col, cIdx) => {
                      const val = row[col]
                      const isNull = val === null || val === undefined || val === '*NULL*' || val === 'NULL' || val === ''
                      const isNumber = typeof val === 'number' || (!isNaN(val) && val !== '' && !isNaN(parseFloat(val)))

                      return (
                        <td key={cIdx} style={{
                          padding: '8px 14px',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                          color: isNull ? '#64748b' : '#f1f5f9',
                          fontFamily: isNumber ? 'monospace' : 'inherit',
                          whiteSpace: 'nowrap',
                          maxWidth: '260px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }} title={String(val || '')}>
                          {isNull ? (
                            <span style={{
                              fontSize: '0.68rem',
                              background: 'rgba(255, 255, 255, 0.06)',
                              color: '#64748b',
                              padding: '2px 5px',
                              borderRadius: '4px',
                              fontStyle: 'italic'
                            }}>
                              null
                            </span>
                          ) : typeof val === 'object' ? (
                            JSON.stringify(val)
                          ) : (
                            String(val)
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 1} style={{
                      padding: '2rem',
                      textAlign: 'center',
                      color: '#94a3b8',
                      fontSize: '0.85rem'
                    }}>
                      No matching records found for "{searchTerm}"
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* JSON View */
        <div style={{
          padding: '1rem',
          background: 'rgba(10, 15, 29, 0.95)',
          maxHeight: '380px',
          overflowY: 'auto'
        }}>
          <pre style={{
            margin: 0,
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            fontSize: '0.78rem',
            color: '#a5f3fc',
            lineHeight: '1.5'
          }}>
            {JSON.stringify(rows, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

export default function RichContentRenderer({ text, tableData }) {
  if (!text && !tableData) return null

  // If tableData is passed directly from backend
  if (tableData && tableData.rows && tableData.rows.length > 0) {
    const tableInfo = {
      tableName: tableData.tableName || 'Table Records',
      dbSource: tableData.dbSource ? `${tableData.dbSource} (${(tableData.dbType || '').toUpperCase()})` : '',
      columns: tableData.columns || Object.keys(tableData.rows[0] || {}),
      rows: tableData.rows
    }

    // Clean any markdown table from text so it doesn't render twice
    const parsed = parseMarkdownTable(text)
    const cleanPre = parsed?.preText || ''
    const cleanPost = parsed?.postText || ''

    return (
      <div>
        {cleanPre && <div style={{ marginBottom: '0.5rem', whiteSpace: 'pre-wrap' }}>{cleanPre}</div>}
        <TableViewRenderer tableInfo={tableInfo} />
        {cleanPost && <div style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>{cleanPost}</div>}
      </div>
    )
  }

  // Fallback: Check if markdown table is inside text
  const parsed = parseMarkdownTable(text)
  if (parsed && parsed.rows.length > 0) {
    return (
      <div>
        {parsed.preText && (
          <div style={{ marginBottom: '0.5rem', whiteSpace: 'pre-wrap' }}>
            {parsed.preText}
          </div>
        )}
        <TableViewRenderer tableInfo={parsed} />
        {parsed.postText && (
          <div style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>
            {parsed.postText}
          </div>
        )}
      </div>
    )
  }

  // Standard formatted text
  return (
    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.55' }}>
      {text}
    </div>
  )
}
