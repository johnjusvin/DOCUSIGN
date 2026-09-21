import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import './Templates.css'

export function Templates() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newTemplate, setNewTemplate] = useState({ name: '', description: '' })
  const [uploadingId, setUploadingId] = useState(null)
  const [error, setError] = useState('')

  const handleAttachPdf = async (templateId, file) => {
    if (!file) return
    if (file.type !== 'application/pdf') { alert('Please select a PDF file'); return }
    setUploadingId(templateId)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.uploadTemplateSource(templateId, fd)
      if (!res.ok) throw new Error(res.error || 'Upload failed')
      loadTemplates()
    } catch (e) {
      setError(e.message || 'Failed to attach PDF')
    } finally {
      setUploadingId(null)
    }
  }

  const handleDelete = async (template) => {
    if (!window.confirm(`Delete template "${template.name}"?`)) return
    try {
      await api.deleteTemplate(template.id)
      loadTemplates()
    } catch (e) {
      alert('Failed to delete template')
    }
  }

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    setLoading(true)
    try {
      const res = await api.listTemplates()
      if (res.ok && res.templates) {
        setTemplates(res.templates)
      }
    } catch (e) {
      console.error('Failed to load templates', e)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!newTemplate.name.trim()) return
    
    try {
      const res = await api.createTemplate(newTemplate)
      if (res.ok && res.id) {
        setShowCreate(false)
        setNewTemplate({ name: '', description: '' })
        loadTemplates()
      }
    } catch (e) {
      alert('Failed to create template')
    }
  }

  return (
    <div className="templates-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Templates</h1>
          <p className="page-subtitle">Reusable document templates for common agreements</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Create Template
        </button>
      </header>

      <div className="page-content">
        {error && <div className="error-banner">{error}</div>}
        {showCreate && (
          <div className="create-modal-overlay" onClick={() => setShowCreate(false)}>
            <div className="create-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Create New Template</h3>
              <form onSubmit={handleCreate}>
                <div className="form-group">
                  <label>Template Name</label>
                  <input
                    type="text"
                    value={newTemplate.name}
                    onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                    placeholder="e.g., NDA, Service Agreement"
                    required
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={newTemplate.description}
                    onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                    placeholder="Brief description of this template"
                    rows={3}
                  />
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                  <button type="submit" className="btn-primary">Create Template</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {loading ? (
          <div className="loading-state">Loading templates...</div>
        ) : templates.length === 0 ? (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <h3>No templates yet</h3>
            <p>Create your first template to streamline document preparation</p>
            <button className="btn-primary" onClick={() => setShowCreate(true)} style={{ marginTop: '16px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Create Template
            </button>
          </div>
        ) : (
          <div className="templates-grid">
            {templates.map(template => (
              <div key={template.id} className="template-card">
                <div className="template-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                </div>
                <div className="template-info">
                  <h3>{template.name}</h3>
                  <p>{template.description || 'No description'}</p>
                  <span className="template-meta">
                    Created {template.created_at ? new Date(template.created_at).toLocaleDateString() : 'Recently'}
                    {' • '}{template.has_source ? `${template.page_count || 0} pages` : 'no PDF attached'}
                    {(template.field_count || 0) > 0 && ` • ${template.field_count} fields`}
                  </span>
                </div>
                <div className="template-actions">
                  <label className="btn-secondary" style={{ padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>
                    {uploadingId === template.id ? 'Uploading...' : (template.has_source ? 'Replace PDF' : 'Attach PDF')}
                    <input
                      type="file" accept="application/pdf" hidden
                      disabled={uploadingId === template.id}
                      onChange={(e) => { handleAttachPdf(template.id, e.target.files[0]); e.target.value = '' }}
                    />
                  </label>
                  {template.has_source ? (
                    <Link to={`/send?templateId=${template.id}`} className="btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }}>
                      Use Template
                    </Link>
                  ) : (
                    <span className="btn-disabled" title="Attach a PDF first">Use Template</span>
                  )}
                  <button className="btn-icon danger" onClick={() => handleDelete(template)} title="Delete template">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}