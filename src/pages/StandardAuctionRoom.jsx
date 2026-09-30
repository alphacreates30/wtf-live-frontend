import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { api } from '../api'
import { lotPriceLabel } from '../lotPrice'

// The public lot rows name nobody (B7), so the viewer's own standing per lot comes from
// GET /auction/:id/my-standing: winning | outbid | no_bid | won | lost | closed. Logged out: none.
import TermsAcknowledgementModal from '../components/TermsAcknowledgementModal'
import { WatchButton, FollowButton } from '../watch/WatchButtons'
import './StandardAuctionRoom.css'
import PhotoPlaceholder from '../components/PhotoPlaceholder'
import { lotPath } from '../lot/slug'

const ADMIN_USERNAME = 'whatthefind'
const POLL_MS = 4000

function fmtPickupDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function FulfillmentNote({ auction }) {
  const mode = auction.fulfillment_mode
  const windowLabel = auction.pickup_starts_at && auction.pickup_ends_at
    ? `${fmtPickupDate(auction.pickup_starts_at)} – ${fmtPickupDate(auction.pickup_ends_at)}`
    : null
  // The town only: the street address goes to winners who chose pickup (B6).
  const pickupDetail = [
    auction.pickup_town ? `In ${auction.pickup_town}; the exact address is sent to winners` : 'The exact address is sent to winners',
    windowLabel ? `Pickup window: ${windowLabel}` : null,
  ].filter(Boolean).join(' · ')

  if (!mode || mode === 'shipping') {
    return <p className="sar-fulfillment-note"><span className="sar-tag">Shipping only</span></p>
  }
  if (mode === 'pickup') {
    return (
      <p className="sar-fulfillment-note">
        <span className="sar-tag">Pickup only</span>
        {pickupDetail && <span className="sar-fulfillment-detail">{pickupDetail}</span>}
      </p>
    )
  }
  return (
    <p className="sar-fulfillment-note">
      <span className="sar-tag">Shipping</span>
      <span className="sar-tag">Pickup</span>
      {pickupDetail && <span className="sar-fulfillment-detail">{pickupDetail}</span>}
    </p>
  )
}

