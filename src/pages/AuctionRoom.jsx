import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSocket, disconnectSocket } from '../socket'
import { api } from '../api'
import LiveStream from '../components/LiveStream'
import ItemQueue from '../components/ItemQueue'
import './AuctionRoom.css'

const ADMIN_USERNAME = 'whatthefind'

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
  const userId = localStorage.getItem('wtf_user_id')
  const isAdmin = username === ADMIN_USERNAME

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
  const [accessError, setAccessError] = useState(null) // { code, message }
  const [flaggedUsers, setFlaggedUsers] = useState(new Set())
  const [blockingUser, setBlockingUser] = useState(null)
  const chatEndRef = useRef(null)

  useEffect(() => {
    const socket = getSocket()
    // Pass token so server can check approval status
    socket.emit('join_auction', { auctionId: id, token })

    socket.on('auction_state', (data) => {
      setAuction(data)
      setBidAmount(String(data.current_bid + 1))
    })

    // Approval / access errors
    socket.on('auction_error', ({ code, message }) => {
      setAccessError({ code, message })
    })

    // Admin blocked this user mid-auction
    socket.on('user_blocked', ({ message }) => {
      setAccessError({ code: 'blocked', message })
    })

    // Another user was blocked â hide their messages
    socket.on('messages_flagged', ({ username: flaggedUsername }) => {
      setFlaggedUsers(prev => new Set([...prev, flaggedUsername]))
    })

    // LiveKit token
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
        id: 'ended', type: 'system',
        text: `ð Auction ended! Winner: @${winner} with $${final_bid}`,
        created_at: new Date().toISOString()
      }])
    })

    socket.on('auction_started', () => {
      setAuction(prev => prev ? { ...prev, status: 'live' } : prev)
    })

    socket.on('auction_extended', ({ new_ends_at }) => {
      setAuction(prev => prev ? { ...prev, ends_at: new_ends_at } : prev)
    })

    socket.on('block_success', ({ targetUsername }) => {
      setBlockingUser(null)
      setChat(prev => [...prev, {
        id: 'block-' + targetUsername, type: 'system',
        text: `ð« @${targetUsername} has been removed from this auction.`,
        created_at: new Date().toISOString()
      }])
    })

    return () => {
      socket.off('auction_state')
      socket.off('auction_error')
      socket.off('user_blocked')
      socket.off('messages_flagged')
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
      socket.off('block_success')
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

  function hostAction(action, extra = {}) {
    const socket = getSocket()
    socket.emit(action, { auctionId: id, token, ...extra })
  }

  function blockUser(targetUserId, targetUsername) {
    if (!confirm(`Remove @${targetUsername} from this auction and block their account?`)) return
    setBlockingUser(targetUserId)
    const socket = getSocket()
    socket.emit('block_user', { targetUserId, targetUsername, auctionId: id, token })
  }

  // Access denied screen (not approved, blocked, etc.)
  if (accessError) {
    const icons = { pending: 'â³', blocked: 'ð«', no_profile: 'ð', payment_failed: 'ð³' }
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="card" style={{ textAlign: 'center', maxWidth: 420, padding: '2.5rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>{icons[accessError.code] || 'ð'}</div>
          <h2 style={{ marginBottom: '0.5rem' }}>
            {accessError.code === 'pending' ? 'Approval Required' :
             accessError.code === 'blocked' ? 'Removed from Auction' :
             accessError.code === 'no_profile' ? 'Profile Required' : 'Access Restricted'}
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>{accessError.message}</p>
          {accessError.code === 'no_profile' && (
            <button className="btn-primary" onClick={() => navigate('/profile-setup')}>Complete Profile â</button>
          )}
          {accessError.code === 'pending' && (
            <button className="btn-ghost" onClick={() => navigate('/')}>Browse Auctions</button>
          )}
          {accessError.code === 'blocked' && (
            <button className="btn-ghost" onClick={() => navigate('/')}>Go Home</button>
          )}
        </div>
      </div>
    )
  }

  if (!auction) return <div className="page"><p style={{ color: 'var(--text-muted)' }}>Loading auctionâ¦</p></div>

  const isHost = username === auction.host_username
  const isLive = auction.status === 'live'
  const isEnded = auction.status === 'ended'
  const minBid = (auction.current_bid || 0) + 1

  // Viewers in chat: extract unique usernames from chat messages (for block buttons)
  const chatUsers = [...new Set(chat.filter(m => m.type === 'msg' && m.username !== username && m.username !== auction.host_username).map(m => m.username))]

  return (
    <div className="page auction-room">
      {/* Header */}
      <div className="ar-header">
        <div className="ar-header-left">
          <div className="ar-badges">
            <span className={`badge badge-${auction.status}`}>{auction.status}</span>
            {auction.category && <span className="auction-category">{auction.category}</span>}
            <span className="ar-viewers">ð {viewers} watching</span>
          </div>
          <h1 className="ar-title">{auction.title}</h1>
          {auction.description && <p className="ar-desc">{auction.description}</p>}
          <p className="ar-host">Hosted by <strong>@{auction.host_username}</strong></p>
        </div>

        {isLive && timeLeft !== null && (
          <div className={`ar-timer ${timeLeft <= 30 ? 'urgent' : ''}`}>
            <div className="ar-timer-label">Ends in</div>
            <div className="ar-timer-value">{formatTime(timeLeft)}</div>
          </div>
        )}
      </div>

      {livekitToken && livekitUrl && (
        <LiveStream auctionId={id} token={livekitToken} livekitUrl={livekitUrl} isHost={isHost} />
      )}

      {auction.image_url && !livekitToken && (
        <div className="ar-image"><img src={auction.image_url} alt={auction.title} /></div>
      )}

      <div className="ar-body">
        {/* Left: bid panel */}
        <div className="ar-left">
          <div className="card ar-bid-panel">
            <div className="ar-current-label">Current Bid</div>
            <div className="ar-current-bid">${auction.current_bid.toLocaleString()}</div>
            {auction.leading_bidder && (
              <div className="ar-leading">Leading: <strong>@{auction.leading_bidder}</strong></div>
            )}

            {isLive && !isHost && (
              <form onSubmit={placeBid} className="ar-bid-form">
                <input
                  type="number" min={minBid} value={bidAmount}
                  onChange={e => { setBidAmount(e.target.value); setBidError('') }}
                  placeholder={`Min $${minBid}`}
                />
                {bidError && <p className="error-msg">{bidError}</p>}
                <button type="submit" className="btn-primary ar-bid-btn" disabled={bidLoading}>
                  {bidLoading ? 'Placingâ¦' : token ? `Bid $${bidAmount || 'â'}` : 'Log in to bid'}
                </button>
              </form>
            )}

            {isEnded && (
              <div className="ar-ended-msg">
                ð Auction ended{auction.leading_bidder ? ` â @${auction.leading_bidder} won with $${auction.current_bid.toLocaleString()}` : ''}
              </div>
            )}
          </div>

          {/* Host / Admin controls */}
          {(isHost || isAdmin) && (
            <div className="card ar-host-panel">
              <h3 className="ar-host-title">Host Controls</h3>
              <div className="ar-host-btns">
                {auction.status === 'upcoming' && (
                  <button className="btn-green" onClick={() => hostAction('start_auction')}>â¶ Start Now</button>
                )}
                {isLive && (
                  <>
                    <button className="btn-ghost" onClick={() => hostAction('extend_auction', { extraSeconds: 300 })}>+5 min</button>
                    <button className="btn-ghost" onClick={() => hostAction('extend_auction', { extraSeconds: 600 })}>+10 min</button>
                    <button className="btn-danger" onClick={() => { if (confirm('End auction now?')) hostAction('end_auction') }}>â  End Auction</button>
                  </>
                )}
              </div>

              {/* Live viewer block panel â only visible to admin/host */}
              {isLive && chatUsers.length > 0 && (
                <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border, #333)', paddingTop: '0.75rem' }}>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Active viewers</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    {chatUsers.map(u => (
                      <div key={u} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.82rem' }}>@{u}</span>
                        <button
                          onClick={() => {
                            // We need the userId for this username â we'll use username as the key
                            // The backend accepts targetUsername for chat flagging; targetUserId for profile block
                            // For simplicity here we pass username and look up on the server
                            blockUser(u, u) // passing username as id placeholder â see note below
                          }}
                          disabled={blockingUser === u || flaggedUsers.has(u)}
                          style={{ fontSize: '0.72rem', padding: '2px 8px', background: flaggedUsers.has(u) ? '#333' : '#2a001a', color: flaggedUsers.has(u) ? '#666' : '#cc44ff', border: '1px solid currentColor', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          {blockingUser === u ? 'â¦' : flaggedUsers.has(u) ? 'Blocked' : 'ð« Block'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
            {chat.map((msg, i) => {
              if (flaggedUsers.has(msg.username)) return null // hide blocked users' messages
              return (
                <div
                  key={msg.id || i}
                  className={`ar-chat-msg ${msg.type === 'bid' || msg.type === 'system' ? 'system' : ''} ${msg.role === 'host' ? 'host' : ''}`}
                >
                  {msg.type === 'msg' && <span className={`ar-chat-name ${msg.role}`}>@{msg.username}</span>}
                  <span className="ar-chat-text">{msg.text}</span>
                </div>
              )
            })}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={sendChat} className="ar-chat-form">
            <input
              type="text"
              placeholder={token ? 'Say somethingâ¦' : 'Log in to chat'}
              value={chatText}
              onChange={e => setChatText(e.target.value)}
              disabled={!token}
              maxLength={200}
            />
            <button type="submit" className="btn-primary ar-chat-send" disabled={!token}>â</button>
          </form>
        </div>
        <ItemQueue
          auctionId={id}
          isHost={isAdmin}
          token={token}
        />
      </div>
    </div>
  )
}
