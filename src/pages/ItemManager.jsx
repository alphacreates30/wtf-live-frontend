import { useState, useEffect } from 'react'
import { api } from '../api'

export default function ItemManager({ auctionId, auctionStatus }) {
  const [items, setItems] = useState([])
  const [form, setForm] = useState({ title: '', description: '', image_url: '', starting_bid: '' })
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (auctionId) loadItems() }, [auctionId])

  async function loadItems() {
    try { setItems(await api.getAuctionItems(auctionId)) } catch {}
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!form.title || !form.starting_bid) return setError('Title and starting bid are required')
    setAdding(true); setError('')
    try {
      await api.createAuctionItem(auctionId, { ...form, starting_bid: parseFloat(form.starting_bid) })
      setForm({ title: '', description: '', image_url: '', starting_bid: '' })
      await loadItems()
    } catch (err) { setError(err.message) }
    finally { setAdding(false) }
  }

  async function handleDelete(itemId) {
    await api.deleteAuctionItem(auctionId, itemId)
    await loadItems()
  }

  async function moveItem(itemId, direction) {
    const idx = items.findIndex(i => i.id === itemId)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= items.length) return
    const a = items[idx], b = items[swapIdx]
    await Promise.all([
      api.updateAuctionItem(auctionId, a.id, { position: b.position }),
      api.updateAuctionItem(auctionId, b.id, { position: a.position }),
    ])
    await loadItems()
  }

  const canEdit = auctionStatus !== 'ended'

  return (
    <div className="item-manager">
      <h3 className="im-title">Items in this Show</h3>

      {items.length === 0 && <p className="im-empty">No items yet. Add items below.</p>}

      <div className="im-list">
        {items.map((item, idx) => (
          <div key={item.id} className={"im-item " + item.status}>
            <div className="im-pos">{idx + 1}</div>
            {item.image_url && <img src={item.image_url} alt={item.title} className="im-img" />}
            <div className="im-info">
              <div className="im-name">{item.title}</div>
              <div className="im-meta">
                Start: ${parseFloat(item.starting_bid).toFixed(2)}
                {item.pre_bid_count > 0 && <span className="im-prebids"> · {item.pre_bid_count} pre-bid{item.pre_bid_count > 1 ? 's' : ''} · Top: ${parseFloat(item.top_pre_bid).toFixed(2)}</span>}
              </div>
            </div>
            {canEdit && (
              <div className="im-actions">
                <button onClick={() => moveItem(item.id, 'up')} disabled={idx === 0} className="im-btn">↑</button>
                <button onClick={() => moveItem(item.id, 'down')} disabled={idx === items.length - 1} className="im-btn">↓</button>
                <button onClick={() => handleDelete(item.id)} className="im-btn im-del">×</button>
              </div>
            )}
            <div className={"im-status-badge " + item.status}>{item.status}</div>
          </div>
        ))}
      </div>

      {canEdit && (
        <form onSubmit={handleAdd} className="im-form">
          <h4>Add Item</h4>
          {error && <p className="error-msg">{error}</p>}
          <div className="im-row">
            <input placeholder="Item title *" value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} required />
            <input placeholder="Starting bid ($) *" type="number" min="1" step="0.01" value={form.starting_bid} onChange={e => setForm(f => ({...f, starting_bid: e.target.value}))} required />
          </div>
          <input placeholder="Description" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} />
          <input placeholder="Image URL (optional)" value={form.image_url} onChange={e => setForm(f => ({...f, image_url: e.target.value}))} />
          <button type="submit" className="btn-primary" disabled={adding}>{adding ? 'Adding…' : 'Add Item'}</button>
        </form>
      )}
    </div>
  )
}
