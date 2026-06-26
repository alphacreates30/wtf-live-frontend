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
    } catch (e) {
      // keep showing last known items on transient errors
    }
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

  function updateBidInput(itemId, val) {
    setBidInputs(prev => ({ ...prev, [itemId]: val }))
    setBidErrors(prev => ({ ...prev, [itemId]: '' }))
  }

  async function placeBid(item) {
    if (!token) { navigate('/login'); return }
    const raw = bidInputs[item.id]
    const amount = parseFloat(raw)
    const floor = parseFloat(item.current_bid || item.starting_bid)
    if (!amount || amount < floor) {
      setBidErrors(prev => ({ ...prev, [item.id]: `Max bid must be at least $${floor.toFixed(2)}` }))
      return
    }
    setBidLoading(prev => ({ ...prev, [item.id]: true }))
    setBidErrors(prev => ({ ...prev, [item.id]: '' }))
    try {
      await api.placeStandardBid(id, item.id, amount)
      setBidSuccess(prev => ({ ...prev, [item.id]: true }))
      setBidInputs(prev => ({ ...prev, [item.id]: '' }))
      await loadItems()
      setTimeout(() => setBidSuccess(prev => ({ ...prev, [item.id]: false })), 2500)
    } catch (e) {
      setBidErrors(prev => ({ ...prev, [item.id]: e.message || 'Bid failed' }))
    } finally {
      setBidLoading(prev => ({ ...prev, [item.id]: false }))
    }
  }

  if (accessError) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="card" style={{ textAlign: 'center', maxWidth: 420, padding: '2.5rem' }}>
          <h2 style={{ marginBottom: '0.5rem' }}>Auction Not Found</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>{accessError}</p>
          <button className="btn-ghost" onClick={() => navigate('/')}>Browse Auctions</button>
        </div>
      </div>
    )
  }

  if (!auction) return <div className="page"><p style={{ color: 'var(--text-muted)' }}>Loading auction...</p></div>

  const openItems = items.filter(i => i.status === 'open')
  const closedItems = items.filter(i => i.status !== 'open')
  const sorted = [...openItems, ...closedItems]

  return (
    <div className="page standard-auction-room">
      <div className="sar-header">
        <div className="sar-badges">
          <span className="badge badge-standard">Standard Auction</span>
          {auction.category && <span className="auction-category">{auction.category}</span>}
        </div>
        <h1 className="sar-title">{auction.title}</h1>
        {auction.description && <p className="sar-desc">{auction.description}</p>}
        <p className="sar-host">Hosted by <strong>@{auction.host_username}</strong></p>
      </div>

      {sorted.length === 0 ? (
        <p className="sar-empty">No items have been listed yet.</p>
      ) : (
        <div className="sar-grid">
          {sorted.map(item => {
            const closed = item.status !== 'open' || (item.ends_at && new Date(item.ends_at).getTime() <= now)
            const isLeading = item.leading_bidder && item.leading_bidder === username
            const floor = parseFloat(item.current_bid || item.starting_bid)
            return (
              <div key={item.id} className={`card sar-item ${closed ? 'sar-closed' : ''}`}>
                {item.image_url && <img src={item.image_url} alt={item.title} className="sar-item-img" />}
                <div className="sar-item-body">
                  <div className="sar-item-top">
                    <h3 className="sar-item-title">{item.title}</h3>
                    <span className={`sar-status-badge sar-status-${item.status}`}>
                      {item.status === 'open' ? 'Open' : item.status === 'sold' ? 'Sold' : 'Unsold'}
                    </span>
                  </div>
                  {item.description && <p className="sar-item-desc">{item.description}</p>}

                  <div className="sar-item-stats">
                    <div className="sar-stat">
                      <span className="sar-stat-label">Current Bid</span>
                      <span className="sar-stat-value">${floor.toFixed(2)}</span>
                    </div>
                    <div className="sar-stat">
                      <span className="sar-stat-label">Bids</span>
                      <span className="sar-stat-value">{item.bid_count || 0}</span>
                    </div>
                    {!closed && item.ends_at && (
                      <div className="sar-stat">
                        <span className="sar-stat-label">Closes In</span>
                        <span className="sar-stat-value sar-countdown">{timeLeftLabel(item.ends_at, now)}</span>
                      </div>
                    )}
                  </div>

                  {item.leading_bidder && (
                    <p className={`sar-leading ${isLeading ? 'sar-leading-you' : ''}`}>
                      {closed && item.status === 'sold' ? 'Won by' : 'Leading'}: <strong>{isLeading ? 'You' : `@${item.leading_bidder}`}</strong>
                    </p>
                  )}
                  {!item.leading_bidder && closed && item.status === 'unsold' && (
                    <p className="sar-leading">No bids — item unsold</p>
                  )}

                  {!closed && !isAdmin && (
                    <div className="sar-bid-form">
                      <input
                        type="number"
                        min={floor}
                        step="0.01"
                        placeholder={token ? `Max bid (min $${floor.toFixed(2)})` : 'Log in to bid'}
                        value={bidInputs[item.id] || ''}
                        disabled={!token}
                        onChange={e => updateBidInput(item.id, e.target.value)}
                      />
                      <button
                        className="btn-primary"
                        disabled={bidLoading[item.id]}
                        onClick={() => placeBid(item)}
                      >
                        {!token ? 'Log in to bid' : bidLoading[item.id] ? 'Placing...' : 'Place Max Bid'}
                      </button>
                    </div>
                  )}
                  {bidErrors[item.id] && <p className="error-msg">{bidErrors[item.id]}</p>}
                  {bidSuccess[item.id] && <p className="sar-success">Bid placed!</p>}
                  {!closed && !isAdmin && (
                    <p className="sar-hint">We'll automatically bid up to your max as others bid, using the lowest amount needed to keep you leading.</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
