import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import './DocumentDetail.css'

const PAGE_SIZE = 100

export function AuditTrail() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [docId, setDocId] = useState('')
  const [requestId, setRequestId] = useState('')
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => { load(true) }, [])

  const load = async (reset = false) => {
    setLoading(true)
    try {
      const off = reset ? 0 : offset
      const params = { limit: PAGE_SIZE, offset: off }
      if (docId.trim()) params.docId = docId.trim()
      if (requestId.trim()) params.requestId = requestId.trim()
      const res = await api.getAuditEvents(params)
      if (res.ok) {
        const list = res.events || []
        setEvents(reset ? list : [...events, ...list])
        if (reset) setOffset(list.length)
        else setOffset(off + list.length)
        setHasMore(list.length === PAGE_SIZE)
      }
    } catch (e) {
      console.error('Failed to load audit events', e)
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = (e) => {
    e.preventDefault()
    load(true)
  }

  return (
    <div className="detail-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Audit Trail</h1>
          <p className="page-subtitle">Append-only record of every signing event</p>
        </div>
        <button className="btn-secondary" onClick={() => load(true)}>Refresh</button>
      </header>

      <div className="page-content detail-grid">
        <section className="card">
          <form onSubmit={applyFilters} style={{ display: 'flex', gap: 12, padding: '20px 24px', flexWrap: 'wrap' }}>
            <input
              placeholder="Filter by document ID"
              value={docId}
              onChange={(e) => setDocId(e.target.value)}
              style={{ flex: 1, minWidth: 200, padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: 10 }}
            />
            <input
              placeholder="Filter by request ID"
              value={requestId}
              onChange={(e) => setRequestId(e.target.value)}
              style={{ flex: 1, minWidth: 200, padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: 10 }}
            />
            <button type="submit" className="btn-primary">Apply</button>
          </form>
        </section>

        <section className="card">
          {loading && events.length === 0 ? (
            <div className="loading-state">Loading...</div>
          ) : events.length === 0 ? (
            <div className="empty-state">
              <h3>No audit events</h3>
              <p>Events appear here as documents are uploaded, sent, viewed and signed.</p>
            </div>
          ) : (
            <table className="audit-table">
              <thead><tr><th>Time</th><th>Event</th><th>Document</th><th>Request</th><th>Signer</th><th>IP</th></tr></thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td>{e.created_at ? new Date(e.created_at).toLocaleString() : '—'}</td>
                    <td><code>{e.event}</code></td>
                    <td>{e.doc_id ? <Link to={`/documents/${e.doc_id}`}>{e.doc_id.slice(0, 12)}…</Link> : '—'}</td>
                    <td>{e.request_id ? e.request_id.slice(0, 12) + '…' : '—'}</td>
                    <td>{e.signer_id ? e.signer_id.slice(0, 12) + '…' : (e.user || '—')}</td>
                    <td>{e.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {hasMore && (
            <div style={{ padding: 20, textAlign: 'center' }}>
              <button className="btn-secondary" onClick={() => load(false)} disabled={loading}>
                {loading ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
