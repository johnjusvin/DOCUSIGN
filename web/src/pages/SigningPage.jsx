import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api/client'
import { SignaturePad } from '../components/SignaturePad'
import { PdfCanvas, fieldToPercentStyle } from '../components/PdfCanvas'
import './SigningPage.css'

export function SigningPage() {
  const { token } = useParams()
  const [snapshot, setSnapshot] = useState(null)
  const [values, setValues] = useState({})
  const [currentFieldIndex, setCurrentFieldIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showSignaturePad, setShowSignaturePad] = useState(false)
  const [activeSignatureField, setActiveSignatureField] = useState(null)
  const [agreed, setAgreed] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [completedAll, setCompletedAll] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [scale, setScale] = useState(1.25)
  const [declining, setDeclining] = useState(false)

  useEffect(() => {
    loadSnapshot()
  }, [token])

  const loadSnapshot = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.getSignerSnapshot(token)
      if (!res.ok) throw new Error('Invalid signing link')
      setSnapshot(res)
      if (res.signer && res.signer.status === 'signed') setCompleted(true)
      const initial = {}
      for (const f of res.fields || []) {
        if (f.value) {
          try {
            const parsed = JSON.parse(f.value)
            if (parsed.text) initial[f.id] = parsed.text
            if (parsed.chosen) initial[f.id] = parsed.chosen
            if (parsed.checked) initial[f.id] = true
            if (parsed.imageDataUrl) initial[f.id] = parsed.imageDataUrl
          } catch {}
        }
      }
      setValues(initial)
    } catch (e) {
      setError(e.message || 'Failed to load document')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="signing-loading">
        <div className="spinner"></div>
        <p>Loading document...</p>
      </div>
    )
  }

  if (error || !snapshot) {
    return (
      <div className="signing-error">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <h2>Unable to Load Document</h2>
        <p>{error || 'Unknown error'}</p>
        <p className="error-hint">This link may be invalid or expired. Please contact the sender for a new link.</p>
      </div>
    )
  }

  const { signer, request, document, fields = [], signers = [], documentUrl } = snapshot
  const myFields = fields.filter((f) => f.mine)
  const myRequired = myFields.filter((f) => f.required)
  const currentField = myRequired[currentFieldIndex]
  const doneCount = myRequired.filter((f) => isFilled(f, values)).length
  const progress = myRequired.length > 0 ? (doneCount / myRequired.length) * 100 : 100
  const pageSize = (document.page_sizes && document.page_sizes[currentPage]) || { width: 612, height: 792 }
  const totalPages = document.page_sizes ? document.page_sizes.length : document.page_count || 1

  if (completed || signer.status === 'signed') {
    return (
      <div className="signing-complete">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <h2>Document Signed Successfully!</h2>
        <p>Thank you for signing <strong>{document?.name}</strong></p>
        <p className="complete-details">
          {completedAll
            ? 'All signers have finished — the completed document and certificate were generated.'
            : 'Your signature was recorded. You can close this window.'}
        </p>
      </div>
    )
  }

  const setValue = (id, v) => setValues((prev) => ({ ...prev, [id]: v }))

  const handleFieldClick = (field) => {
    if (!field.mine || field.filled) return
    if (field.type === 'signature' || field.type === 'initials') {
      setActiveSignatureField(field)
      setShowSignaturePad(true)
    } else if (field.type === 'checkbox') {
      setValue(field.id, !values[field.id])
    } else if (field.type === 'date') {
      setValue(field.id, new Date().toLocaleDateString())
    } else if (field.type === 'name') {
      setValue(field.id, signer.name)
    } else if (field.type === 'email') {
      setValue(field.id, signer.email)
    }
  }

  const handleSignatureComplete = (signatureData) => {
    if (activeSignatureField) {
      setValue(activeSignatureField.id, signatureData)
      setShowSignaturePad(false)
      const idx = myRequired.findIndex((f) => f.id === activeSignatureField.id)
      if (idx >= 0 && idx < myRequired.length - 1) setCurrentFieldIndex(idx + 1)
      setActiveSignatureField(null)
    }
  }

  const handleSubmit = async () => {
    if (!agreed) { alert('You must agree to sign electronically'); return }
    const missing = myRequired.filter((f) => !isFilled(f, values))
    if (missing.length > 0) { alert(`Please complete all required fields (${missing.length} remaining)`); return }
    setSubmitting(true)
    try {
      const payload = {}
      for (const f of myFields) {
        const v = values[f.id]
        if (v !== undefined && v !== '' && v !== false) payload[f.id] = v
      }
      const res = await api.signAsSigner(token, payload)
      if (res.ok) {
        setCompletedAll(!!res.completed)
        setCompleted(true)
      } else {
        throw new Error(res.error || 'Failed to submit signature')
      }
    } catch (e) {
      alert(e.message || 'Failed to submit signature')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDecline = async () => {
    const reason = window.prompt('Please tell the sender why you are declining (optional):') || ''
    if (reason === null) return
    setDeclining(true)
    try {
      const res = await api.declineAsSigner(token, reason)
      if (res.ok) {
        setError('You have declined this signing request. The sender has been notified.')
      } else {
        throw new Error(res.error || 'Failed to decline')
      }
    } catch (e) {
      alert(e.message || 'Failed to decline')
    } finally {
      setDeclining(false)
    }
  }

  return (
    <div className="signing-page">
      <header className="signing-header">
        <div className="signing-brand">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="8" fill="#0a1628"/>
            <path d="M16 8L22 16L16 24L10 16L16 8Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>REDITUS SIGN</span>
        </div>
        <div className="signing-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }}></div>
          </div>
          <span className="progress-text">{doneCount} of {myRequired.length} required</span>
        </div>
      </header>

      {request.message && (
        <div className="signing-message">
          <strong>Message from sender:</strong> {request.message}
        </div>
      )}

      <main className="signing-main">
        <div className="document-panel">
          <div className="document-toolbar">
            <div className="doc-info">
              <h1>{document?.name}</h1>
              <p>{totalPages} page(s) • {myFields.length} field(s) assigned to you</p>
            </div>
            <div className="page-nav">
              <button onClick={() => setCurrentPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
              </button>
              <span>Page {currentPage + 1} / {totalPages}</span>
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))} disabled={currentPage === totalPages - 1}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </button>
              <div className="zoom-control">
                <button onClick={() => setScale((s) => Math.max(0.6, s - 0.25))}>−</button>
                <span>{Math.round(scale * 100)}%</span>
                <button onClick={() => setScale((s) => Math.min(2.5, s + 0.25))}>+</button>
              </div>
            </div>
          </div>

          <div className="document-canvas-container">
            <PdfCanvas url={documentUrl} page={currentPage} scale={scale}>
              {fields.filter((f) => f.page === currentPage).map((field) => (
                <FieldOverlay
                  key={field.id}
                  field={field}
                  value={values[field.id]}
                  isCurrent={field.id === currentField?.id}
                  onClick={() => handleFieldClick(field)}
                  onTextChange={(v) => setValue(field.id, v)}
                  pageSize={pageSize}
                />
              ))}
            </PdfCanvas>
          </div>
        </div>

        <aside className="sidebar-panel">
          <div className="sidebar-section">
            <h3>Your Required Fields</h3>
            <ul className="field-list">
              {myRequired.map((field) => {
                const idx = myRequired.findIndex((f) => f.id === field.id)
                const filled = isFilled(field, values)
                return (
                  <li
                    key={field.id}
                    className={`field-nav-item ${field.id === currentField?.id ? 'current' : ''} ${filled ? 'filled' : ''}`}
                    onClick={() => { setCurrentFieldIndex(idx); setCurrentPage(field.page) }}
                  >
                    <span className="field-nav-number">{idx + 1}</span>
                    <div className="field-nav-info">
                      <span className="field-nav-type">{field.type}{field.label ? ` — ${field.label}` : ''}</span>
                      <span className="field-nav-page">Page {field.page + 1}</span>
                    </div>
                    {filled && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="field-nav-check">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    )}
                  </li>
                )
              })}
              {myRequired.length === 0 && (
                <li className="field-nav-item empty">No required fields assigned to you</li>
              )}
            </ul>
          </div>

          <div className="sidebar-section">
            <h3>Your Information</h3>
            <div className="signer-info">
              <div className="signer-avatar">{signer?.name?.charAt(0)?.toUpperCase()}</div>
              <div>
                <p className="signer-name">{signer?.name}</p>
                <p className="signer-email">{signer?.email}</p>
              </div>
            </div>
          </div>

          <div className="sidebar-section">
            <h3>Signing Order — {request.mode}</h3>
            <ul className="field-list">
              {signers.map((s, i) => (
                <li key={i} className="field-nav-item">
                  <span className="field-nav-number">{s.order_index}</span>
                  <div className="field-nav-info">
                    <span className="field-nav-type">{s.name}</span>
                    <span className="field-nav-page">{s.status}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="sidebar-section agreement-section">
            <label className="agreement-checkbox">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span className="checkmark"></span>
              <span>I agree to sign this document electronically and acknowledge that my electronic signature has the same legal effect as a handwritten signature.</span>
            </label>
            <button
              className="btn-primary btn-submit"
              onClick={handleSubmit}
              disabled={submitting || !agreed || myRequired.some((f) => !isFilled(f, values))}
            >
              {submitting ? 'Submitting...' : 'Finish Signing'}
            </button>
            <button className="btn-decline" onClick={handleDecline} disabled={declining}>
              {declining ? 'Declining...' : 'Decline to Sign'}
            </button>
          </div>
        </aside>
      </main>

      {showSignaturePad && activeSignatureField && (
        <div className="modal-overlay" onClick={() => setShowSignaturePad(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <SignaturePad
              onComplete={handleSignatureComplete}
              onCancel={() => setShowSignaturePad(false)}
              type={activeSignatureField.type}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function isFilled(field, values) {
  const v = values[field.id]
  if (field.type === 'checkbox') return v === true
  if (field.type === 'signature' || field.type === 'initials') {
    return typeof v === 'string' && v.startsWith('data:image/')
  }
  return typeof v === 'string' && v.trim().length > 0
}

function FieldOverlay({ field, value, isCurrent, onClick, onTextChange, pageSize }) {
  const filled = field.filled || (value !== undefined && value !== '' && value !== false)
  const style = fieldToPercentStyle(field, pageSize.width, pageSize.height)

  const fieldTypeColors = {
    signature: '#0a1628', initials: '#0a1628', name: '#3b82f6', email: '#3b82f6',
    date: '#f59e0b', text: '#6b7280', checkbox: '#10b981', radio: '#8b5cf6', choice: '#8b5cf6',
  }
  const color = fieldTypeColors[field.type] || '#0a1628'
  const interactive = field.mine && !field.filled
  const showInput = interactive && ['text', 'name', 'email', 'date'].includes(field.type)

  return (
    <div
      className={`field-overlay ${isCurrent ? 'current' : ''} ${filled ? 'filled' : ''} ${field.mine ? '' : 'locked'}`}
      style={style}
      onClick={interactive ? onClick : undefined}
      title={field.mine ? (field.label || field.type) : `Assigned to another signer`}
    >
      <div className="field-label" style={{ background: color }}>
        {field.mine ? field.type : '🔒 ' + field.type}{field.required && <span className="required">*</span>}
      </div>
      {showInput ? (
        <input
          className="field-inline-input"
          value={typeof value === 'string' ? value : ''}
          placeholder={field.label || `Enter ${field.type}`}
          onChange={(e) => onTextChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
      ) : null}
      {filled && field.type !== 'checkbox' && !showInput && (
        <div className="field-filled-indicator">✓</div>
      )}
      {field.type === 'checkbox' && (value === true) && (
        <div className="checkbox-check">✓</div>
      )}
      {typeof value === 'string' && value.startsWith('data:image/') && (
        <div className="field-signature-preview">
          <img src={value} alt="Signature" />
        </div>
      )}
    </div>
  )
}
