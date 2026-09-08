import { useState } from 'react'
import { api } from '../api'
import './HostDashboard.css'

// Pickup fields stay disabled placeholders per the UX brief - those get
// wired up (backend + UI) separately. Buyer's premium is live now.
export default function AuctionDetails({ auction, onSaved }) {
  const [form, setForm] = useState({
    title: auction.title || '',
    description: auction.description || '',
    category: auction.category || '',
    buyers_premium_pct: auction.buyers_premium_pct ?? 15,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    setSuccess('')
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true); setError(''); setSuccess('')
    try {
      const updated = await api.updateAuction(auction.id, {
        title: form.title,
        description: form.description,
        category: form.category,
        buyers_premium_pct: Number(form.buyers_premium_pct),
      })
      setSuccess('Saved!')
      onSaved?.(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="host-form" style={{ maxWidth: '560px' }} onSubmit={handleSave}>
      <div className="form-group">
        <label>Title</label>
        <input name="title" value={form.title} onChange={handleChange} required />
      </div>
      <div className="form-group">
        <label>Description</label>
        <textarea name="description" value={form.description} onChange={handleChange} rows={3} />
      </div>
      <div className="form-group">
        <label>Category</label>
        <input name="category" value={form.category} onChange={handleChange} placeholder="None set" />
      </div>
      <div className="form-group">
        <label>Pickup Location <span className="aw-soon-tag">Coming soon</span></label>
        <input disabled placeholder="Not configured yet" />
      </div>
      <div className="form-group">
        <label>Pickup Instructions <span className="aw-soon-tag">Coming soon</span></label>
        <textarea disabled rows={2} placeholder="Not configured yet" />
      </div>
      <div className="form-group">
        <label>Buyer's Premium (%)</label>
        <input name="buyers_premium_pct" type="number" min="0" max="50" step="0.1" value={form.buyers_premium_pct} onChange={handleChange} required />
      </div>
      {error && <p className="error-msg">{error}</p>}
      {success && <p className="success-msg">{success}</p>}
      <button type="submit" className="btn-primary host-submit" disabled={saving}>
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </form>
  )
}
