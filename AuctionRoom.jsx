import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSocket, disconnectSocket } from '../socket'
import { api } from '../api'
import LiveStream from '../components/LiveStream'
import './AuctionRoom.css'

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function AuctionRoom() {
  const { id } = useParams()
  const navigate = useNavigate()
  const token = localStorage.getItem('wtf_token')
  const username = localStorage.getItem('wtf_username')

  const [auction, setAuction] = useState(null)
  const [bids, setBids] = useState([])
  const [chat, setChat] = useState([])
  const [viewers, setViewers] = useState(0)
  const [timeLeft, setTimeLeft] = useState(null)
  const [bidAmount, setBidAmount] = useState('')
  const [chatText, setChatText] = useState('')
  const [bidError, setBidError] = useState('')
  const [bidLoading, setBidLoading] = useState(false)
  const [livekitToken, setLivekitToken] = useState(null)
  const [livekitUrl] = useState(import.meta.env.VITE_LIVEKIT_URL)
  const chatEndRef = useRef(null)

  useEffect(() => {
    const socket = getSocket()
    socket.emit('join_auction', id)

    socket.on('auction_state', (data) => {
      setAuction(data)
      setBidAmount(String(data.current_bid + 1))
    })

    // Fetch LiveKit token if logged in
    if (token) {
      fetch(`${import.meta.env.VITE_API_URL}/auction/${id}/token`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(r => r.json())
        .then(data => { if (data.token) setLivekitToken(data.token) })
        .catch(() => {})
    }
    socket.on('bid_history', setBids)
    socket.on('chat_history', setChat)
    socket.on('viewer_count', setViewers)

    socket.on('new_bid', (bid) => {
      setBids(prev => [bid, ...prev])
      setAuction(prev => prev ? { ...prev, current_bid: bid.amount, leading_bidder: bid.username } : prev)
      setBidAmount(String(bid.amount + 1))
    })

    socket.on('new_chat', (msg) => {
      setChat(prev => [...prev, msg])
    })

    socket.on('time_remaining', ({ seconds }) => setTimeLeft(seconds))

    socket.on('bid_error', ({ message }) => {
      setBidError(message)
      setBidLoading(false)
    })

    socket.on('auction_ended', ({ winner, final_bid }) => {
      setAuction(prev => prev ? { ...prev, status: 'ended' } : prev)
      setChat(prev => [...prev, {
        id: 'ended',
        type: 'system',
        text: `🏁 Auction ended! Winner: @${winner} with $${final_bid}`,
        created_at: new Date().toISOString()
      }])
    })

    socket.on('auction_started', () => {
      setAuction(prev => prev ? { ...prev, status: 'live' } : prev)
    })

    socket.on('auction_extended', ({ new_ends_at }) => {
      setAuction(prev => prev ? { ...prev, ends_at: new_ends_at } : prev)
    })

    return () => {
      socket.off('auction_state')
      socket.off('bid_history')
      socket.off('chat_history')
      socket.off('viewer_count')
      socket.off('new_bid')
      socket.off('new_chat')
      socket.off('time_remaining')
      socket.off('bid_error')
      socket.off('auction_ended')
      socket.off('auction_started')
      socket.off('auction_extended')
    }
  }, [id])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat])

  function placeBid(e) {
    e.preventDefault()
    if (!token) { navigate('/login'); return }
    const amount = parseInt(bidAmount)
    if (!amount || amount <= (auction?.current_bid || 0)) {
      setBidError(`Bid must be higher than $${auction?.current_bid}`)
      return
    }
    setBidError('')
    setBidLoading(true)
    const socket = getSocket()
    socket.emit('place_bid', { auctionId: id, amount, token })
    setTimeout(() => setBidLoading(false), 2000)
  }

  function sendChat(e) {
    e.preventDefault()
    if (!token) { navigate('/login'); return }
    if (!chatText.trim()) return
    const socket = getSocket()
    socket.emit('send_chat', { auctionId: id, text: chatText, token })
    setChatText('')
  }

  // Host controls
  function hostAction(action, extra = {}) {
    const socket = getSocket()
    socket.emit(action, { auctionId: id, token, ...extra })
  }

  if (!auction) return <div className="page"><p style={{ color: 'var(--text-muted)' }}>Loading auction…</p></div>

  const isHost = username === auction.host_username
  const isLive = auction.status === 'live'
  const isEnded = auction.status === 'ended'
  const minBid = (auction.current_bid || 0) + 1

  return (
    <div className="page auction-room">
      {/* Header */}
      <div className="ar-header">
        <div className="ar-header-left">
          <div className="ar-badges">
            <span className={`badge badge-${auction.status}`}>{auction.status}</span>
            {auction.category && <span className="auction-category">{auction.category}</span>}
            <span className="ar-viewers">👁 {viewers} watching</span>
          </div>
          <h1 className="ar-title">{auction.title}</h1>
          {auction.description && <p className="ar-desc">{auction.description}</p>}
          <p className="ar-host">Hosted by <strong>@{auction.host_username}</strong></p>
        </div>

        {/* Countdown */}
        {isLive && timeLeft !== null && (
          <div className={`ar-timer ${timeLeft <= 30 ? 'urgent' : ''}`}>
            <div className="ar-timer-label">Ends in</div>
            <div className="ar-timer-value">{formatTime(timeLeft)}</div>
          </div>
        )}
      </div>

      {/* Live video stream */}
      {livekitToken && livekitUrl && (
        <LiveStream
          auctionId={id}
          token={livekitToken}
          livekitUrl={livekitUrl}
          isHost={isHost}
        />
      )}

      {auction.image_url && !livekitToken && (
        <div className="ar-image">
          <img src={auction.image_url} alt={auction.title} />
        </div>
      )}

      <div className="ar-body">
        {/* Left: bid panel */}
        <div className="ar-left">
          {/* Current bid */}
          <div className="card ar-bid-panel">
            <div className="ar-current-label">Current Bid</div>
            <div className="ar-current-bid">${auction.current_bid.toLocaleString()}</div>
            {auction.leading_bidder && (
              <div className="ar-leading">Leading: <strong>@{auction.leading_bidder}</strong></div>
            )}

            {isLive && !isHost && (
              <form onSubmit={placeBid} className="ar-bid-form">
                <input
                  type="number"
                  min={minBid}
                  value={bidAmount}
                  onChange={e => { setBidAmount(e.target.value); setBidError('') }}
                  placeholder={`Min $${minBid}`}
                />
                {bidError && <p className="error-msg">{bidError}</p>}
                <button type="submit" className="btn-primary ar-bid-btn" disabled={bidLoading}>
                  {bidLoading ? 'Placing…' : token ? `Bid $${bidAmount || '—'}` : 'Log in to bid'}
                </button>
              </form>
            )}

            {isEnded && (
              <div className="ar-ended-msg">
                🏁 Auction ended{auction.leading_bidder ? ` — @${auction.leading_bidder} won with $${auction.current_bid.toLocaleString()}` : ''}
              </div>
            )}
          </div>

          {/* Host controls */}
          {isHost && (
            <div className="card ar-host-panel">
              <h3 className="ar-host-title">Host Controls</h3>
              <div className="ar-host-btns">
                {auction.status === 'upcoming' && (
                  <button className="btn-green" onClick={() => hostAction('start_auction')}>▶ Start Now</button>
                )}
                {isLive && (
                  <>
                    <button className="btn-ghost" onClick={() => hostAction('extend_auction', { extraSeconds: 300 })}>+5 min</button>
                    <button className="btn-ghost" onClick={() => hostAction('extend_auction', { extraSeconds: 600 })}>+10 min</button>
                    <button className="btn-danger" onClick={() => { if (confirm('End auction now?')) hostAction('end_auction') }}>■ End Auction</button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Bid history */}
          <div className="card ar-bids">
            <h3 className="ar-section-title">Bid History</h3>
            {bids.length === 0 ? (
              <p className="ar-empty">No bids yet.</p>
            ) : (
              <ul className="ar-bid-list">
                {bids.map((bid, i) => (
                  <li key={bid.id || i} className={`ar-bid-item ${i === 0 ? 'top' : ''}`}>
                    <span className="ar-bid-user">@{bid.username}</span>
                    <span className="ar-bid-amount">${bid.amount.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: chat */}
        <div className="ar-right card ar-chat">
          <h3 className="ar-section-title">Live Chat</h3>
          <div className="ar-chat-messages">
            {chat.map((msg, i) => (
              <div
                key={msg.id || i}
                className={`ar-chat-msg ${msg.type === 'bid' || msg.type === 'system' ? 'system' : ''} ${msg.role === 'host' ? 'host' : ''}`}
              >
                {msg.type === 'msg' && (
                  <span className={`ar-chat-name ${msg.role}`}>@{msg.username}</span>
                )}
                <span className="ar-chat-text">{msg.text}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={sendChat} className="ar-chat-form">
            <input
              type="text"
              placeholder={token ? 'Say something…' : 'Log in to chat'}
              value={chatText}
              onChange={e => setChatText(e.target.value)}
              disabled={!token}
              maxLength={200}
            />
            <button type="submit" className="btn-primary ar-chat-send" disabled={!token}>→</button>
          </form>
        </div>
      </div>
    </div>
  )
}
