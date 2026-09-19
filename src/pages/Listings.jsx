import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import './Listings.css'

const ADMIN_USERNAME = 'whatthefind'

function timeLeft(endsAt) {
  const diff = new Date(endsAt) - Date.now()
  if (diff <= 0) return 'Ended'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function fmtOpens(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function AuctionCard({ auction }) {
  const [countdown, setCountdown] = useState(timeLeft(auction.ends_at))

  useEffect(() => {
    if (auction.status !== 'live') return
    const t = setInterval(() => setCountdown(timeLeft(auction.ends_at)), 1000)
    return () => clearInterval(t)
  }, [auction.ends_at, auction.status])

  return (
    <Link to={`/auction/${auction.id}`} className="auction-card card">
      {/* Photography leads: a card with no image is a hole on a dark ground,
          so it gets an honest placeholder instead of collapsing. */}
      <div className="auction-card-img">
        {auction.image_url
          ? <img src={auction.image_url} alt={auction.title} />
          : (
            <div className="auction-card-img-empty">
              <img src="/logo-mark.svg" alt="" width="44" height="44" />
              <span>Photography to follow</span>
            </div>
          )}
      </div>
      <div className="auction-card-body">
        <div className="auction-card-top">
          <span className={`badge badge-${auction.status}`}>{auction.status}</span>
          {auction.category && <span className="auction-category">{auction.category}</span>}
        </div>
        <h3 className="auction-card-title">{auction.title}</h3>
        {auction.description && (
          <p className="auction-card-desc">{auction.description}</p>
        )}
        <div className="auction-card-footer">
          {/* A standard auction has no single "current bid" - forty lots, forty
              bids - so its card says so instead of showing a stale auction-level
              number. Only a live-mode auction has one running price. */}
          {auction.mode === 'standard' ? (
            <div>
              <div className="auction-label">Bidding</div>
              <div className="auction-bid auction-bid-text">Lot by lot</div>
            </div>
          ) : (
            <div>
              <div className="auction-label">Current Bid</div>
              <div className="auction-bid">${Number(auction.current_bid || 0).toLocaleString()}</div>
            </div>
          )}
          {auction.status === 'scheduled' && auction.starts_at && (
            <div>
              <div className="auction-label">Opens</div>
              <div className="auction-opens">{fmtOpens(auction.starts_at)}</div>
            </div>
          )}
          {auction.status === 'live' && (
            <div className="auction-timer">
              <div className="auction-label">Ends in</div>
              <div className="auction-countdown">{countdown}</div>
            </div>
          )}
          {auction.mode !== 'standard' && auction.leading_bidder && (
            <div>
              <div className="auction-label">Leading</div>
              <div className="auction-leader">@{auction.leading_bidder}</div>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

export default function Listings() {
  const [auctions, setAuctions] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const username = localStorage.getItem('wtf_username')
  const isAdmin = username === ADMIN_USERNAME

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        const status = filter === 'all' ? undefined : filter
        const data = await api.getAuctions(status)
        setAuctions(data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [filter])

  const filters = ['all', 'live', 'upcoming', 'ended']

  return (
    <div className="page listings-page">
      <div className="listings-header">
        <div>
          <p className="wtf-label listings-eyebrow">Auctions</p>
          {/* The signature gesture - once per page, and this is the page. */}
          <h1 className="listings-title">
            Every collection has a <span className="wtf-script-accent">story</span> worth telling
          </h1>
          <p className="listings-sub">Every lot photographed, catalogued and described.</p>
        </div>
        {isAdmin && (
          <Link to="/host">
            <button className="btn-primary">+ Host an Auction</button>
          </Link>
        )}
      </div>

      <div className="listings-filters">
        {filters.map(f => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading && <p className="listings-status">Loading auctions...</p>}
      {error && <p className="error-msg">{error}</p>}
      {!loading && !error && auctions.length === 0 && (
        <div className="listings-empty">
          <p>No {filter === 'all' ? '' : filter} auctions yet.</p>
          {isAdmin && (
            <Link to="/host"><button className="btn-primary" style={{ marginTop: 12 }}>Start one</button></Link>
          )}
        </div>
      )}

      <div className="listings-grid">
        {auctions.map(a => <AuctionCard key={a.id} auction={a} />)}
      </div>
    </div>
  )
}
