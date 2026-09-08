import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import './HostDashboard.css'

const EMPTY_FORM = {
  title: '', description: '', image_url: '', category: '', starting_bid: '', starts_at: '', ends_at: '', mode: 'live',
}

function dateTimeLocal(offsetMinutes = 30) {
  const d = new Date(Date.now() + offsetMinutes * 60000)
  return d.toISOString().slice(0, 16)
}

const STANDARD_DEFAULT_OFFSET = 7 * 24 * 60 // 7 days, in minutes

export default function HostDashboard() {
  const username = localStorage.getItem('wtf_username')
  const [form, setForm] = useState({ ...EMPTY_FORM, ends_at: dateTimeLocal(STANDARD_DEFAULT_OFFSET) })
  const [auctions, setAuctions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [imgUploading, setImgUploading] = useState(false)

  async function loadAuctions() {
    try {
      const all = await api.getAuctions()
      setAuctions(all.filter(a => a.host_username === username))
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

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      await api.createAuction({
        title: form.title,
        description: form.description || undefined,
        image_url: form.image_url || undefined,
        category: form.category || undefined,
        starting_bid: parseInt(form.starting_bid),
                starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : undefined,
                ends_at: form.mode === 'standard' && form.ends_at ? new Date(form.ends_at).toISOString() : undefined,
                mode: form.mode,
      })
      setSuccess('Auction created!')
      setForm({ ...EMPTY_FORM, ends_at: dateTimeLocal(STANDARD_DEFAULT_OFFSET) })
      await loadAuctions()
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
      <div className="host-body">
        <div className="card host-form-card">
          <h2 className="host-section-title">Create Auction</h2>
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
      <p style={{fontSize:'0.8rem',opacity:0.7}}>This is the overall bidding window (e.g. 7 days). Each item also gets its own closing time once you add it below in "Items" — keep item closing times within this window.</p>)}
            {error && <p className="error-msg">{error}</p>}
            {success && <p className="success-msg">{success}</p>}
            <button type="submit" className="btn-primary host-submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Auction'}
            </button>
          </form>
        </div>
        <div className="host-auctions">
          <h2 className="host-section-title">My Auctions</h2>
          {sorted.length === 0 && <p className="ar-empty">No auctions yet. Create your first one!</p>}
          <div className="host-auction-list">
            {sorted.map(a => (
              <div key={a.id} className="card host-auction-item">
                <div className="host-auction-top">
                  <span className={`badge badge-${a.status}`}>{a.status}</span>
                  <span className="host-auction-category">{a.category}</span>
                  <span className="badge" style={{background: a.mode === 'standard' ? '#555' : '#7a3', marginLeft:'0.4rem'}}>{a.mode === 'standard' ? 'Standard' : 'Live'}
                  </span>
                </div>
                <div className="host-auction-title">{a.title}</div>
                <div className="host-auction-stats">
                  <span>Current bid: <strong>${a.current_bid.toLocaleString()}</strong></span>
                  {a.leading_bidder && <span>Leader: <strong>@{a.leading_bidder}</strong></span>}
                </div>
                <div style={{display:'flex',gap:'0.5rem',marginTop:'0.5rem'}}>
                  {a.status === 'ended' && <button className="btn-danger" style={{fontSize:'0.75rem',padding:'0.3rem 0.6rem'}} onClick={() => deleteAuction(a.id)}>Delete</button>}
                  <Link to={`/host/auction/${a.id}/lots`}>
                    <button className="btn-ghost host-go-btn">Items</button>
                  </Link>
                  <Link to={`/auction/${a.id}`}>
                    <button className="btn-ghost host-go-btn">
                      {a.mode === 'standard' ? 'View' : (a.status === 'live' ? 'Open Room' : 'View')}
                    </button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
