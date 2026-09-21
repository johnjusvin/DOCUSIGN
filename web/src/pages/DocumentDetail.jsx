import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client'
import './DocumentDetail.css'

export function DocumentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [doc, setDoc] = useState(null)
  const [requests, setRequests] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { load() }, [id])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [d, r, a] = await Promise.all([
        api.getDocument(id),
        api.listRequests({ docId: id }),
        api.getAuditEvents({ docId: id, limit: 100 }),
      ])
      if (!d.ok) throw new Error(d.error || 'Document not found')
      setDoc(d.document)
      setNameDraft(d.document.name)
      if (r.ok) setRequests(r.requests || [])
      if (a.ok) setEvents(a.events || [])
    } catch (e) {
      setError(e.message || 'Failed to load document')
    } finally {
      setLoading(false)
    }
  }

  const saveName = async () => {
    setBusy(true)
    try {
      const res = await api.updateDocument(id, { name: nameDraft })
      if (!res.ok) throw new Error(res.error || 'Rename failed')
      setDoc(res.document)
      setEditingName(false)
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  const toggleArchive = async () => {
    setBusy(true)
    try {
      const res = await api.updateDocument(id, { archived: !doc.archived })
      if (!res.ok) throw new Error(res.error || 'Update failed')
      setDoc(res.document)
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${doc.name}" and its Drive/local files? This cannot be undone.`)) return
    try {
      await api.deleteDocument(id)
      navigate('/documents')
    } catch (e) {
      alert('Failed to delete document')
    }
  }

  const cancelRequest = async (requestId) => {
    if (!window.confirm('Cancel this signing request? Signers will no longer be able to sign.')) return
    try {
      await api.cancelRequest(requestId)
      load()
    } catch (e) {
      alert(e.message || 'Cancel failed')
    }
  }

  if (loading) return <div className="page-content"><div className="loading-state">Loading...</div></div>
  if (error || !doc) {
    return (
      <div className="page-content">
        <div className="empty-state">
          <h3>{error || 'Document not found'}</h3>
          <Link to="/documents" className="btn-primary" style={{ marginTop: 16 }}>Back to Documents</Link>
        </div>
      </div>
    )
  }

  const activeRequest = requests.find((r) => !['Completed', 'Declined', 'Cancelled', 'Expired'].includes(r.status))

  return (
    <div className="detail-page">
      <header className="page-header">
        <div>
          <Link to="/documents" className="back-link">← Documents</Link>
          {editingName ? (
            <div className="rename-row">
              <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} autoFocus />
              <button className="btn-primary" onClick={saveName} disabled={busy}>Save</button>
              <button className="btn-secondary" onClick={() => { setEditingName(false); setNameDraft(doc.name) }}>Cancel</button>
            </div>
          ) : (
            <h1 className="page-title">{doc.name}</h1>
          )}
          <p className="page-subtitle">
            <span className={`status-badge status-${(doc.status || '').replace(/\s/g, '')}`}>{doc.status}</span>
            {doc.archived && <span className="status-badge status-Archived">Archived</span>}
            {' • '}{doc.page_count || 0} pages{doc.size ? ` • ${formatBytes(doc.size)}` : ''}
            {' • '}created {doc.created_at ? new Date(doc.created_at).toLocaleString() : '—'}
          </p>
        </div>
        <div className="detail-actions">
          <button className="btn-secondary" onClick={() => setEditingName(true)}>Rename</button>
          <button className="btn-secondary" onClick={toggleArchive} disabled={busy}>
            {doc.archived ? 'Unarchive' : 'Archive'}
          </button>
          <button className="btn-secondary danger" onClick={handleDelete}>Delete</button>
        </div>
      </header>

      <div className="page-content detail-grid">
        <section className="card">
          <h3>Files</h3>
          <div className="file-rows">
            <FileRow label="Original PDF" href={`/api/docs/${doc.id}/file`} />
            <FileRow label="Signed PDF" href={doc.signed_ref ? `/api/docs/${doc.id}/signed` : null} />
            <FileRow label="Completion certificate" href={doc.certificate_ref ? `/api/docs/${doc.id}/certificate` : null} />
          </div>
          {doc.sha256 && <p className="hash">SHA-256 (original): <code>{doc.sha256}</code></p>}
        </section>

        <section className="card">
          <div className="card-header">
            <h3>Signing requests ({requests.length})</h3>
            <Link to={`/send?docId=${doc.id}`} className="btn-primary" style={{ padding: '8px 16px', fontSize: 13 }}>Send for Signature</Link>
          </div>
          {requests.length === 0 ? (
            <p className="empty-hint">No signing requests yet.</p>
          ) : requests.map((r) => (
            <div key={r.id} className="request-block">
              <div className="request-head">
                <span className={`status-badge status-${(r.status || '').replace(/\s/g, '')}`}>{r.status}</span>
                <span className="request-meta">{r.mode} • {r.signed_count}/{r.signer_count} signed • sent {r.sent_at ? new Date(r.sent_at).toLocaleString() : '—'}</span>
                {!['Completed', 'Declined', 'Cancelled', 'Expired'].includes(r.status) && (
                  <button className="btn-secondary danger sm" onClick={() => cancelRequest(r.id)}>Cancel</button>
                )}
              </div>
              <ul className="signer-progress">
                {(r.signers || []).map((s) => (
                  <li key={s.id} className={`signer-chip ${s.status}`}>
                    <span className="signer-order">{s.order_index}</span>
                    <span className="signer-who">{s.name} &lt;{s.email}&gt;</span>
                    <span className="signer-st">{s.status}{s.signed_at ? ` • ${new Date(s.signed_at).toLocaleString()}` : ''}</span>
                    <button
                      className="copy-link"
                      title="Copy signer link"
                      onClick={() => { navigator.clipboard.writeText(s.link); alert(`Link copied for ${s.name}`) }}
                    >Copy link</button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {activeRequest && <p className="empty-hint">Tip: open a signer link in another tab to sign as that person.</p>}
        </section>

        <section className="card">
          <h3>Audit trail ({events.length})</h3>
          {events.length === 0 ? (
            <p className="empty-hint">No events recorded yet.</p>
          ) : (
            <table className="audit-table">
              <thead><tr><th>Time</th><th>Event</th><th>Signer</th><th>IP</th></tr></thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td>{e.created_at ? new Date(e.created_at).toLocaleString() : '—'}</td>
                    <td><code>{e.event}</code></td>
                    <td>{e.signer_id ? e.signer_id.slice(0, 12) + '…' : '—'}</td>
                    <td>{e.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  )
}

function FileRow({ label, href }) {
  return (
    <div className="file-row">
      <span>{label}</span>
      {href
        ? <a className="btn-secondary sm" href={href} download>Download</a>
        : <span className="not-yet">Not available yet</span>}
    </div>
  )
}

function formatBytes(bytes) {
  if (!bytes) return ''
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
