import { useState, useEffect, lazy } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import StandardAuctionRoom from './StandardAuctionRoom'
import ProfileGate from '../components/ProfileGate'
import './Buyer.css'

// Each live room is its own download: the host's screen only for the host's account, the viewer room for everyone else.
const LiveHostRoom = lazy(() => import('../live/LiveHostRoom'))
const LiveViewerRoom = lazy(() => import('../live/LiveViewerRoom'))
const ADMIN_USERNAME = 'whatthefind'

// Decides which room an auction opens in: a timed auction's room, or for a live show the host's screen (the host's
// own account; ?controller=1 = a second device with no camera) or the viewers' room. ?rehearsal=<key> is a draft
// live show's private rehearsal link. A timed auction's room needs an approved profile (ProfileGate); a live show's
// doesn't: an account that isn't approved yet watches like a guest and the room shows "Finish your profile to bid"
// (the server's watch_only; phase 5 §0). A blocked account is refused by the server (auction_error).
export default function AuctionRoomGate() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const rehearsal = params.get('rehearsal') || undefined
  const controller = params.get('controller') === '1'
  const [auction, setAuction] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.getAuction(id, rehearsal)
      .then(a => { if (!cancelled) setAuction(a) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [id, rehearsal])

  if (error) return <div className="page"><p className="error-msg">Auction not found.</p></div>
  if (!auction) return <div className="page"><p className="buyer-note">Loading auction...</p></div>
  if (auction.mode === 'standard') return <ProfileGate><StandardAuctionRoom initialAuction={auction} /></ProfileGate>

  const username = localStorage.getItem('wtf_username')
  const isHost = !!username && (username === ADMIN_USERNAME || username === auction.host_username)
  if (isHost) return <LiveHostRoom auction={auction} rehearsal={rehearsal} controller={controller} />
  return <LiveViewerRoom auction={auction} rehearsal={rehearsal} />
}
