import { useState } from 'react'
import { api } from '../api'
import './HostDashboard.css'

function toDateTimeLocal(iso) {
  if (!iso) return ''
  // datetime-local wants local time with no timezone suffix - slice off the Z/offset.
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AuctionDetails({ auction, onSaved }) {
  const [form, setForm] = useState({
    title: auction.title || '',
    description: auction.description || '',
    category: auction.category || '',
    buyers_premium_pct: auction.buyers_premium_pct ?? 15,
    fulfillment_mode: auction.fulfillment_mode || 'shipping',
    pickup_address: auction.pickup_address || '',
    pickup_starts_at: toDateTimeLocal(auction.pickup_starts_at),
    pickup_ends_at: toDateTimeLocal(auction.pickup_ends_at),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    setSuccess('')
  }

  const needsPickup = form.fulfillment_mode === 'pickup' || form.fulfillment_mode === 'both'

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true); setError(''); setSuccess('')
    if (needsPickup && (!form.pickup_address || !form.pickup_starts_at || !form.pickup_ends_at)) {
      setError('Pickup address, start, and end are required for this fulfilment method')
      setSaving(false)
      return
    }
    try {
      const updated = await api.updateAuction(auction.id, {
        title: form.title,
        description: form.description,
        category: form.category,
        buyers_premium_pct: Number(form.buyers_premium_pct),
        fulfillment_mode: form.fulfillment_mode,
        pickup_address: needsPickup ? form.pickup_address : '',
        pickup_starts_at: needsPickup ? new Date(form.pickup_starts_at).toISOString() : '',
        pickup_ends_at: needsPickup ? new Date(form.pickup_ends_at).toISOString() : '',
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
        <label>Fulfilment</label>
        <select name="fulfillment_mode" value={form.fulfillment_mode} onChange={handleChange} required>
          <option value="shipping">Shipping only</option>
          <option value="pickup">Local pickup only</option>
          <option value="both">Both</option>
        </select>
      </div>
      {needsPickup && (
        <>
          <div className="form-group">
            <label>Pickup Address</label>
            <input name="pickup_address" value={form.pickup_address} onChange={handleChange} placeholder="123 Main St, City, ST" required />
          </div>
          <div className="form-group">
            <label>Pickup Window Starts</label>
            <input name="pickup_starts_at" type="datetime-local" value={form.pickup_starts_at} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>Pickup Window Ends</label>
            <input name="pickup_ends_at" type="datetime-local" value={form.pickup_ends_at} onChange={handleChange} required />
          </div>
        </>
      )}
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
