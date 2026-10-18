import { useState, useEffect, lazy } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import AuctionRoom from './AuctionRoom'
import StandardAuctionRoom from './StandardAuctionRoom'
import './Buyer.css'

// The live host screen is only for the host's account: kept out of the viewers' download.
const LiveHostRoom = lazy(() => import('../live/LiveHostRoom'))
const ADMIN_USERNAME = 'whatthefind'

// Decides which room an auction opens in: a timed auction's room, or for a live show the host's screen (the host's
// own account; ?controller=1 = a second device with no camera) or the viewers' room. ?rehearsal=<key> is a draft
// live show's private rehearsal link.
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
  if (auction.mode === 'standard') return <StandardAuctionRoom initialAuction={auction} />

  const username = localStorage.getItem('wtf_username')
  const isHost = !!username && (username === ADMIN_USERNAME || username === auction.host_username)
  if (isHost) return <LiveHostRoom auction={auction} rehearsal={rehearsal} controller={controller} />
  return <AuctionRoom />
}
