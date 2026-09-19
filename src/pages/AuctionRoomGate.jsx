import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import AuctionRoom from './AuctionRoom'
import StandardAuctionRoom from './StandardAuctionRoom'
import './Buyer.css'

// Decides whether to render the Live (video/socket) auction room or the
// Standard (timed, proxy-bid) auction room, based on the auction's mode.
export default function AuctionRoomGate() {
  const { id } = useParams()
  const [mode, setMode] = useState(null)

  const [auction, setAuction] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.getAuction(id)
      .then(a => { if (!cancelled) { setAuction(a); setMode(a.mode === 'standard' ? 'standard' : 'live') } })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [id])

  if (error) return <div className="page"><p className="error-msg">Auction not found.</p></div>
  if (!mode) return <div className="page"><p className="buyer-note">Loading auction...</p></div>

  return mode === 'standard' ? <StandardAuctionRoom initialAuction={auction} /> : <AuctionRoom />
}