function timeLeftLabel(endsAt, now) {
  if (!endsAt) return null
  const ms = new Date(endsAt).getTime() - now
  if (ms <= 0) return 'Closed'
  const totalSecs = Math.floor(ms / 1000)
  const d = Math.floor(totalSecs / 86400)
  const h = Math.floor((totalSecs % 86400) / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export default function StandardAuctionRoom({ initialAuction = null }) {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const deepLinkLot = searchParams.get('lot')
  const deepLinkDone = useRef(false)
  const navigate = useNavigate()
  const token = localStorage.getItem('wtf_token')
  const username = localStorage.getItem('wtf_username')
  const isAdmin = username === ADMIN_USERNAME

  const [auction, setAuction] = useState(initialAuction)
  const [items, setItems] = useState([])
  const [accessError, setAccessError] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [bidInputs, setBidInputs] = useState({})
  const [bidErrors, setBidErrors] = useState({})
  const [bidLoading, setBidLoading] = useState({})
  const [bidSuccess, setBidSuccess] = useState({})
  const [termsAccepted, setTermsAccepted] = useState(null)
  const [showTermsModal, setShowTermsModal] = useState(false)
  const pendingBidRef = useRef(null)
  const pollRef = useRef(null)

  const loadAuction = useCallback(async () => {
    try {
      const a = await api.getAuction(id)
      setAuction(a)
    } catch (e) {
      setAccessError(e.message || 'Auction not found')
    }
  }, [id])

  const [standing, setStanding] = useState({})
  const loadItems = useCallback(async () => {
    try {
      const [data, mine] = await Promise.all([
        api.getStandardStatus(id),
        token && !isAdmin ? api.getMyStanding(id).catch(() => null) : null,
      ])
      setItems(data || [])
      if (mine) setStanding(mine.lots || {})
    } catch (e) {}
  }, [id, token, isAdmin])

  useEffect(() => {
    if (!initialAuction) loadAuction()
    loadItems()
    pollRef.current = setInterval(loadItems, POLL_MS)
    return () => clearInterval(pollRef.current)
  }, [loadAuction, loadItems])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // The old lot link, /auction/:id?lot=<lot id> (emails and bookmarks from before lots had their own page),
  // moves to the lot's page once the lots have loaded. replace: Back skips the redirect.
  useEffect(() => {
    if (deepLinkDone.current || !deepLinkLot || !items.length || !auction) return
    deepLinkDone.current = true
    const lot = items.find(i => i.id === String(deepLinkLot).toLowerCase())
    if (lot) navigate(lotPath(auction.id, auction.title, lot.position), { replace: true })
  }, [items, deepLinkLot, auction, navigate])

  // A different auction always needs a fresh acknowledgement, so this resets
  // (and re-checks with the server) whenever `id` changes.
  useEffect(() => {
    setTermsAccepted(null)
    if (!token) { setTermsAccepted(false); return }
    api.getTermsAcceptance(id)
      .then(res => setTermsAccepted(!!res.accepted))
      .catch(() => setTermsAccepted(false))
  }, [id, token])

  // Gates the FIRST bid in this auction behind the acknowledgement modal;
  // every later bid calls `action` immediately. `action` is whatever the
  // caller was already about to do, so accepting places the bid they were
  // already making instead of making them click twice.
  function gateBid(action) {
    if (termsAccepted) { action(); return }
    pendingBidRef.current = action
    setShowTermsModal(true)
  }

  async function handleTermsAccept(fulfillment_choice) {
    await api.acceptTerms(id, fulfillment_choice)
    setTermsAccepted(true)
    setShowTermsModal(false)
    const pending = pendingBidRef.current
    pendingBidRef.current = null
    if (pending) pending()
  }

  function handleTermsCancel() {
    setShowTermsModal(false)
    pendingBidRef.current = null
  }

  function updateBidInput(itemId, val) {
    setBidInputs(prev => ({ ...prev, [itemId]: val }))
    setBidErrors(prev => ({ ...prev, [itemId]: '' }))
  }

  async function submitCardBid(itemId, amount) {
    setBidLoading(prev => ({ ...prev, [itemId]: true }))
    try {
      await api.placeStandardBid(id, itemId, amount)
      setBidSuccess(prev => ({ ...prev, [itemId]: true }))
      setBidInputs(prev => ({ ...prev, [itemId]: '' }))
      await loadItems()
      setTimeout(() => setBidSuccess(prev => ({ ...prev, [itemId]: false })), 2500)
    } catch (err) {
      setBidErrors(prev => ({ ...prev, [itemId]: err.message || 'Bid failed' }))
    } finally {
      setBidLoading(prev => ({ ...prev, [itemId]: false }))
    }
  }

  function placeCardBid(e, item) {
    e.stopPropagation()
    if (!token) { navigate('/login'); return }
    const raw = bidInputs[item.id]
    const amount = parseFloat(raw)
    const floor = parseFloat(item.current_bid || item.starting_bid || 0)
    if (!amount || amount < floor) {
      setBidErrors(prev => ({ ...prev, [item.id]: `Min $${floor.toFixed(2)}` }))
      return
    }
    gateBid(() => submitCardBid(item.id, amount))
  }

  if (accessError) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="card" style={{ textAlign: 'center', maxWidth: 420, padding: '2.5rem' }}>
          <h2>Auction Not Found</h2>
          <p style={{ color: 'var(--muted)' }}>{accessError}</p>
          <button className="btn-ghost" onClick={() => navigate('/')}>Browse Auctions</button>
        </div>
      </div>
    )
  }

  if (!auction) {
    return <div className="page"><p style={{ color: 'var(--muted)', padding: '2rem' }}>Loading…</p></div>
  }

  const openItems = items
    .filter(i => i.status === 'open')
    .sort((a, b) => {
      if (!a.ends_at && !b.ends_at) return 0
      if (!a.ends_at) return 1
      if (!b.ends_at) return -1
      return new Date(a.ends_at).getTime() - new Date(b.ends_at).getTime()
    })
  const closedItems = items.filter(i => i.status !== 'open')
  const sorted = [...openItems, ...closedItems]
  const premiumPct = auction.buyers_premium_pct ?? 15

  return (
    <div className="page standard-auction-room">
      <div className="sar-header">
        <div className="sar-header-badges">
          <span className="badge badge-standard">Standard Auction</span>
          {auction.category && <span className="sar-category">{auction.category}</span>}
        </div>
        <h1 className="sar-title">{auction.title}</h1>
        {auction.description && <p className="sar-desc">{auction.description}</p>}
        <div className="sar-meta">
          <span>Hosted by <strong>@{auction.host_username}</strong></span>
          <span className="sar-sep">·</span>
          <span>{items.length} item{items.length !== 1 ? 's' : ''}</span>
          <span className="sar-sep">·</span>
          <span>{openItems.length} open</span>
        </div>
        {!isAdmin && (auction.status === 'live' || auction.status === 'upcoming') && (
          <div className="sar-follow">
            <FollowButton auctionId={auction.id} upcoming={auction.status === 'upcoming' && !!auction.starts_at && Date.parse(auction.starts_at) > now} />
          </div>
        )}
        <FulfillmentNote auction={auction} />
      </div>

      {sorted.length === 0 ? (
        <p className="sar-empty">No items listed yet.</p>
      ) : (
        <div className="sar-grid">
          {sorted.map(item => {
            const closed = item.status !== 'open' || (item.ends_at && new Date(item.ends_at).getTime() <= now)
            const mine = standing[item.id]
            const floor = parseFloat(item.current_bid || item.starting_bid || 0)
            const timeLabel = !closed ? timeLeftLabel(item.ends_at, now) : null
            const urgentCountdown = timeLabel && /^\d+s$/.test(timeLabel)
            const msLeft = (!closed && item.ends_at) ? new Date(item.ends_at).getTime() - now : Infinity
            const closingSoon = msLeft > 0 && msLeft <= 10 * 60 * 1000

            return (
              <div
                key={item.id}
                className={`sar-card${closed ? ' sar-card-closed' : ''}${closingSoon && !urgentCountdown ? ' sar-closing-soon' : ''}${urgentCountdown ? ' sar-urgent-item' : ''}`}
                onClick={() => navigate(lotPath(auction.id, auction.title, item.position))}
              >
                <div className="sar-card-img-wrap">
                  {item.image_url
                    // Grid card: the small WebP when there is one (F1a). The lot modal keeps the full photo.
                    ? <img src={item.thumb_url || item.image_url} alt={item.title} className="sar-card-img" loading="lazy" />
                    : <div className="sar-card-no-img"><PhotoPlaceholder seed={item.id} /></div>
                  }
                  <span className="sar-card-lot">Lot {item.position + 1}</span>
                  {!closed && !isAdmin && <WatchButton itemId={item.id} compact className="sar-card-watch" />}
                  <span className={`sar-card-status-badge sar-status-${item.status}`}>
                    {item.status === 'open' ? 'Open' : item.status === 'sold' ? 'Sold' : 'Unsold'}
                  </span>

                  {!closed && !isAdmin && (
                    <div className="sar-hover-bid" onClick={e => e.stopPropagation()}>
                      <p className="sar-hover-bid-label">Quick Bid</p>
                      <input
                        type="number"
                        inputMode="decimal"
                        aria-label={`Max bid for ${item.title}`}
                        min={floor}
                        step="0.01"
                        placeholder={token ? `$${floor.toFixed(2)} or more` : 'Log in to bid'}
                        value={bidInputs[item.id] || ''}
                        disabled={!token || bidLoading[item.id]}
                        onChange={e => updateBidInput(item.id, e.target.value)}
                        onClick={e => e.stopPropagation()}
                      />
                      <button
                        className="btn-bid sar-quick-bid-btn"
                        disabled={bidLoading[item.id] || !token}
                        onClick={e => token ? placeCardBid(e, item) : navigate('/login')}
                      >
                        {bidLoading[item.id] ? '…' : token ? 'Place Max Bid' : 'Log In'}
                      </button>
                      {bidErrors[item.id] && <p className="sar-card-error">{bidErrors[item.id]}</p>}
                      {bidSuccess[item.id] && <p className="sar-card-success">Bid placed</p>}
                    </div>
                  )}
                </div>

                <div className="sar-card-body">
                  {closingSoon && (
                    <span className={`sar-closing-badge${urgentCountdown ? ' sar-urgent-badge' : ''}`}>
                      {urgentCountdown ? 'Closing now' : 'Closing'}
                    </span>
                  )}
                  <h3 className="sar-card-title"><Link to={lotPath(auction.id, auction.title, item.position)} onClick={e => e.stopPropagation()}>{item.title}</Link></h3>
                  <div className="sar-card-stats">
                    {lotPriceLabel(item) && (
                      <div className="sar-card-stat">
                        <span className="sar-card-stat-label">{lotPriceLabel(item)}</span>
                        <span className="sar-card-stat-val">${floor.toFixed(2)}</span>
                        {item.status !== 'unsold' && <span className="sar-prem">+{premiumPct}% prem.</span>}
                      </div>
                    )}
                    <div className="sar-card-stat">
                      <span className="sar-card-stat-label">Bids</span>
                      <span className="sar-card-stat-val">{item.bid_count || 0}</span>
                    </div>
                    {timeLabel && (
                      <div className="sar-card-stat">
                        <span className="sar-card-stat-label">Closes</span>
                        <span className="sar-countdown-row">
                          {urgentCountdown && <img src="/brand/state-closing.svg" alt="" width="18" height="18" className="sar-state-closing" />}
                          <span className={`sar-card-stat-val sar-countdown${msLeft < 3600e3 ? ' sar-final-hour' : ''}${urgentCountdown ? ' sar-urgent' : ''}`}>
                            {timeLabel}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>

                  {mine === 'winning' && !closed && (
                    <p className="sar-card-leading-you">You're winning</p>
                  )}
                  {mine === 'outbid' && !closed && (
                    <p className="sar-card-outbid-you">You've been outbid</p>
                  )}
                  {closed && item.status === 'sold' && (
                    mine === 'won' ? (
                      <p className="sar-card-winner sar-won-you">
                        <img src="/brand/state-won.svg" alt="" width="32" height="32" />
                        Won by you!
                      </p>
                    ) : (
                      // The admin (full rows) sees who; everyone else only that it sold.
                      <p className="sar-card-winner">{isAdmin && item.leading_bidder ? `Won by @${item.leading_bidder}` : 'Sold'}</p>
                    )
                  )}
                  {closed && item.status === 'unsold' && (
                    <p className="sar-card-unsold">{item.bid_count > 0 ? 'Reserve not met' : 'No bids placed'}</p>
                  )}
                  <p className="sar-card-hint">View lot →</p>
                </div>
              </div>
            )
          })}
        </div>
      )}


      {showTermsModal && (
        <TermsAcknowledgementModal
          auction={auction}
          onCancel={handleTermsCancel}
          onAccept={handleTermsAccept}
        />
      )}
    </div>
  )
}
