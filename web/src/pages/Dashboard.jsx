import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import './Dashboard.css'

export function Dashboard() {
  const [stats, setStats] = useState({
    total: 0,
    draft: 0,
    sent: 0,
    inProgress: 0,
    completed: 0,
    declined: 0,
    expired: 0
  })
  const [recentActivity, setRecentActivity] = useState([])
  const [pendingSigners, setPendingSigners] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      const [docsRes, auditRes] = await Promise.all([
        api.listDocuments(),
        api.getAuditEvents({ limit: 10 })
      ])
      
      if (docsRes.ok && docsRes.documents) {
        const docs = docsRes.documents
        setStats({
          total: docs.length,
          draft: docs.filter(d => d.status === 'Draft').length,
          sent: docs.filter(d => d.status === 'Sent').length,
          inProgress: docs.filter(d => d.status === 'In Progress').length,
          completed: docs.filter(d => d.status === 'Completed').length,
          declined: docs.filter(d => d.status === 'Declined').length,
          expired: docs.filter(d => d.status === 'Expired').length
        })
      }
      
      if (auditRes.ok && auditRes.events) {
        setRecentActivity(auditRes.events)
      }
    } catch (e) {
      console.error('Failed to load dashboard', e)
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    { key: 'total', label: 'Total Documents', color: '#0a1628', icon: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
    { key: 'draft', label: 'Draft', color: '#6b7280', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { key: 'sent', label: 'Sent', color: '#3b82f6', icon: 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8' },
    { key: 'inProgress', label: 'In Progress', color: '#f59e0b', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { key: 'completed', label: 'Completed', color: '#10b981', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { key: 'declined', label: 'Declined', color: '#ef4444', icon: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { key: 'expired', label: 'Expired', color: '#9ca3af', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  ]

  return (
    <div className="dashboard">
      <header className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Overview of your document signing activity</p>
      </header>
      <div className="page-content">
        <div className="stats-grid">
          {statCards.map(card => (
            <Link to="/documents" key={card.key} className="stat-card">
              <div className="stat-icon" style={{ background: `${card.color}15`, color: card.color }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={card.icon} />
                </svg>
              </div>
              <div className="stat-info">
                <p className="stat-value">{stats[card.key] || 0}</p>
                <p className="stat-label">{card.label}</p>
              </div>
            </Link>
          ))}
        </div>

        <div className="dashboard-sections">
          <section className="section">
            <div className="section-header">
              <h2 className="section-title">Recent Activity</h2>
              <Link to="/documents" className="section-link">View all</Link>
            </div>
            {loading ? (
              <div className="loading-placeholder">Loading...</div>
            ) : recentActivity.length === 0 ? (
              <div className="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                <p>No recent activity</p>
              </div>
            ) : (
              <div className="activity-list">
                {recentActivity.map(event => (
                  <div key={event.id} className="activity-item">
                    <div className="activity-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                      </svg>
                    </div>
                    <div className="activity-content">
                      <p className="activity-text">{event.event} {event.doc_id ? `for document ${event.doc_id.slice(0,8)}` : ''}</p>
                      <p className="activity-time">{new Date(event.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <div className="section-header">
              <h2 className="section-title">Quick Actions</h2>
            </div>
            <div className="quick-actions">
              <Link to="/send" className="action-card primary">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                </svg>
                <span>Send for Signature</span>
              </Link>
              <Link to="/documents" className="action-card">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                </svg>
                <span>Upload Document</span>
              </Link>
              <Link to="/templates" className="action-card">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                <span>Create Template</span>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}