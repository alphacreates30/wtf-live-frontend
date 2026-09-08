import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import './HostDashboard.css'

const EMPTY_FORM = {
  title: '', description: '', image_url: '', category: '', starting_bid: '', starts_at: '', ends_at: '', mode: 'live',
}

function dateTimeLocal(offsetMinutes = 30) {
  const d = new Date(Date.now() + offsetMinutes * 60000)
  return d.toISOString().slice(0, 16)
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
          const sold = items.filter(it => it.leading_bidder)
          const gross = sold.reduce((s, it) => s + Number(it.current_bid || 0), 0)
          return [a.id, { count: items.length, soldCount: sold.length, gross }]
        } catch {
          return [a.id, null]
        }
      }))
      setLotStats(Object.fromEntries(entries))
    } catch {}
  }

  useEffect(() => { loadAuctions() }, [])

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function setMode(mode) {
    setForm(prev => ({
      ...prev,
      mode,
      ends_at: mode === 'standard' ? (prev.ends_at || dateTimeLocal(STANDARD_DEFAULT_OFFSET)) : '',
    }))
  }

  function closeCreate() {
    setShowCreate(false)
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const created = await api.createAuction({
        title: form.title,
        description: form.description || undefined,
        image_url: form.image_url || undefined,
        category: form.category || undefined,
        starting_bid: parseInt(form.starting_bid),
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : undefined,
        ends_at: form.mode === 'standard' && form.ends_at ? new Date(form.ends_at).toISOString() : undefined,
        mode: form.mode,
      })
      setShowCreate(false)
      setForm({ ...EMPTY_FORM, ends_at: dateTimeLocal(STANDARD_DEFAULT_OFFSET) })
      navigate(`/host/auction/${created.id}/lots`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function deleteAuction(auctionId) {
    if (!confirm('Delete this auction permanently?')) return;
    try { await api.deleteAuction(auctionId); await loadAuctions(); } catch (err) { alert(err.message); }
  }

  const statusOrder = { live: 0, upcoming: 1, ended: 2 }
  const sorted = [...auctions].sort((a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3))

  return (
    <div className="page host-page">
      <h1 className="host-title">Host Dashboard</h1>
      <p className="host-sub">Logged in as <strong>@{username}</strong></p>

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
                <span className="badge" style={{ background: a.mode === 'standard' ? '#555' : '#7a3', marginLeft: '0.4rem' }}>{a.mode === 'standard' ? 'Standard' : 'Live'}
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
                {hasLots && <span>Current bid: <strong>${a.current_bid.toLocaleString()}</strong></span>}
                {a.leading_bidder && <span>Leader: <strong>@{a.leading_bidder}</strong></span>}
                {a.status === 'ended' && hasLots && (
                  <span>{stats.soldCount} of {stats.count} sold · Gross: <strong>{fmtMoney(stats.gross)}</strong></span>
                )}
              </div>
              <div style={{display:'flex',gap:'0.5rem',marginTop:'0.5rem'}}>
                {a.status === 'ended' && <button className="btn-danger" style={{fontSize:'0.75rem',padding:'0.3rem 0.6rem'}} onClick={() => deleteAuction(a.id)}>Delete</button>}
                <Link to={`/host/auction/${a.id}/lots`}>
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
              <div className="form-group">
                <label>Auction Type</label>
                <div style={{display:'flex',gap:'0.5rem'}}>
                  <button type="button" className={form.mode === 'live' ? 'btn-primary' : 'btn-ghost'} style={{flex:1}} onClick={() => setMode('live')}>Live Auction</button>
                  <button type="button" className={form.mode === 'standard' ? 'btn-primary' : 'btn-ghost'} style={{flex:1}} onClick={() => setMode('standard')}>Standard Auction</button>
                </div>
                <p style={{fontSize:'0.8rem',opacity:0.7,marginTop:'0.4rem'}}>
                  {form.mode === 'standard'
                    ? 'No live video. Upload items and run a timed bidding auction, like Goldin or AuctionNinja, with proxy bidding and a closing time per item.'
                    : 'Host a live video auction and sell items one at a time in real time. No end time — you start it when you go live and end it manually when you\'re done.'}
                </p>
              </div>
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
                    try {
                      const fd = new FormData()
                      fd.append('file', file)
                      const base = import.meta.env.VITE_API_URL
                      const tok = localStorage.getItem('wtf_token')
                      const r = await fetch(base + '/upload-image', { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: fd })
                      const data = await r.json()
                      if (data.url) setForm(prev => ({ ...prev, image_url: data.url }))
                    } catch (e) { console.error('Upload failed', e) }
                    setImgUploading(false)
                  }}
                />
                {imgUploading && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>Uploading…</p>}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>{form.mode === 'standard' ? 'Starts at (leave blank = now)' : 'Starts at (leave blank = go live now)'}</label>
                  <input name="starts_at" type="datetime-local" value={form.starts_at} onChange={handleChange} />
                </div>
                {form.mode === 'standard' && (
                  <div className="form-group">
                    <label>Auction Ends At *</label>
                    <input name="ends_at" type="datetime-local" value={form.ends_at} onChange={handleChange} required />
                  </div>
                )}
              </div>
              {form.mode === 'standard' && (
                <p style={{fontSize:'0.8rem',opacity:0.7}}>This is the overall bidding window (e.g. 7 days). Each item also gets its own closing time once you add it in Manage Lots — keep item closing times within this window.</p>)}
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
