import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Login.css'

export function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/dashboard'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await login(username, password)
    setLoading(false)
    if (result.ok) {
      navigate(from, { replace: true })
    } else {
      setError(result.error || 'Invalid credentials')
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <svg width="48" height="48" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="login-logo">
            <rect width="32" height="32" rx="8" fill="#0a1628"/>
            <path d="M16 8L22 16L16 24L10 16L16 8Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <h1>REDITUS SIGN</h1>
          <p className="tagline">THE RETURN OF WHAT'S POSSIBLE</p>
          <p className="subtitle">Sign in to your dashboard</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="error-message">{error}</div>}
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              required
              autoComplete="username"
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="leave blank if none set"
              autoComplete="current-password"
              disabled={loading}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <div className="login-hint">
          Default: <code>admin</code> with a blank password — set <code>ADMIN_PASSWORD</code> in <code>.env</code> to change it.
        </div>
      </div>
    </div>
  )
}