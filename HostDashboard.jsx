import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import './HostDashboard.css'

const EMPTY_FORM = {
  title: '',
  description: '',
  image_url: '',
  category: '',
  starting_bid: '',
  starts_at: '',
  ends_at: '',
}

function dateTimeLocal(offsetMinutes = 30) {
  const d = new Date(Date.now() + offsetMinutes * 60000)
  return d.toISOString().slice(0, 16)
}

export default function HostDashboard() {
  const username = localStorage.getItem('wtf_username')
  const [form, setForm] = useState({ ...EMPTY_FORM, ends_at: dateTimeLocal(30) })
  const [auctions, setAuctions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

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
        starts_at: form.starts_at || undefined,
        ends_at: new Date(form.ends_at).toISOString(),
      })
      setSuccess('Auction created!')
      setForm({ ...EMPTY_FORM, ends_at: dateTimeLocal(30) })
      await loadAuctions()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const statusOrder = { live: 0, upcoming: 1, ended: 2 }
  const sorted = [...auctions].sort((a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3))

  return (
    <div className="page host-page">
      <h1 className="host-title">Host Dashboard</h1>
      <p className="host-sub">Logged in as <strong>@{username}</strong></p>

      <div className="host-body">
        {/* Create form */}
        <div className="card host-form-card">
          <h2 className="host-section-title">Create Auction</h2>
          <form onSubmit={handleSubmit} className="host-form">
            <div className="form-group">
              <label>Title *</label>
              <input name="title" value={form.title} onChange={handleChange} placeholder="1:6 Custom Figure…" required />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea name="description" value={form.description} onChange={handleChange} placeholder="Tell bidders about this item…" rows={3} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Category</label>
                <input name="category" value={form.category} onChange={handleChange} placeholder="Vintage Toys" />
              </div>
              <div className="form-group">
                <label>Starting Bid ($) *</label>
                <input name="starting_bid" type="number" min="1" value={form.starting_bid} onChange={handleChange} placeholder="50" required />
              </div>
            </div>
            <div className="form-group">
              <label>Image URL</label>
              <input name="image_url" value={form.image_url} onChange={handleChange} placeholder="https://…" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Starts at (leave blank = now)</label>
                <input name="starts_at" type="datetime-local" value={form.starts_at} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Ends at *</label>
                <input name="ends_at" type="datetime-local" value={form.ends_at} onChange={handleChange} required />
              </div>
            </div>
            {error && <p className="error-msg">{error}</p>}
            {success && <p className="success-msg">✓ {success}</p>}
            <button type="submit" className="btn-primary host-submit" disabled={loading}>
              {loading ? 'Creating…' : 'Create Auction'}
            </button>
          </form>
        </div>

        {/* My auctions */}
        <div className="host-auctions">
          <h2 className="host-section-title">My Auctions</h2>
          {sorted.length === 0 && <p className="ar-empty">No auctions yet. Create your first one!</p>}
          <div className="host-auction-list">
            {sorted.map(a => (
              <div key={a.id} className="card host-auction-item">
                <div className="host-auction-top">
                  <span className={`badge badge-${a.status}`}>{a.status}</span>
                  <span className="host-auction-category">{a.category}</span>
                </div>
                <div className="host-auction-title">{a.title}</div>
                <div className="host-auction-stats">
                  <span>Current bid: <strong>${a.current_bid.toLocaleString()}</strong></span>
                  {a.leading_bidder && <span>Leader: <strong>@{a.leading_bidder}</strong></span>}
                </div>
                <Link to={`/auction/${a.id}`}>
                  <button className="btn-ghost host-go-btn">
                    {a.status === 'live' ? '🔴 Open Room' : 'View →'}
                  </button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
