import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import Listings from './pages/Listings'
import AuctionRoom from './pages/AuctionRoom'
import HostDashboard from './pages/HostDashboard'
import ProfileSetup from './pages/ProfileSetup'
import AdminBuyers from './pages/AdminBuyers'

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('wtf_token')
  return token ? children : <Navigate to="/login" replace />
}

function AdminRoute({ children }) {
  const token = localStorage.getItem('wtf_token')
  const username = localStorage.getItem('wtf_username')
  if (!token) return <Navigate to="/login" replace />
  if (username !== 'whatthefind') return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Listings />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auction/:id" element={<AuctionRoom />} />
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
            <ProtectedRoute>
              <HostDashboard />
            </ProtectedRoute>
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
