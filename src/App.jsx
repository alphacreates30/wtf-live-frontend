import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import Listings from './pages/Listings'
import AuctionRoom from './pages/AuctionRoom'
import HostDashboard from './pages/HostDashboard'
import ProfileSetup from './pages/ProfileSetup'
import AdminBuyers from './pages/AdminBuyers'
import AdminOrders from './pages/AdminOrders'
import { api } from './api'

const ADMIN_USERNAME = 'whatthefind'

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('wtf_token')
  return token ? children : <Navigate to="/login" replace />
}

function AdminRoute({ children }) {
  const token = localStorage.getItem('wtf_token')
  const username = localStorage.getItem('wtf_username')
  if (!token) return <Navigate to="/login" replace />
  if (username !== ADMIN_USERNAME) return <Navigate to="/" replace />
  return children
}

function ProfileGate({ children }) {
  const token = localStorage.getItem('wtf_token')
  const username = localStorage.getItem('wtf_username')
  const [profileStatus, setProfileStatus] = useState('loading')

  useEffect(() => {
    if (!token || username === ADMIN_USERNAME) {
      setProfileStatus('ok')
      return
    }
    api.getMyProfile()
      .then(profile => {
        setProfileStatus(profile?.status || 'no_profile')
      })
      .catch(() => setProfileStatus('no_profile'))
  }, [token, username])

  if (!token) return children

  if (profileStatus === 'loading') {
    return <div className="page"><p style={{ color: 'var(--text-muted)', padding: '2rem' }}>Checking profile...</p></div>
  }

  if (profileStatus === 'no_profile') {
    return <Navigate to="/profile-setup" replace />
  }

  if (profileStatus === 'pending') {
    return (
      <div className="page" style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center', paddingTop: '4rem' }}>
        <div style={{ fontSize: '3rem' }}>⏳</div>
        <h2>Pending Approval</h2>
        <p style={{ color: 'var(--text-muted)' }}>
          Your profile is under review. You'll be able to access auctions once approved by the WhatTheFind team.
        </p>
      </div>
    )
  }

  if (profileStatus === 'rejected') {
    return (
      <div className="page" style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center', paddingTop: '4rem' }}>
        <div style={{ fontSize: '3rem' }}>❌</div>
        <h2>Application Not Approved</h2>
        <p style={{ color: 'var(--text-muted)' }}>
          Your buyer application was not approved. Please contact WhatTheFind for more information.
        </p>
      </div>
    )
  }

  if (profileStatus === 'blocked') {
    return (
      <div className="page" style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center', paddingTop: '4rem' }}>
        <div style={{ fontSize: '3rem' }}>🚫</div>
        <h2>Account Suspended</h2>
        <p style={{ color: 'var(--text-muted)' }}>Your account has been suspended. Please contact WhatTheFind.</p>
      </div>
    )
  }

  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={
          <ProfileGate>
            <Listings />
          </ProfileGate>
        } />
        <Route path="/login" element={<Login />} />
        <Route path="/auction/:id" element={
          <ProfileGate>
            <AuctionRoom />
          </ProfileGate>
        } />
        <Route
          path="/profile-setup"
          element={
            <ProtectedRoute>
              <ProfileSetup />
            </ProtectedRoute>
          }
        />
        <Route
          path="/host"
          element={
            <AdminRoute>
              <HostDashboard />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/buyers"
          element={
            <AdminRoute>
              <AdminBuyers />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/orders"
          element={
            <AdminRoute>
              <AdminOrders />
            </AdminRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
