import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import './StandardAuctionRoom.css'

const ADMIN_USERNAME = 'whatthefind'
const POLL_MS = 4000

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

function ItemDetailModal({ item, auctionId, username, isAdmin, now, onClose, onBidSuccess }) {
  const token = localStorage.getItem('wtf_token')
  const navigate = useNavigate()
  const [images, setImages] = useState([])
  const [activeImg, setActiveImg] = useState(0)
  const [bidInput, setBidInput] = useState('')
  const [bidError, setBidError] = useState('')
  const [bidLoading, setBidLoading] = useState(false)
  const [bidSuccess, setBidSuccess] = useState(false)

  useEffect(() => {
    api.getItemImages(auctionId, item.id)
      .then(imgs => {
        if (imgs && imgs.length > 0) setImages(imgs)
        else if (item.image_url) setImages([{ id: 'main', url: item.image_url }])
        else setImages([])
      })
      .catch(() => {
        if (item.image_url) setImages([{ id: 'main', url: item.image_url }])
      })
  }, [auctionId, item.id, item.image_url])

  const closed = item.status !== 'open' || (item.ends_at && new Date(item.ends_at).getTime() <= now)
  const isLeading = item.leading_bidder === username
  const floor = parseFloat(item.current_bid || item.starting_bid || 0)
  const timeLabel = timeLeftLabel(item.ends_at, now)

  async function placeBid() {
    if (!token) { navigate('/login'); return }
    const amount = parseFloat(bidInput)
    if (!amount || amount < floor) {
      setBidError(`Max bid must be at least $${floor.toFixed(2)}`); return
    }
    setBidLoading(true); setBidError('')
    try {
      await api.placeStandardBid(auctionId, item.id, amount)
      setBidSuccess(true)
      setBidInput('')
      onBidSuccess()
      setTimeout(() => setBidSuccess(false), 2500)
    } catch (e) {
      setBidError(e.message || 'Bid failed')
    } finally {
      setBidLoading(false)
    }
  }

  function prevImg() { setActiveImg(i => Math.max(0, i - 1)) }
  function nextImg() { setActiveImg(i => Math.min(images.length - 1, i + 1)) }

  return (
    <div className="sar-modal-backdrop" onClick={onClose}>
      <div className="sar-modal" onClick={e => e.stopPropagation()}>
        <button className="sar-modal-close" onClick={onClose}>✕</button>

        <div className="sar-modal-images">
          {images.length > 0 ? (
            <>
              <div className="sar-modal-main-img-wrap">
                {images.length > 1 && (
                  <button className="sar-img-nav sar-img-prev" onClick={prevImg} disabled={activeImg === 0}>‹</button>
                )}
                <img src={images[activeImg]?.url} alt={item.title} className="sar-modal-main-img" />
                {images.length > 1 && (
                  <button className="sar-img-nav sar-img-next" onClick={nextImg} disabled={activeImg === images.length - 1}>›</button>
                )}
              </div>
              {images.length > 1 && (
                <div className="sar-modal-thumbs">
                  {images.map((img, i) => (
                    <img
                      key={img.id}
                      src={img.url}
                      alt=""
                      className={`sar-modal-thumb ${i === activeImg ? 'active' : ''}`}
                      onClick={() => setActiveImg(i)}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="sar-modal-no-img">No photo available</div>
          )}
        </div>

        <div className="sar-modal-details">
          <div className="sar-modal-badges">
            <span className={`sar-status-badge sar-status-${item.status}`}>
              {item.status === 'open' ? 'Open' : item.status === 'sold' ? 'Sold' : 'Unsold'}
            </span>
          </div>

          <h2 className="sar-modal-title">{item.title}</h2>
          {item.description && <p className="sar-modal-desc">{item.description}</p>}

          <div className="sar-modal-stats">
            <div className="sar-modal-stat">
              <span className="sar-modal-stat-label">Current Bid</span>
              <span className="sar-modal-stat-val">${floor.toFixed(2)}</span>
            </div>
            <div className="sar-modal-stat">
              <span className="sar-modal-stat-label">Bids</span>
              <span className="sar-modal-stat-val">{item.bid_count || 0}</span>
            </div>
            {!closed && timeLabel && (
              <div className="sar-modal-stat">
                <span className="sar-modal-stat-label">Closes In</span>
                <span className="sar-modal-stat-val sar-countdown">{timeLabel}</span>
              </div>
            )}
          </div>

          {item.leading_bidder && (
            <p className={`sar-modal-leading ${isLeading ? 'you' : ''}`}>
              {closed && item.status === 'sold' ? 'Won by' : 'Leading'}:{' '}
              <strong>{isLeading ? 'You' : `@${item.leading_bidder}`}</strong>
            </p>
          )}
          {!item.leading_bidder && closed && item.status === 'unsold' && (
            <p className="sar-modal-leading">No bids — item unsold</p>
          )}

          {!closed && !isAdmin && (
            <div className="sar-modal-bid-section">
              <div className="sar-modal-bid-row">
                <input
                  type="number"
                  min={floor}
                  step="0.01"
                  placeholder={token ? `Max bid (min $${floor.toFixed(2)})` : 'Log in to bid'}
                  value={bidInput}
                  disabled={!token || bidLoading}
                  onChange={e => { setBidInput(e.target.value); setBidError('') }}
                />
                <button
                  className="btn-primary"
                  disabled={bidLoading || !token}
                  onClick={token ? placeBid : () => navigate('/login')}
                >
                  {!token ? 'Log in' : bidLoading ? 'Placing…' : 'Place Max Bid'}
                </button>
              </div>
              {bidError && <p className="error-msg">{bidError}</p>}
              {bidSuccess && <p className="sar-success">Bid placed!</p>}
              <p className="sar-hint">We'll automatically bid up to your max to keep you in the lead.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function StandardAuctionRoom() {
  const { id } = useParams()
  const navigate = useNavigate()
  const token = localStorage.getItem('wtf_token')
  const username = localStorage.getItem('wtf_username')
  const isAdmin = username === ADMIN_USERNAME

  const [auction, setAuction] = useState(null)
  const [items, setItems] = useState([])
  const [accessError, setAccessError] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [bidInputs, setBidInputs] = useState({})
  const [bidErrors, setBidErrors] = useState({})
  const [bidLoading, setBidLoading] = useState({})
  const [bidSuccess, setBidSuccess] = useState({})
  const [selectedItem, setSelectedItem] = useState(null)
  const pollRef = useRef(null)

  const loadAuction = useCallback(async () => {
    try {
      const a = await api.getAuction(id)
      setAuction(a)
    } catch (e) {
      setAccessError(e.message || 'Auction not found')
    }
  }, [id])

  const loadItems = useCallback(async () => {
    try {
      const data = await api.getStandardStatus(id)
      setItems(data || [])
    } catch (e) {}
  }, [id])

  useEffect(() => {
    loadAuction()
    loadItems()
    pollRef.current = setInterval(loadItems, POLL_MS)
    return () => clearInterval(pollRef.current)
  }, [loadAuction, loadItems])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    setSelectedItem(prev => {
      if (!prev) return prev
      const updated = items.find(i => i.id === prev.id)
      return updated || prev
    })
  }, [items])

  function updateBidInput(itemId, val) {
    setBidInputs(prev => ({ ...prev, [itemId]: val }))
    setBidErrors(prev => ({ ...prev, [itemId]: '' }))
  }

  async function placeCardBid(e, item) {
    e.stopPropagation()
    if (!token) { navigate('/login'); return }
    const raw = bidInputs[item.id]
    const amount = parseFloat(raw)
    const floor = parseFloat(item.current_bid || item.starting_bid || 0)
    if (!amount || amount < floor) {
      setBidErrors(prev => ({ ...prev, [item.id]: `Min $${floor.toFixed(2)}` }))
      return
    }
    setBidLoading(prev => ({ ...prev, [item.id]: true }))
    try {
      await api.placeStandardBid(id, item.id, amount)
      setBidSuccess(prev => ({ ...prev, [item.id]: true }))
      setBidInputs(prev => ({ ...prev, [item.id]: '' }))
      await loadItems()
      setTimeout(() => setBidSuccess(prev => ({ ...prev, [item.id]: false })), 2500)
    } catch (err) {
      setBidErrors(prev => ({ ...prev, [item.id]: err.message || 'Bid failed' }))
    } finally {
      setBidLoading(prev => ({ ...prev, [item.id]: false }))
    }
  }

  if (accessError) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="card" style={{ textAlign: 'center', maxWidth: 420, padding: '2.5rem' }}>
          <h2>Auction Not Found</h2>
          <p style={{ color: 'var(--text-muted)' }}>{accessError}</p>
          <button className="btn-ghost" onClick={() => navigate('/')}>Browse Auctions</button>
        </div>
      </div>
    )
  }

  if (!auction) {
    return <div className="page"><p style={{ color: 'var(--text-muted)', padding: '2rem' }}>Loading…</p></div>
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
      </div>

      {sorted.length === 0 ? (
        <p className="sar-empty">No items listed yet.</p>
      ) : (
        <div className="sar-grid">
          {sorted.map((item, idx) => {
            const closed = item.status !== 'open' || (item.ends_at && new Date(item.ends_at).getTime() <= now)
            const isLeading = item.leading_bidder === username
            const floor = parseFloat(item.current_bid || item.starting_bid || 0)
            const timeLabel = !closed ? timeLeftLabel(item.ends_at, now) : null
            const urgentCountdown = timeLabel && /^\d+s$/.test(timeLabel)
            const msLeft = (!closed && item.ends_at) ? new Date(item.ends_at).getTime() - now : Infinity
            const closingSoon = msLeft > 0 && msLeft <= 10 * 60 * 1000

            return (
              <div
                key={item.id}
                className={`sar-card${closed ? ' sar-card-closed' : ''}${closingSoon && !urgentCountdown ? ' sar-closing-soon' : ''}${urgentCountdown ? ' sar-urgent-item' : ''}`}
                onClick={() => setSelectedItem(item)}
              >
                <div className="sar-card-img-wrap">
                  {item.image_url
                    ? <img src={item.image_url} alt={item.title} className="sar-card-img" loading="lazy" />
                    : <div className="sar-card-no-img">No photo</div>
                  }
                  <span className="sar-card-lot">Lot {idx + 1}</span>
                  <span className={`sar-card-status-badge sar-status-${item.status}`}>
                    {item.status === 'open' ? 'Open' : item.status === 'sold' ? 'Sold' : 'Unsold'}
                  </span>

                  {!closed && !isAdmin && (
                    <div className="sar-hover-bid" onClick={e => e.stopPropagation()}>
                      <p className="sar-hover-bid-label">Quick Bid</p>
                      <input
                        type="number"
                        min={floor}
                        step="0.01"
                        placeholder={token ? `$${floor.toFixed(2)} or more` : 'Log in to bid'}
                        value={bidInputs[item.id] || ''}
                        disabled={!token || bidLoading[item.id]}
                        onChange={e => updateBidInput(item.id, e.target.value)}
                        onClick={e => e.stopPropagation()}
                      />
                      <button
                        className="btn-primary sar-quick-bid-btn"
                        disabled={bidLoading[item.id] || !token}
                        onClick={e => token ? placeCardBid(e, item) : navigate('/login')}
                      >
                        {bidLoading[item.id] ? '…' : token ? 'Place Max Bid' : 'Log In'}
                      </button>
                      {bidErrors[item.id] && <p className="sar-card-error">{bidErrors[item.id]}</p>}
                      {bidSuccess[item.id] && <p className="sar-card-success">✓ Bid placed!</p>}
                    </div>
                  )}
                </div>

                <div className="sar-card-body">
                  {closingSoon && (
                    <span className={`sar-closing-badge${urgentCountdown ? ' sar-urgent-badge' : ''}`}>
                      {urgentCountdown ? '🚨 Closing now!' : '🔥 Closing soon'}
                    </span>
                  )}
                  <h3 className="sar-card-title">{item.title}</h3>
                  <div className="sar-card-stats">
                    <div className="sar-card-stat">
                      <span className="sar-card-stat-label">Current Bid</span>
                      <span className="sar-card-stat-val">${floor.toFixed(2)}</span>
                    </div>
                    <div className="sar-card-stat">
                      <span className="sar-card-stat-label">Bids</span>
                      <span className="sar-card-stat-val">{item.bid_count || 0}</span>
                    </div>
                    {timeLabel && (
                      <div className="sar-card-stat">
                        <span className="sar-card-stat-label">Closes</span>
                        <span className={`sar-card-stat-val sar-countdown${urgentCountdown ? ' sar-urgent' : ''}`}>
                          {timeLabel}
                        </span>
                      </div>
                    )}
                  </div>

                  {isLeading && !closed && (
                    <p className="sar-card-leading-you">★ You're leading</p>
                  )}
                  {closed && item.status === 'sold' && item.leading_bidder && (
                    <p className="sar-card-winner">
                      Won by {item.leading_bidder === username ? 'you!' : `@${item.leading_bidder}`}
                    </p>
                  )}
                  {closed && item.status === 'unsold' && (
                    <p className="sar-card-unsold">No bids placed</p>
                  )}
                  <p className="sar-card-hint">Click for details →</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {selectedItem && (
        <ItemDetailModal
          item={selectedItem}
          auctionId={id}
          username={username}
          isAdmin={isAdmin}
          now={now}
          onClose={() => setSelectedItem(null)}
          onBidSuccess={loadItems}
        />
      )}
    </div>
  )
}
