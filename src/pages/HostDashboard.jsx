import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { defaultPickupWindow, toLocalInput, PICKUP_DAYS } from '../pickupWindow'
import { resizeImageToBlob } from '../imageResize'
import AiSpendCard from './AiSpendCard'
import './HostDashboard.css'

const EMPTY_FORM = {
  title: '', description: '', image_url: '', category: '', starting_bid: '', starts_at: '', ends_at: '',
  fulfillment_mode: '', pickup_address: '', pickup_town: '', pickup_starts_at: '', pickup_ends_at: '',
}

// datetime-local wants LOCAL wall-clock time. (This used toISOString(), which is UTC: the default end showed
// 4-5 hours off in Miami and was saved that way.)
function dateTimeLocal(offsetMinutes = 30) {
  return toLocalInput(new Date(Date.now() + offsetMinutes * 60000))
}

function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const fmtMoney = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STANDARD_DEFAULT_OFFSET = 7 * 24 * 60 // 7 days, in minutes

export default function HostDashboard() {
  const username = localStorage.getItem('wtf_username')
  const navigate = useNavigate()
  const [form, setForm] = useState({ ...EMPTY_FORM, ends_at: dateTimeLocal(STANDARD_DEFAULT_OFFSET) })
  const [auctions, setAuctions] = useState([])
  const [lotStats, setLotStats] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [imgUploading, setImgUploading] = useState(false)

  async function loadAuctions() {
    try {
      const all = await api.getAuctions()
      const mine = all.filter(a => a.host_username === username)
      setAuctions(mine)

      // Per-card lot count / sold+gross - fetched alongside the list so the
      // card can hide stale auction-level fields (e.g. current_bid) until a
      // lot actually exists.
      const entries = await Promise.all(mine.map(async a => {
        try {
          const items = await api.getAuctionItems(a.id)
          // Sold means status 'sold'. A lot with a leading bidder that closed
          // below its reserve is 'unsold': it is neither counted nor grossed.
          const sold = items.filter(it => it.status === 'sold')
          const gross = sold.reduce((s, it) => s + Number(it.current_bid || 0), 0)
          const bidCount = items.filter(it => it.leading_bidder).length
          return [a.id, { count: items.length, soldCount: sold.length, bidCount, gross }]
        } catch {
          return [a.id, null]
        }
      }))
      setLotStats(Object.fromEntries(entries))
    } catch {}
  }

  useEffect(() => { loadAuctions() }, [])

  // The soft-close length comes from the server's setting (GET /config), never a number written here.
  const [softClose, setSoftClose] = useState(null)
  useEffect(() => { api.getConfig().then(c => setSoftClose(c.soft_close_minutes ?? null)).catch(() => {}) }, [])

  // The pickup window follows the auction's close (close -> close + 7 days) until the admin edits either date.
  const [pickupEdited, setPickupEdited] = useState(false)
  function handleChange(e) {
    const { name, value } = e.target
    if (name === 'pickup_starts_at' || name === 'pickup_ends_at') setPickupEdited(true)
    setForm(prev => {
      const next = { ...prev, [name]: value }
      const offersPickup = next.fulfillment_mode === 'pickup' || next.fulfillment_mode === 'both'
      if ((name === 'fulfillment_mode' || name === 'ends_at') && offersPickup && !pickupEdited) {
        Object.assign(next, defaultPickupWindow(next.ends_at) || {})
      }
      return next
    })
  }

  function closeCreate() {
    setShowCreate(false)
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.fulfillment_mode) {
      setError('Choose a fulfilment method')
      return
    }
    const needsPickup = form.fulfillment_mode === 'pickup' || form.fulfillment_mode === 'both'
    if (needsPickup && (!form.pickup_address || !form.pickup_town || !form.pickup_starts_at || !form.pickup_ends_at)) {
      setError('Pickup address, start, and end are required for this fulfilment method')
      return
    }
    setLoading(true)
    try {
      const created = await api.createAuction({
        title: form.title,
        description: form.description || undefined,
        image_url: form.image_url || undefined,
        category: form.category || undefined,
        starting_bid: parseInt(form.starting_bid),
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : undefined,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : undefined,
        mode: 'standard',
        fulfillment_mode: form.fulfillment_mode,
      })
      // Pickup details are saved via PATCH, not the create call - POST
      // /auction only takes fulfillment_mode itself.
      if (needsPickup) {
        await api.updateAuction(created.id, {
          pickup_address: form.pickup_address,
          pickup_town: form.pickup_town,
          pickup_starts_at: new Date(form.pickup_starts_at).toISOString(),
          pickup_ends_at: new Date(form.pickup_ends_at).toISOString(),
        })
      }
      setShowCreate(false)
      setForm({ ...EMPTY_FORM, ends_at: dateTimeLocal(STANDARD_DEFAULT_OFFSET) })
      setPickupEdited(false)
      navigate(`/host/auction/${created.id}/lots`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Any status can be deleted. The server refuses an auction that has
  // produced orders, so what a buyer owes can't be lost this way.
  async function deleteAuction(a) {
    const lots = lotStats[a.id]?.count || 0
    const bidLots = lotStats[a.id]?.bidCount || 0  // lots with a leading bidder
    const lines = [`Delete "${a.title}"${lots ? ` and its ${lots} lot${lots !== 1 ? 's' : ''}` : ''} permanently?`]
    if (a.status !== 'ended' && bidLots) lines.push(`${bidLots} lot${bidLots !== 1 ? 's have' : ' has'} bids. Those bids will be deleted too.`)
    lines.push("This can't be undone.")
    if (!confirm(lines.join('\n\n'))) return;
    try { await api.deleteAuction(a.id); await loadAuctions(); } catch (err) { alert(err.message); }
  }

  async function publishAuction(auctionId) {
    try { await api.publishAuction(auctionId); await loadAuctions(); } catch (err) { alert(err.message); }
  }

  const statusOrder = { live: 0, upcoming: 1, ended: 2 }
  const sorted = [...auctions].sort((a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3))

  return (
    <div className="page host-page">
      <h1 className="host-title">Host Dashboard</h1>
      <p className="host-sub">Logged in as <strong>@{username}</strong></p>

      <AiSpendCard />

      <div className="host-header-row">
        <h2 className="host-section-title" style={{ marginBottom: 0 }}>My Auctions</h2>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>+ New Auction</button>
      </div>

      {sorted.length === 0 && <p className="ar-empty">No auctions yet. Create your first one!</p>}
      <div className="host-auction-list">
        {sorted.map(a => {
          const stats = lotStats[a.id]
          const hasLots = !!(stats && stats.count > 0)
          const showResults = a.mode === 'standard' && a.status === 'ended' && hasLots
          return (
            <div key={a.id} className="card host-auction-item">
              <div className="host-auction-top">
                <span className={`badge badge-${a.status}`}>{a.status}</span>
                <span className="host-auction-category">{a.category}</span>
                <span className={`badge host-mode-badge ${a.mode === 'standard' ? 'host-mode-standard' : 'host-mode-live'}`}>{a.mode === 'standard' ? 'Standard' : 'Live'}
                </span>
                {stats && stats.count === 0 && <span className="badge host-warn-badge">⚠ No lots yet</span>}
              </div>
              <div className="host-auction-title">{a.title}</div>
              {(a.starts_at || a.ends_at) && (
                <div className="host-auction-dates">
                  {a.starts_at && <span>Opens {fmtDate(a.starts_at)}</span>}
                  {a.ends_at && <span>Closes {fmtDate(a.ends_at)}</span>}
                </div>
              )}
              <div className="host-auction-stats">
                {stats && stats.count > 0 && <span>{stats.count} lot{stats.count !== 1 ? 's' : ''}</span>}
                {/* Only a running live-mode auction has one auction-level price. A standard
                    auction's current_bid is stale (every lot has its own), and an ended
                    auction shows its sold count and gross below. */}
                {hasLots && a.mode !== 'standard' && a.status !== 'ended' && <span>Current bid: <strong>${a.current_bid.toLocaleString()}</strong></span>}
                {a.leading_bidder && <span>Leader: <strong>@{a.leading_bidder}</strong></span>}
                {a.status === 'ended' && hasLots && (
                  <span>{stats.soldCount} of {stats.count} sold · Gross: <strong>{fmtMoney(stats.gross)}</strong></span>
                )}
              </div>
              <div style={{display:'flex',gap:'0.5rem',marginTop:'0.5rem'}}>
                <button className="btn-danger" style={{fontSize:'0.75rem',padding:'0.3rem 0.6rem'}} onClick={() => deleteAuction(a)}>Delete</button>
                {a.status === 'draft' && (
                  <button
                    className="btn-primary host-go-btn"
                    disabled={!hasLots}
                    title={!hasLots ? 'Add at least one lot before publishing' : undefined}
                    onClick={() => publishAuction(a.id)}
                  >
                    Publish
                  </button>
                )}
                <Link to={`/host/auction/${a.id}/${showResults ? 'results' : 'lots'}`}>
                  <button className="btn-primary host-go-btn">{showResults ? 'View Results' : 'Manage Lots'}</button>
                </Link>
                <Link to={`/auction/${a.id}`}>
                  <button className="btn-ghost host-go-btn">
                    {a.mode === 'standard' ? 'View' : (a.status === 'live' ? 'Open Room' : 'View')}
                  </button>
                </Link>
              </div>
            </div>
          )
        })}
      </div>

      {showCreate && (
        <div className="host-modal-overlay" onClick={closeCreate}>
          <div className="card host-modal" onClick={e => e.stopPropagation()}>
            <div className="host-modal-head">
              <h2 className="host-section-title" style={{ marginBottom: 0 }}>Create Auction</h2>
              <button type="button" className="host-modal-close" onClick={closeCreate}>×</button>
            </div>
            <form onSubmit={handleSubmit} className="host-form">
              <p style={{fontSize:'0.8rem',opacity:0.7}}>
                Timed auction: every lot has its own closing time, bidders set a max and we bid for them, and a late bid
                resets that lot's clock{softClose ? ` to ${softClose} minute${softClose === 1 ? '' : 's'}` : ''}.
              </p>
              <div className="form-group">
                <label>Title *</label>
                <input name="title" value={form.title} onChange={handleChange} placeholder="e.g. 1:6 Custom Figure" required />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea name="description" value={form.description} onChange={handleChange} placeholder="Tell bidders about this item" rows={3} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Category</label>
                  <input name="category" value={form.category} onChange={handleChange} placeholder="Vintage Toys" />
                </div>
                <div className="form-group">
                  <label>Starting Bid ($) *</label>
                  <input name="starting_bid" type="number" min="0" value={form.starting_bid} onChange={handleChange} placeholder="50" required />
                </div>
              </div>
              <div className="form-group">
                <label>Auction Image</label>
                {form.image_url && (
                  <img src={form.image_url} alt="preview" style={{ width: '100%', maxHeight: '120px', objectFit: 'cover', borderRadius: 6, marginBottom: '0.5rem' }} />
                )}
                <input
                  type="file"
                  accept="image/*"
                  disabled={imgUploading}
                  onChange={async e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setImgUploading(true)
                    setError('')
                    // Same path as lot photos: resized on a canvas (no EXIF/GPS) and sent as the raw image the
                    // server expects. This used to post multipart form data, which the server refused (400) and
                    // the page ignored, so a cover photo never actually uploaded.
                    try {
                      const blob = await resizeImageToBlob(file, 1600)
                      const data = await api.uploadImage(blob, blob.type)
                      setForm(prev => ({ ...prev, image_url: data.url }))
                    } catch (err) {
                      setError(`Cover image: ${err.message || 'upload failed'}`)
                    }
                    setImgUploading(false)
                  }}
                />
                {imgUploading && <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0.25rem 0 0' }}>Uploading…</p>}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Starts at (leave blank = now)</label>
                  <input name="starts_at" type="datetime-local" value={form.starts_at} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>Auction Ends At *</label>
                  <input name="ends_at" type="datetime-local" value={form.ends_at} onChange={handleChange} required />
                </div>
              </div>
              <p style={{fontSize:'0.8rem',opacity:0.7}}>This is the overall bidding window (e.g. 7 days). Each item also gets its own closing time once you add it in Manage Lots — keep item closing times within this window.</p>

              <div className="form-group">
                <label>Fulfilment *</label>
                <select name="fulfillment_mode" value={form.fulfillment_mode} onChange={handleChange} required>
                  <option value="" disabled>Choose how buyers get their items…</option>
                  <option value="shipping">Shipping only</option>
                  <option value="pickup">Local pickup only</option>
                  <option value="both">Both</option>
                </select>
              </div>

              {(form.fulfillment_mode === 'pickup' || form.fulfillment_mode === 'both') && (
                <>
                  <div className="form-group">
                    <label>Pickup Address *</label>
                    <input name="pickup_address" value={form.pickup_address} onChange={handleChange} placeholder="123 Main St, City, ST" required />
                  </div>
                  <div className="form-group">
                    <label>Pickup Town * <span className="form-hint">(public; the street goes only to pickup winners)</span></label>
                    <input name="pickup_town" value={form.pickup_town} onChange={handleChange} placeholder="Miami, FL" maxLength={80} required />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Pickup Window Starts *</label>
                      <input name="pickup_starts_at" type="datetime-local" value={form.pickup_starts_at} onChange={handleChange} required />
                    </div>
                    <div className="form-group">
                      <label>Pickup Window Ends *</label>
                      <input name="pickup_ends_at" type="datetime-local" value={form.pickup_ends_at} onChange={handleChange} required />
                      <p className="form-hint">Pre-filled from the auction's close to {PICKUP_DAYS} days after (the Terms of Sale window). You can change it.</p>
                    </div>
                  </div>
                  <p style={{fontSize:'0.8rem',opacity:0.7}}>Pickup must end after the auction closes.</p>
                </>
              )}

              {error && <p className="error-msg">{error}</p>}
              <button type="submit" className="btn-primary host-submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create Auction'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
