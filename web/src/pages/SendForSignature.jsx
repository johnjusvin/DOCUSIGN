import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { PDFFieldBuilder } from '../components/PDFFieldBuilder'
import './SendForSignature.css'

export function SendForSignature() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const prefillDocId = searchParams.get('docId')
  const templateId = searchParams.get('templateId')
  
  const [step, setStep] = useState(1) // 1: select doc, 2: place fields, 3: add signers, 4: review
  const [document, setDocument] = useState(null)
  const [documents, setDocuments] = useState([])
  const [signers, setSigners] = useState([{ name: '', email: '', order: 1 }])
  const [signingOrder, setSigningOrder] = useState('sequential')
  const [message, setMessage] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [fields, setFields] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pdfPages, setPdfPages] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [templates, setTemplates] = useState([])

  const fileInputRef = useRef(null)

  useEffect(() => {
    loadDocuments()
    loadTemplates()
  }, [])

  useEffect(() => {
    if (prefillDocId) {
      const doc = documents.find(d => d.id === prefillDocId)
      if (doc) {
        selectDocument(doc)
      }
    }
  }, [prefillDocId, documents])

  useEffect(() => {
    if (templateId) {
      instantiateTemplate(templateId)
    }
  }, [templateId])

  const instantiateTemplate = async (id) => {
    setLoading(true)
    setError('')
    try {
      const res = await api.instantiateTemplate(id)
      if (!res.ok) throw new Error(res.error || 'Could not load template')
      setDocument(res.document)
      setPdfPages(res.document.page_sizes ? JSON.parse(res.document.page_sizes) : [])
      const tplFields = Array.isArray(res.fields) ? res.fields : []
      const withIds = tplFields.map((f) => ({
        ...f,
        id: `field_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        required: !!f.required,
      }))
      setFields(withIds)
      const need = Math.max(1, ...withIds.map((f) => (Number(f.signer_index) || 0) + 1))
      setSigners(Array.from({ length: Math.min(need, 10) }, (_, i) => ({ name: '', email: '', order: i + 1 })))
      setSelectedTemplate({ id })
      setStep(2)
    } catch (e) {
      setError(e.message || 'Could not load template')
    } finally {
      setLoading(false)
    }
  }

  const loadDocuments = async () => {
    try {
      const res = await api.listDocuments({ status: 'Draft' })
      if (res.ok && res.documents) {
        setDocuments(res.documents)
      }
    } catch (e) {
      console.error('Failed to load documents', e)
    }
  }

  const loadTemplates = async () => {
    try {
      const res = await api.listTemplates()
      if (res.ok && res.templates) {
        setTemplates(res.templates)
      }
    } catch (e) {
      console.error('Failed to load templates', e)
    }
  }

  const selectDocument = async (doc) => {
    setDocument(doc)
    try {
      const res = await api.getDocument(doc.id)
      if (res.ok && res.document) {
        setPdfPages(res.document.page_sizes ? JSON.parse(res.document.page_sizes) : [])
      }
    } catch (e) {
      console.error('Failed to load document', e)
    }
    setStep(2)
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.type !== 'application/pdf') {
      alert('Please select a PDF file')
      return
    }
    
    setLoading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      let res
      try {
        res = await api.uploadDocument(formData)
      } catch (e) {
        throw new Error(`Network error reaching the server (${Math.round(file.size / 1024)} KB file). Is the app still running at ${window.location.origin}? Retry, or try a smaller PDF.`)
      }
      if (res.ok && res.document) {
        setDocument(res.document)
        setPdfPages(res.document.page_sizes ? JSON.parse(res.document.page_sizes) : [])
        setStep(2)
      } else {
        throw new Error(res.error || 'Upload failed')
      }
    } catch (e) {
      setError(e.message || 'Failed to upload document')
    } finally {
      setLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const addSigner = () => {
    setSigners([...signers, { name: '', email: '', order: signers.length + 1 }])
  }

  const removeSigner = (index) => {
    if (signers.length <= 1) return
    setSigners(signers.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 })))
  }

  const updateSigner = (index, field, value) => {
    setSigners(signers.map((s, i) => i === index ? { ...s, [field]: value } : s))
  }

  const handleFieldsChange = (newFields) => {
    setFields(newFields)
  }

  const goBack = () => setStep(s => Math.max(1, s - 1))
  const goNext = () => setStep(s => Math.min(4, s + 1))

  const validateStep = () => {
    if (step === 1 && !document) {
      setError('Please select or upload a document')
      return false
    }
    if (step === 2 && fields.length === 0) {
      setError('Please place at least one field on the document')
      return false
    }
    if (step === 3 && !signers.every(s => s.name && s.email)) {
      setError('All signers must have a name and email')
      return false
    }
    setError('')
    return true
  }

  const handleSubmit = async () => {
    if (!validateStep()) return
    
    setLoading(true)
    try {
      const requestData = {
        docId: document.id,
        signers: signers.map((s) => ({ name: s.name, email: s.email })),
        fields: fields.map((f) => ({
          page: f.page, x: f.x, y: f.y, width: f.width, height: f.height,
          type: f.type, signer_index: f.signer_index, label: f.label,
          required: f.required, options: f.options, value: f.value,
        })),
        mode: signingOrder,
        message,
        emailSubject: subject,
        emailBody: body,
      }

      const res = await api.createRequest(requestData)
      if (res.ok && res.request) {
        const links = (res.request.signers || []).map((s) => `${s.name} — ${s.link}`).join('\n')
        alert(`Signing request sent!\n\nSigner links:\n${links}`)
        navigate('/documents')
      } else {
        throw new Error(res.error || 'Failed to create signing request')
      }
    } catch (e) {
      alert(e.message || 'Failed to create signing request')
    } finally {
      setLoading(false)
    }
  }

  const stepTitles = [
    'Select Document',
    'Place Fields',
    'Add Signers',
    'Review & Send'
  ]

  return (
    <div className="send-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Send for Signature</h1>
          <p className="page-subtitle">Create and send a document for electronic signature</p>
        </div>
      </header>

      <div className="page-content">
        <div className="stepper">
          {stepTitles.map((title, i) => (
            <div key={i} className={`step ${step > i ? 'completed' : ''} ${step === i + 1 ? 'active' : ''}`}>
              <div className="step-number">{i + 1}</div>
              <div className="step-label">{title}</div>
            </div>
          ))}
        </div>

        {error && <div className="error-banner">{error}</div>}

        {step === 1 && (
          <div className="step-content">
            <div className="card">
              <h3>Select Existing Document</h3>
              {documents.length === 0 ? (
                <p className="empty-hint">No draft documents available. Upload a new PDF below.</p>
              ) : (
                <div className="document-grid">
                  {documents.map(doc => (
                    <button
                      key={doc.id}
                      className={`doc-card ${document?.id === doc.id ? 'selected' : ''}`}
                      onClick={() => selectDocument(doc)}
                    >
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                      </svg>
                      <p>{doc.name}</p>
                      <span className="doc-meta">{doc.page_count} pages · {doc.size ? formatBytes(doc.size) : 'Unknown size'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <h3>Or Upload New PDF</h3>
              <div className="upload-zone" onClick={() => fileInputRef.current?.click()}>
                <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleFileUpload} hidden />
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <p>Drag & drop a PDF file or click to browse</p>
                <span className="upload-hint">Max 25MB · PDF only</span>
              </div>
            </div>

            {templates.length > 0 && (
              <div className="card">
                <h3>Use a Template</h3>
                <div className="template-select">
                  {templates.filter((t) => t.has_source).map(t => (
                    <button
                      key={t.id}
                      className={`template-card ${selectedTemplate?.id === t.id ? 'selected' : ''}`}
                      onClick={() => instantiateTemplate(t.id)}
                      disabled={loading}
                    >
                      <p>{t.name}</p>
                      <span>{t.description || 'No description'}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="step-actions">
              <button className="btn-primary" onClick={goNext} disabled={!document || loading}>
                {loading ? 'Processing...' : 'Continue'}
              </button>
            </div>
          </div>
        )}

        {step === 2 && document && (
          <div className="step-content">
            <PDFFieldBuilder
              document={document}
              pdfUrl={`/api/docs/${document.id}/file`}
              pdfPages={pdfPages}
              fields={fields}
              signers={signers}
              onFieldsChange={handleFieldsChange}
            />
            <div className="step-actions">
              <button className="btn-secondary" onClick={goBack}>Back</button>
              <button className="btn-primary" onClick={() => { validateStep() && goNext() }} disabled={fields.length === 0}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="step-content">
            <div className="card">
              <div className="card-header">
                <h3>Signers</h3>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={signingOrder === 'sequential'}
                    onChange={(e) => setSigningOrder(e.target.checked ? 'sequential' : 'parallel')}
                  />
                  <span className="toggle-slider"></span>
                  <span>Sequential signing (signer 1 → 2 → 3)</span>
                </label>
              </div>
              
              <div className="signers-list">
                {signers.map((signer, index) => (
                  <div key={index} className="signer-row">
                    <span className="signer-order">{signer.order}</span>
                    <input
                      type="text"
                      placeholder="Full name"
                      value={signer.name}
                      onChange={(e) => updateSigner(index, 'name', e.target.value)}
                    />
                    <input
                      type="email"
                      placeholder="Email address"
                      value={signer.email}
                      onChange={(e) => updateSigner(index, 'email', e.target.value)}
                    />
                    {signers.length > 1 && (
                      <button type="button" className="btn-icon danger" onClick={() => removeSigner(index)} title="Remove signer">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              
              {signers.length < 10 && (
                <button type="button" className="btn-add-signer" onClick={addSigner}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  Add Another Signer
                </button>
              )}
            </div>

            <div className="card">
              <h3>Email Message</h3>
              <div className="form-group">
                <label>Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Please sign this document"
                  defaultValue="Signature Request"
                />
              </div>
              <div className="form-group">
                <label>Message</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Add a personal message..."
                  rows={4}
                />
              </div>
            </div>

            <div className="step-actions">
              <button className="btn-secondary" onClick={goBack}>Back</button>
              <button className="btn-primary" onClick={() => { validateStep() && goNext() }}>Continue</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="step-content review-step">
            <div className="card">
              <h3>Document</h3>
              <p className="review-doc">{document?.name}</p>
            </div>
            
            <div className="card">
              <h3>Fields</h3>
              <p>{fields.length} field(s) placed across {pdfPages.length} page(s)</p>
              <div className="field-summary">
                {fields.reduce((acc, f) => {
                  acc[f.type] = (acc[f.type] || 0) + 1
                  return acc
                }, {}) && Object.entries(fields.reduce((acc, f) => {
                  acc[f.type] = (acc[f.type] || 0) + 1
                  return acc
                }, {})).map(([type, count]) => (
                  <span key={type} className="field-tag">{type}: {count}</span>
                ))}
              </div>
            </div>
            
            <div className="card">
              <h3>Signers ({signers.length})</h3>
              {signers.map((s, i) => (
                <div key={i} className="review-signer">
                  <span className="signer-order">{s.order}.</span>
                  <span>{s.name} ({s.email})</span>
                </div>
              ))}
              <p className="review-order">Mode: {signingOrder === 'sequential' ? 'Sequential' : 'Parallel'}</p>
            </div>
            
            <div className="card">
              <h3>Email</h3>
              <p><strong>Subject:</strong> {subject || '(default)'}</p>
              <p><strong>Message:</strong> {body || '(none)'}</p>
            </div>

            <div className="step-actions">
              <button className="btn-secondary" onClick={goBack}>Back</button>
              <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
                {loading ? 'Sending...' : 'Send for Signature'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}