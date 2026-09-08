import { useState, useEffect } from 'react'
import { api } from '../api'
import './ItemManager.css'

function dateTimeLocal(offsetMinutes = 60) {
  const d = new Date(Date.now() + offsetMinutes * 60000)
  return d.toISOString().slice(0, 16)
}

function toLocalInputValue(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AuctionSchedule({ auctionId, auctionStatus, auctionMode }) {
  const isStandard = auctionMode === 'standard'
  const canEdit = auctionStatus !== 'ended'
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [endsAtEdits, setEndsAtEdits] = useState({})
  const [staggerFirstClose, setStaggerFirstClose] = useState(dateTimeLocal(60))
  const [staggerInterval, setStaggerInterval] = useState(2)
  const [staggerApplying, setStaggerApplying] = useState(false)

  useEffect(() => { if (auctionId) loadItems() }, [auctionId])

  async function loadItems() {
    try { setItems(await api.getAuctionItems(auctionId)) }
    catch {}
    finally { setLoading(false) }
  }

  async function saveEndsAt(itemId) {
    const val = endsAtEdits[itemId]
    if (!val) return
    try {
      await api.updateAuctionItem(auctionId, itemId, { ends_at: new Date(val).toISOString() })
      setEndsAtEdits(prev => { const next = { ...prev }; delete next[itemId]; return next })
      await loadItems()
    } catch (err) { setError(err.message) }
  }

  async function applyStagger() {
    if (!staggerFirstClose) return
    const openItems = items.filter(i => i.status === 'open')
    if (!openItems.length) return setError('No open items to stagger.')
    if (!confirm(`This will overwrite closing times for all ${openItems.length} open lot(s). Continue?`)) return
    setStaggerApplying(true)
    setError('')
    try {
      const baseTime = new Date(staggerFirstClose).getTime()
      for (let i = 0; i < openItems.length; i++) {
        const endsAt = new Date(baseTime + i * staggerInterval * 60000).toISOString()
        await api.updateAuctionItem(auctionId, openItems[i].id, { ends_at: endsAt })
      }
      await loadItems()
    } catch (err) {
      setError(err.message)
    } finally {
      setStaggerApplying(false)
    }
  }

  if (!isStandard) {
    return <p className="im-empty">Closing times only apply to Standard auctions.</p>
  }
  if (loading) return <p className="im-empty">Loading schedule…</p>
  if (items.length === 0) return <p className="im-empty">No lots yet — add some in the Lots tab first.</p>

  const openCount = items.filter(i => i.status === 'open').length

  return (
    <div>
      {error && <p className="error-msg" style={{ margin: '0.5rem 0' }}>{error}</p>}

      <div className="im-list">
        {items.map((item, idx) => (
          <div key={item.id} className={`im-item im-${item.status}`}>
            <div className="im-pos">{idx + 1}</div>
            <div className="im-info">
              <div className="im-name">{item.title}</div>
              <div className="im-meta">
                Closes: {item.ends_at ? new Date(item.ends_at).toLocaleString() : 'Not set'}
                {canEdit && item.status === 'open' && (
                  <span style={{ marginLeft: '0.5rem' }}>
                    <input
                      type="datetime-local"
                      value={endsAtEdits[item.id] !== undefined ? endsAtEdits[item.id] : toLocalInputValue(item.ends_at)}
                      onChange={e => setEndsAtEdits(prev => ({ ...prev, [item.id]: e.target.value }))}
                      style={{ fontSize: '0.75rem' }}
                    />
                    <button type="button" className="im-btn" onClick={() => saveEndsAt(item.id)}>Save</button>
                  </span>
                )}
              </div>
            </div>
            <span className={`im-badge im-badge-${item.status}`}>{item.status}</span>
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="im-stagger-panel">
          <h4 className="im-stagger-title">⏱ Auto-stagger closing times</h4>
          <div className="im-stagger-row">
            <label className="im-stagger-label">
              First lot closes at
              <input type="datetime-local" value={staggerFirstClose} onChange={e => setStaggerFirstClose(e.target.value)} className="im-stagger-input" />
            </label>
            <label className="im-stagger-label">
              Interval between lots
              <select value={staggerInterval} onChange={e => setStaggerInterval(Number(e.target.value))} className="im-stagger-select">
                <option value={1}>1 minute</option>
                <option value={2}>2 minutes (recommended)</option>
                <option value={3}>3 minutes</option>
                <option value={5}>5 minutes</option>
                <option value={10}>10 minutes</option>
              </select>
            </label>
            <button type="button" className="btn-primary im-stagger-btn" onClick={applyStagger} disabled={staggerApplying || !staggerFirstClose}>
              {staggerApplying ? 'Applying…' : `Apply to ${openCount} lot${openCount !== 1 ? 's' : ''}`}
            </button>
          </div>
          <p className="im-stagger-hint">Lot 1 closes at the time above. Each subsequent lot closes {staggerInterval} minute{staggerInterval !== 1 ? 's' : ''} later.</p>
        </div>
      )}
    </div>
  )
}
