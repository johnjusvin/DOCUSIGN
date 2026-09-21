import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Dashboard } from './pages/Dashboard'
import { Documents } from './pages/Documents'
import { DocumentDetail } from './pages/DocumentDetail'
import { AuditTrail } from './pages/AuditTrail'
import { SendForSignature } from './pages/SendForSignature'
import { Templates } from './pages/Templates'
import { SigningPage } from './pages/SigningPage'
import { Settings } from './pages/Settings'
import { Login } from './pages/Login'
import { Layout } from './components/Layout'
import { AuthProvider, useAuth } from './context/AuthContext'

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth()
  const location = useLocation()
  
  if (loading) return <div className="loading">Loading...</div>
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth()
  
  if (loading) return <div className="loading">Loading...</div>
  if (user) return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="documents" element={<Documents />} />
        <Route path="documents/:id" element={<DocumentDetail />} />
        <Route path="audit" element={<AuditTrail />} />
        <Route path="send" element={<SendForSignature />} />
        <Route path="templates" element={<Templates />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="/sign/:token" element={<SigningPage />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

export default App