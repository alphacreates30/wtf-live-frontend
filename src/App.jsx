import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import Listings from './pages/Listings'
import AuctionRoom from './pages/AuctionRoom'
import HostDashboard from './pages/HostDashboard'

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('wtf_token')
  return token ? children : <Navigate to="/login" replace />
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
          path="/host"
          element={
            <ProtectedRoute>
              <HostDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
