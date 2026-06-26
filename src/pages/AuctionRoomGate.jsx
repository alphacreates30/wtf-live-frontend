import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import AuctionRoom from './AuctionRoom'
import StandardAuctionRoom from './StandardAuctionRoom'

// Decides whether to render the Live (video/socket) auction room or the
// Standard (timed, proxy-bid) auction room, based on the auction's mode.
export default function AuctionRoomGate() {
  const { id } = useParams()
  const [mode, setMode] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.getAuction(id)
      .then(a => { if (!cancelled) setMode(a.mode === 'standard' ? 'standard' : 'live') })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [id])

  if (error) return <div className="page"><p style={{ color: 'var(--text-muted)' }}>Auction not found.</p></div>
  if (!mode) return <div className="page"><p style={{ color: 'var(--text-muted)' }}>Loading auction...</p></div>

  return mode === 'standard' ? <StandardAuctionRoom /> : <AuctionRoom />
}
