import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import './Documents.css'

const TITLES = {
  Sent: ['Pending', 'Documents waiting for signatures'],
  Completed: ['Completed', 'Fully signed documents'],
  Declined: ['Declined', 'Documents declined by a signer'],
  Expired: ['Expired', 'Documents past their signing link expiry'],
};

export function Documents() {
  const [searchParams] = useSearchParams()
  const presetStatus = searchParams.get('status') || ''
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: presetStatus, search: '' })
  const [deletingId, setDeletingId] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    setFilters((f) => ({ ...f, status: presetStatus }))
  }, [presetStatus])

  useEffect(() => {
    loadDocuments()
  }, [filters])

  const title = TITLES[filters.status]?.[0] || 'Documents'
  const subtitle = TITLES[filters.status]?.[1] || 'Manage your documents and signing requests'

  const loadDocuments = async () => {
    setLoading(true)
    try {
      const res = await api.listDocuments(filters)
      if (res.ok && res.documents) {
        setDocuments(res.documents)
      }
    } catch (e) {
      console.error('Failed to load documents', e)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return
    setDeletingId(id)
    try {
      await api.deleteDocument(id)
      setDocuments(docs => docs.filter(d => d.id !== id))
    } catch (e) {
      alert('Failed to delete document')
    } finally {
      setDeletingId(null)
    }
  }

  const statusColors = {
    Draft: '#6b7280',
    Sent: '#3b82f6',
    'In Progress': '#f59e0b',
    Completed: '#10b981',
    Declined: '#ef4444',
    Expired: '#9ca3af',
    Signed: '#10b981',
    Archived: '#9ca3af'
  }

  return (
    <div className="documents-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
        <Link to="/send" className="btn-primary">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Send for Signature
        </Link>
      </header>

      <div className="page-content">
        <div className="filters-bar">
          <div className="search-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder="Search documents..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="search-input"
            />
          </div>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="filter-select"
          >
            <option value="">All Statuses</option>
            <option value="Draft">Draft</option>
            <option value="Sent">Sent</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="Declined">Declined</option>
            <option value="Expired">Expired</option>
            <option value="Archived">Archived</option>
          </select>
        </div>

        {loading ? (
          <div className="loading-state">Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
            </svg>
            <h3>No documents found</h3>
            <p>Upload your first document to get started</p>
            <Link to="/send" className="btn-primary" style={{ marginTop: '16px', display: 'inline-flex' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Send for Signature
            </Link>
          </div>
        ) : (
          <div className="documents-table-container">
            <table className="documents-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Pages</th>
                  <th>Size</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map(doc => (
                  <tr key={doc.id}>
                    <td>
                      <div className="doc-name">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                          <line x1="16" y1="13" x2="8" y2="13"></line>
                          <line x1="16" y1="17" x2="8" y2="17"></line>
                          <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                        <span>{doc.name}</span>
                      </div>
                    </td>
                    <td>
                      <span 
                        className="status-badge" 
                        style={{ background: `${statusColors[doc.status] || '#6b7280'}15`, color: statusColors[doc.status] || '#6b7280' }}
                      >
                        {doc.status}
                      </span>
                    </td>
                    <td>{doc.page_count || 0}</td>
                    <td>{doc.size ? formatBytes(doc.size) : '-'}</td>
                    <td>{doc.created_at ? new Date(doc.created_at).toLocaleDateString() : '-'}</td>
                    <td>
                      <div className="actions">
                        <Link to={`/send?docId=${doc.id}`} className="btn-icon" title="Send for signature">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                          </svg>
                        </Link>
                        <Link to={`/documents/${doc.id}`} className="btn-icon" title="View details">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                        </Link>
                        <button 
                          className="btn-icon danger" 
                          onClick={() => handleDelete(doc.id, doc.name)}
                          disabled={deletingId === doc.id}
                          title="Delete"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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