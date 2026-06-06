import { useState, useEffect } from 'react'
import { api } from '../api'
import { getSocket } from '../socket'

export default function ItemQueue({ auctionId, isHost, token }) {
  const [items, setItems] = useState([])
  const [activeItem, setActiveItem] = useState(null)
  const [prebidModal, setPrebidModal] = useState(null) // item to pre-bid on
  const [prebidAmount, setPrebidAmount] = useState('')
  const [myPrebids, setMyPrebids] = useState({}) // itemId -> max_amount
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const username = localStorage.getItem('wtf_username')

  useEffect(() => {
    loadItems()
  }, [auctionId])

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return
    socket.on('item_activated', ({ item }) => {
      setActiveItem(item)
      setItems(prev => prev.map(i => i.id === item.id ? item : i.status === 'active' ? {...i, status: 'sold'} : i))
    })
    socket.on('items_finished', () => {
      setActiveItem(null)
    })
    return () => {
      socket.off('item_activated')
      socket.off('items_finished')
    }
  }, [auctionId])

  async function loadItems() {
    try {
      const data = await api.getAuctionItems(auctionId)
      setItems(data)
      const active = data.find(i => i.status === 'active')
      if (active) setActiveItem(active)
      // Load my pre-bids
      const prebids = {}
      for (const item of data.filter(i => i.status === 'pending')) {
        try {
          const pb = await api.getMyPrebid(auctionId, item.id)
          if (pb) prebids[item.id] = pb.max_amount
        } catch {}
      }
      setMyPrebids(prebids)
    } catch {}
  }

  async function handleNextItem() {
    const socket = getSocket()
    if (!socket || !token) return
    socket.emit('next_item', { auctionId, token })
  }

  async function handlePrebid(e) {
    e.preventDefault()
    if (!prebidModal || !prebidAmount) return
    setLoading(true); setError('')
    try {
      await api.placePrebid(auctionId, prebidModal.id, parseFloat(prebidAmount))
      setMyPrebids(prev => ({...prev, [prebidModal.id]: parseFloat(prebidAmount)}))
      // Refresh item stats
      const updated = await api.getAuctionItems(auctionId)
      setItems(updated)
      setPrebidModal(null)
      setPrebidAmount('')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function handleCancelPrebid(itemId) {
    await api.cancelPrebid(auctionId, itemId)
    const updated = {...myPrebids}; delete updated[itemId]
    setMyPrebids(updated)
    const refreshed = await api.getAuctionItems(auctionId)
    setItems(refreshed)
  }

  if (items.length === 0) return null

  return (
    <div className="item-queue">
      <div className="iq-header">
        <h3>Items in this Show</h3>
        {isHost && (
          <button className="btn-primary iq-next" onClick={handleNextItem}>
            {activeItem ? 'Next Item →' : 'Start First Item →'}
          </button>
        )}
      </div>

      {activeItem && (
        <div className="iq-active">
          <div className="iq-active-label">NOW SELLING</div>
          {activeItem.image_url && <img src={activeItem.image_url} alt={activeItem.title} className="iq-active-img" />}
          <div className="iq-active-title">{activeItem.title}</div>
          {activeItem.description && <div className="iq-active-desc">{activeItem.description}</div>}
          <div className="iq-active-bid">Opening bid: ${parseFloat(activeItem.current_bid || activeItem.starting_bid).toFixed(2)}</div>
        </div>
      )}

      <div className="iq-list">
        {items.map((item, idx) => (
          <div key={item.id} className={"iq-item iq-" + item.status}>
            <div className="iq-num">{idx + 1}</div>
            {item.image_url && <img src={item.image_url} alt={item.title} className="iq-thumb" />}
            <div className="iq-info">
              <div className="iq-title">{item.title}</div>
              <div className="iq-details">
                ${parseFloat(item.starting_bid).toFixed(2)} start
                {item.pre_bid_count > 0 && (
                  <span className="iq-prebid-info"> · {item.pre_bid_count} pre-bid{item.pre_bid_count !== 1 ? 's' : ''} · Top: ${parseFloat(item.top_pre_bid).toFixed(2)}</span>
                )}
              </div>
              {myPrebids[item.id] && (
                <div className="iq-my-prebid">
                  Your max: ${parseFloat(myPrebids[item.id]).toFixed(2)}
                  <button className="iq-cancel-prebid" onClick={() => handleCancelPrebid(item.id)}>Cancel</button>
                </div>
              )}
            </div>
            {!isHost && item.status === 'pending' && (
              <button className="btn-sm iq-prebid-btn" onClick={() => { setPrebidModal(item); setPrebidAmount(myPrebids[item.id] || '') }}>
                {myPrebids[item.id] ? 'Update Pre-Bid' : 'Pre-Bid'}
              </button>
            )}
            {item.status !== 'pending' && <span className={"iq-badge iq-badge-" + item.status}>{item.status}</span>}
          </div>
        ))}
      </div>

      {prebidModal && (
        <div className="iq-modal-overlay" onClick={() => setPrebidModal(null)}>
          <div className="iq-modal" onClick={e => e.stopPropagation()}>
            <h3>Pre-Bid on "{prebidModal.title}"</h3>
            <p className="iq-modal-sub">Set your maximum bid. We'll bid up to this amount automatically when this item goes live.</p>
            {prebidModal.pre_bid_count > 0 && (
              <p className="iq-modal-info">{prebidModal.pre_bid_count} pre-bid{prebidModal.pre_bid_count !== 1 ? 's' : ''} · Current top: ${parseFloat(prebidModal.top_pre_bid).toFixed(2)}</p>
            )}
            {error && <p className="error-msg">{error}</p>}
            <form onSubmit={handlePrebid}>
              <div className="iq-modal-input-wrap">
                <span className="iq-dollar">$</span>
                <input
                  type="number" min={parseFloat(prebidModal.starting_bid)} step="0.01"
                  placeholder={"Min: " + prebidModal.starting_bid}
                  value={prebidAmount}
                  onChange={e => setPrebidAmount(e.target.value)}
                  autoFocus required
                  className="iq-modal-input"
                />
              </div>
              <div className="iq-modal-btns">
                <button type="button" className="btn-ghost" onClick={() => setPrebidModal(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Saving…' : 'Confirm Pre-Bid'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
