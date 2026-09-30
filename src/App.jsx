import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect, lazy, Suspense } from 'react'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import EmailGate from './components/EmailGate'
import Listings from './pages/Listings'
import Home from './pages/Home'
import SearchResults from './pages/SearchResults'
import { api } from './api'
import Footer from './components/Footer'
import { WatchProvider } from './watch/WatchContext'

// Split out of the main bundle: the homepage shouldn't download the auction
// rooms (LiveKit), card setup (Stripe.js loads on import) or the admin pages.
const AuctionRoomGate = lazy(() => import('./pages/AuctionRoomGate'))
const HostDashboard = lazy(() => import('./pages/HostDashboard'))
const AuctionWorkspace = lazy(() => import('./pages/AuctionWorkspace'))
const HostSettings = lazy(() => import('./pages/HostSettings'))
const ProfileSetup = lazy(() => import('./pages/ProfileSetup'))
const AdminBuyers = lazy(() => import('./pages/AdminBuyers'))
const AdminOrders = lazy(() => import('./pages/AdminOrders'))
const MyBids = lazy(() => import('./pages/MyBids'))
const MyOrders = lazy(() => import('./pages/MyOrders'))
const Terms = lazy(() => import('./pages/Terms'))
const AccountDeleted = lazy(() => import('./pages/AccountDeleted'))
const Watching = lazy(() => import('./pages/Watching'))
const NotificationPrefs = lazy(() => import('./pages/NotificationPrefs'))
const Unsubscribe = lazy(() => import('./pages/Unsubscribe'))
import './pages/Buyer.css'

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
    return <div className="page"><p className="buyer-note">Checking profile...</p></div>
  }

  if (profileStatus === 'no_profile') {
    return <Navigate to="/profile-setup" replace />
  }

  if (profileStatus === 'pending') {
    return (
      <div className="page status-screen">
        <span className="status-tag status-tag-pending">Pending</span>
        <h2>Pending Approval</h2>
        <p>
          Your profile is under review. You'll be able to access auctions once approved by the WhatTheFind team.
        </p>
      </div>
    )
  }

  if (profileStatus === 'rejected') {
    return (
      <div className="page status-screen">
        <span className="status-tag status-tag-rejected">Not approved</span>
        <h2>Application Not Approved</h2>
        <p>
          Your buyer application was not approved. Please contact WhatTheFind for more information.
        </p>
      </div>
    )
  }

  if (profileStatus === 'blocked') {
    return (
      <div className="page status-screen">
        <span className="status-tag status-tag-blocked">Suspended</span>
        <h2>Account Suspended</h2>
        <p>Your account has been suspended. Please contact WhatTheFind.</p>
      </div>
    )
  }

  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <WatchProvider>
      <Navbar />
      <EmailGate>
      <Suspense fallback={<div className="page"><p className="buyer-note">Loading…</p></div>}>
      <Routes>
        <Route path="/" element={
          <ProfileGate>
            <Home />
          </ProfileGate>
        } />
        {/* The auctions list (the old homepage): the header's "Auctions" link. */}
        <Route path="/auctions" element={
          <ProfileGate>
            <Listings />
          </ProfileGate>
        } />
        <Route path="/search" element={
          <ProfileGate>
            <SearchResults />
          </ProfileGate>
        } />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/account-deleted" element={<AccountDeleted />} />
        <Route path="/auction/:id" element={
          <ProfileGate>
            <AuctionRoomGate />
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
          path="/host/auction/:id/*"
          element={
            <AdminRoute>
              <AuctionWorkspace />
            </AdminRoute>
          }
        />
        <Route
          path="/host/settings"
          element={
            <AdminRoute>
              <HostSettings />
            </AdminRoute>
          }
        />
        <Route
          path="/host/buyers"
          element={
            <AdminRoute>
              <AdminBuyers />
            </AdminRoute>
          }
        />
        <Route
          path="/host/orders"
          element={
            <AdminRoute>
              <AdminOrders />
            </AdminRoute>
          }
        />
        <Route path="/admin/buyers" element={<Navigate to="/host/buyers" replace />} />
        <Route path="/admin/orders" element={<Navigate to="/host/orders" replace />} />
                <Route path="/my-bids" element={<ProtectedRoute><MyBids /></ProtectedRoute>} />
                <Route path="/my-orders" element={<ProtectedRoute><MyOrders /></ProtectedRoute>} />
                <Route path="/watching" element={<ProtectedRoute><Watching /></ProtectedRoute>} />
                <Route path="/notifications" element={<ProtectedRoute><NotificationPrefs /></ProtectedRoute>} />
                {/* No login: the signed token in the email link says whose reminders these are. */}
                <Route path="/unsubscribe" element={<Unsubscribe />} />
<Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      </EmailGate>
      <Footer />
      </WatchProvider>
    </BrowserRouter>
  )
}
