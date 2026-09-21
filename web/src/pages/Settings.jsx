import React, { useState, useEffect } from 'react'
import { api } from '../api/client'
import './Settings.css'

export function Settings() {
  const [settings, setSettings] = useState({})
  const [storageInfo, setStorageInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [activeTab, setActiveTab] = useState('general')
  const [driveStatus, setDriveStatus] = useState(null)
  const [driveBusy, setDriveBusy] = useState(false)

  useEffect(() => {
    loadSettings()
    loadStorageInfo()
    loadDriveStatus()
    if (window.location.search.includes('drive=connected')) {
      setMessage({ type: 'success', text: 'Google Drive connected' })
    }
  }, [])

  const loadDriveStatus = async () => {
    try {
      const res = await fetch('/api/storage/drive/status', { credentials: 'include' }).then((r) => r.json())
      if (res.ok) setDriveStatus(res.drive)
    } catch (e) {
      console.error('Failed to load drive status', e)
    }
  }

  const connectDrive = async () => {
    setDriveBusy(true)
    try {
      const res = await fetch('/api/storage/drive/oauth/start', { credentials: 'include' }).then((r) => r.json())
      if (res.ok && res.url) {
        window.location.href = res.url
      } else {
        setMessage({ type: 'error', text: res.error || 'Drive is not configured (see setup notes below)' })
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Could not start Google authorization' })
    } finally {
      setDriveBusy(false)
    }
  }

  const disconnectDrive = async () => {
    if (!window.confirm('Disconnect Google Drive? New files will use local disk storage.')) return
    setDriveBusy(true)
    try {
      await fetch('/api/storage/drive/disconnect', { method: 'POST', credentials: 'include' })
      loadDriveStatus()
      loadStorageInfo()
      setMessage({ type: 'success', text: 'Google Drive disconnected' })
    } catch (e) {
      setMessage({ type: 'error', text: 'Could not disconnect Drive' })
    } finally {
      setDriveBusy(false)
    }
  }

  const loadSettings = async () => {
    try {
      const res = await api.getSettings()
      if (res.ok && res.settings) {
        setSettings(res.settings)
      }
    } catch (e) {
      console.error('Failed to load settings', e)
    } finally {
      setLoading(false)
    }
  }

  const loadStorageInfo = async () => {
    try {
      const res = await api.describeStorage()
      if (res.ok && res.storage) {
        setStorageInfo(res.storage)
      }
    } catch (e) {
      console.error('Failed to load storage info', e)
    }
  }

  const handleSave = async (key, value) => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await api.updateSetting(key, value)
      if (res.ok) {
        setSettings(prev => ({ ...prev, [key]: value }))
        setMessage({ type: 'success', text: 'Settings saved' })
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Failed to save settings' })
    } finally {
      setSaving(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const handleInputChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  const settingFields = [
    { key: 'app_url', label: 'Application URL', type: 'url', description: 'Public URL used for signing links' },
    { key: 'maxUploadBytes', label: 'Max Upload Size (bytes)', type: 'number', description: 'Maximum PDF file size for uploads' },
    { key: 'maxSigImageBytes', label: 'Max Signature Image Size (bytes)', type: 'number', description: 'Maximum size for uploaded signature images' },
    { key: 'signingLinkExpiryHours', label: 'Signing Link Expiry (hours)', type: 'number', description: '0 = never expires' },
    { key: 'storage', label: 'Storage Backend', type: 'select', options: ['drive', 'local'], description: 'Document storage backend' },
  ]

  return (
    <div className="settings-page">
      <header className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Configure REDITUS SIGN application settings</p>
      </header>

      <div className="page-content">
        {message && (
          <div className={`alert alert-${message.type}`}>
            {message.text}
          </div>
        )}

        <div className="settings-tabs">
          <button className={`tab ${activeTab === 'general' ? 'active' : ''}`} onClick={() => setActiveTab('general')}>
            General
          </button>
          <button className={`tab ${activeTab === 'storage' ? 'active' : ''}`} onClick={() => setActiveTab('storage')}>
            Storage
          </button>
          <button className={`tab ${activeTab === 'security' ? 'active' : ''}`} onClick={() => setActiveTab('security')}>
            Security
          </button>
        </div>

        {activeTab === 'general' && (
          <div className="settings-section">
            <h2>General Settings</h2>
            {loading ? (
              <div className="loading-state">Loading...</div>
            ) : (
              <div className="settings-form">
                {settingFields.map(field => (
                  <div key={field.key} className="setting-row">
                    <div className="setting-label">
                      <span>{field.label}</span>
                      <span className="setting-description">{field.description}</span>
                    </div>
                    <div className="setting-input">
                      {field.type === 'select' ? (
                        <select
                          value={settings[field.key] || ''}
                          onChange={(e) => handleSave(field.key, e.target.value)}
                          disabled={saving}
                        >
                          {field.options.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={field.type}
                          value={settings[field.key] || ''}
                          onChange={(e) => handleInputChange(field.key, e.target.value)}
                          onBlur={(e) => handleSave(field.key, e.target.value)}
                          disabled={saving}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'storage' && (
          <div className="settings-section">
            <h2>Storage Configuration</h2>
            {storageInfo ? (
              <div className="storage-info">
                <div className="storage-badge">{storageInfo.type}</div>
                <p className="storage-label">{storageInfo.label}</p>
                {storageInfo.rootId && <p className="storage-detail">Root Folder: {storageInfo.rootId}</p>}
                {storageInfo.folders && (
                  <div className="storage-folders">
                    <h4>Folder Structure</h4>
                    <ul>
                      {Object.entries(storageInfo.folders).map(([cat, id]) => (
                        <li key={cat}><strong>{cat}:</strong> {id}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {storageInfo.type === 'drive' && storageInfo.scope && (
                  <p className="storage-detail">OAuth Scope: {storageInfo.scope}</p>
                )}
              </div>
            ) : (
              <div className="loading-state">Loading storage info...</div>
            )}
            <div className="settings-note">
              <h4>Google Drive</h4>
              {driveStatus ? (
                <div className="drive-status">
                  <p>
                    Status: <strong>{driveStatus.configured ? (driveStatus.authorized ? 'Connected' : 'Configured — not authorized') : 'Not configured'}</strong>
                    {driveStatus.active && ' (active backend)'}
                  </p>
                  {driveStatus.authorized ? (
                    <button className="btn-secondary" onClick={disconnectDrive} disabled={driveBusy}>
                      {driveBusy ? 'Working...' : 'Disconnect Drive'}
                    </button>
                  ) : (
                    <button className="btn-primary" onClick={connectDrive} disabled={driveBusy}>
                      {driveBusy ? 'Working...' : 'Connect with Google'}
                    </button>
                  )}
                </div>
              ) : (
                <p>Loading Drive status...</p>
              )}
              <p>To use Google Drive storage, configure these environment variables:</p>
              <ul>
                <li><code>GOOGLE_CLIENT_ID</code> - OAuth 2.0 Client ID</li>
                <li><code>GOOGLE_CLIENT_SECRET</code> - OAuth 2.0 Client Secret</li>
                <li><code>GOOGLE_REDIRECT_URI</code> - must be <code>http://localhost:4000/api/storage/drive/oauth/callback</code> (match host/port to your app URL)</li>
                <li><code>GOOGLE_DRIVE_ROOT_FOLDER_ID</code> - Optional: Root folder ID in Drive</li>
              </ul>
              <p>After setting these, restart the application and click “Connect with Google”.</p>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="settings-section">
            <h2>Security Settings</h2>
            <div className="security-options">
              <div className="security-row">
                <div className="security-label">
                  <span>Session Timeout</span>
                  <span>7 days (fixed)</span>
                </div>
              </div>
              <div className="security-row">
                <div className="security-label">
                  <span>Rate Limiting</span>
                  <span>60 requests/minute per endpoint</span>
                </div>
              </div>
              <div className="security-row">
                <div className="security-label">
                  <span>Cookie Security</span>
                  <span>HttpOnly, SameSite=Strict, Secure (HTTPS)</span>
                </div>
              </div>
              <div className="security-row">
                <div className="security-label">
                  <span>Audit Trail</span>
                  <span>All actions logged (append-only)</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}