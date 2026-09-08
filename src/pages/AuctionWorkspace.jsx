import { useState, useEffect } from 'react'
import { useParams, Link, NavLink, Routes, Route, Navigate } from 'react-router-dom'
import { api } from '../api'
import ItemManager from './ItemManager'
import AuctionSchedule from './AuctionSchedule'
import AuctionResults from './AuctionResults'
import AdminOrders from './AdminOrders'
import AuctionDetails from './AuctionDetails'
import './AuctionWorkspace.css'

const TABS = [
  { path: 'lots', label: 'Lots' },
  { path: 'schedule', label: 'Schedule' },
  { path: 'results', label: 'Results' },
  { path: 'orders', label: 'Orders' },
  { path: 'details', label: 'Details' },
]

export default function AuctionWorkspace() {
  const { id } = useParams()
  const [auction, setAuction] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setAuction(null)
    setError('')
    api.getAuction(id).then(setAuction).catch(err => setError(err.message))
  }, [id])

  if (error) {
    return (
      <div className="page auction-workspace">
        <Link to="/host" className="aw-back">← Back to Host Dashboard</Link>
        <p className="error-msg">{error}</p>
      </div>
    )
  }

  if (!auction) {
    return (
      <div className="page auction-workspace">
        <Link to="/host" className="aw-back">← Back to Host Dashboard</Link>
        <p className="ar-empty">Loading auction…</p>
      </div>
    )
  }

  return (
    <div className="page auction-workspace">
      <Link to="/host" className="aw-back">← Back to Host Dashboard</Link>
      <div className="aw-header">
        <span className={`badge badge-${auction.status}`}>{auction.status}</span>
        <h1 className="aw-title">{auction.title}</h1>
      </div>

      <div className="aw-tabs">
        {TABS.map(t => (
          <NavLink
            key={t.path}
            to={t.path}
            className={({ isActive }) => `aw-tab${isActive ? ' active' : ''}`}
          >
            {t.label}
          </NavLink>
        ))}
      </div>

      <div className="card">
        <Routes>
          <Route path="lots" element={<ItemManager auctionId={auction.id} auctionStatus={auction.status} auctionMode={auction.mode} />} />
          <Route path="schedule" element={<AuctionSchedule auctionId={auction.id} auctionStatus={auction.status} auctionMode={auction.mode} />} />
          <Route path="results" element={<AuctionResults auctionId={auction.id} />} />
          <Route path="orders" element={<AdminOrders auctionId={auction.id} />} />
          <Route path="details" element={<AuctionDetails auction={auction} onSaved={setAuction} />} />
          <Route path="*" element={<Navigate to="lots" replace />} />
        </Routes>
      </div>
    </div>
  )
}
