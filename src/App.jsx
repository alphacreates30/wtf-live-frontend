import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import EmailGate from './components/EmailGate'
import Listings from './pages/Listings'
import Home from './pages/Home'
import SearchResults from './pages/SearchResults'
import Footer from './components/Footer'
import { WatchProvider } from './watch/WatchContext'
import ProfileGate from './components/ProfileGate'
import { PreviewProvider } from './preview/PreviewContext'

// Split out of the main bundle: the homepage shouldn't download the auction
// rooms (LiveKit), card setup (Stripe.js loads on import) or the admin pages.
const AuctionRoomGate = lazy(() => import('./pages/AuctionRoomGate'))
const LotPage = lazy(() => import('./pages/LotPage'))
const HostDashboard = lazy(() => import('./pages/HostDashboard'))
const AuctionWorkspace = lazy(() => import('./pages/AuctionWorkspace'))
const HostSettings = lazy(() => import('./pages/HostSettings'))
const HostRewards = lazy(() => import('./pages/HostRewards'))
const ProfileSetup = lazy(() => import('./pages/ProfileSetup'))
const AdminBuyers = lazy(() => import('./pages/AdminBuyers'))
const AdminOrders = lazy(() => import('./pages/AdminOrders'))
const MyBids = lazy(() => import('./pages/MyBids'))
const MyOrders = lazy(() => import('./pages/MyOrders'))
const Terms = lazy(() => import('./pages/Terms'))
const Privacy = lazy(() => import('./pages/Privacy'))
const HowItWorks = lazy(() => import('./pages/HowItWorks'))
const AccountDeleted = lazy(() => import('./pages/AccountDeleted'))
const Watching = lazy(() => import('./pages/Watching'))
const NotificationPrefs = lazy(() => import('./pages/NotificationPrefs'))
const Unsubscribe = lazy(() => import('./pages/Unsubscribe'))
const Services = lazy(() => import('./pages/Services'))
const Contact = lazy(() => import('./pages/Contact'))
const AdminRequests = lazy(() => import('./pages/AdminRequests'))
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


export default function App() {
  return (
    <BrowserRouter>
      <WatchProvider>
      <Navbar />
      <PreviewProvider>
      <EmailGate>
      <Suspense fallback={<div className="page" style={{ minHeight: '100vh' }}><p className="buyer-note">Loading…</p></div>}>
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
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        {/* Services (F5): the overview, one page per service, and Contact. Public, no login. */}
        <Route path="/services" element={<Services />} />
        <Route path="/services/:slug" element={<Services />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/account-deleted" element={<AccountDeleted />} />
        {/* No ProfileGate here: AuctionRoomGate applies it to timed auctions; a live show lets an account that isn't
            approved yet watch (the server says watch_only; phase 5 §0). */}
        <Route path="/auction/:id" element={<AuctionRoomGate />} />
        {/* A lot's own page: /a/<auction slug>/lot/<lot number>. /auction/:id?lot=<id> redirects here. */}
        <Route path="/a/:slug/lot/:n" element={
          <ProfileGate>
            <LotPage />
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
          path="/host/rewards"
          element={
            <AdminRoute>
              <HostRewards />
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
        <Route
          path="/host/requests"
          element={
            <AdminRoute>
              <AdminRequests />
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
      </PreviewProvider>
      </WatchProvider>
    </BrowserRouter>
  )
}
