import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import './ItemManager.css'

const CSV_TEMPLATE = 'Title,Starting Bid,Image URL,Description\nExample Item 1,25,https://i.imgur.com/example.jpg,Optional description\nExample Item 2,10,,';

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const title = (cols[0] || '').trim();
    const starting_bid = parseFloat((cols[1] || '1').trim()) || 1;
    const image_url = (cols[2] || '').trim();
    const description = (cols[3] || '').trim();
    if (title) items.push({ title, starting_bid, image_url, description });
  }
  return items;
}

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'wtf_items_template.csv'; a.click();
  URL.revokeObjectURL(url);
}

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

export default function ItemManager({ auctionId, auctionStatus, auctionMode }) {
  const isStandard = auctionMode === 'standard'
  const [items, setItems] = useState([])
  const [form, setForm] = useState({ title: '', description: '', image_url: '', starting_bid: '', ends_at: dateTimeLocal(60) })
  const [adding, setAdding] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [error, setError] = useState('')
  const [endsAtEdits, setEndsAtEdits] = useState({})
  const fileRef = useRef(null)

  useEffect(() => { if (auctionId) loadItems() }, [auctionId])

  async function loadItems() {
    try { setItems(await api.getAuctionItems(auctionId)) } catch {}
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!form.title || !form.starting_bid) return setError('Title and starting bid are required')
    if (isStandard && !form.ends_at) return setError('Closing time is required for standard auction items')
    setAdding(true); setError('')
    try {
      const payload = { title: form.title, description: form.description, image_url: form.image_url, starting_bid: parseFloat(form.starting_bid) }
      if (isStandard) payload.ends_at = new Date(form.ends_at).toISOString()
      await api.createAuctionItem(auctionId, payload)
      setForm({ title: '', description: '', image_url: '', starting_bid: '', ends_at: dateTimeLocal(60) })
      await loadItems()
    } catch (err) { setError(err.message) }
    finally { setAdding(false) }
  }

  async function handleDelete(itemId) {
    if (!confirm('Remove this item?')) return
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

  async function saveEndsAt(itemId) {
    const val = endsAtEdits[itemId]
    if (!val) return
    try {
      await api.updateAuctionItem(auctionId, itemId, { ends_at: new Date(val).toISOString() })
      setEndsAtEdits(prev => { const next = { ...prev }; delete next[itemId]; return next })
      await loadItems()
    } catch (err) { setError(err.message) }
  }

  async function handleCSVUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true); setUploadResult(null); setError('')
    try {
      const text = await file.text()
      const parsed = parseCSV(text)
      if (!parsed.length) { setError('No valid items found in CSV. Check the format.'); setUploading(false); return }
      let success = 0, failed = 0
      for (const item of parsed) {
        try { await api.createAuctionItem(auctionId, item); success++ }
        catch { failed++ }
      }
      setUploadResult({ success, failed })
      await loadItems()
    } catch (err) { setError('Failed to parse CSV: ' + err.message) }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const canEdit = auctionStatus !== 'ended'
  const pendingCount = items.filter(i => i.status === 'pending' || i.status === 'open').length
  const activeItem = !isStandard && items.find(i => i.status === 'active')

  return (
    <div className="item-manager">
      <div className="im-header">
        <div>
          <span className="im-count">{items.length} item{items.length !== 1 ? 's' : ''}</span>
          {pendingCount > 0 && <span className="im-pending"> ({pendingCount} {isStandard ? 'open' : 'pending'})</span>}
          {activeItem && <span className="im-active-badge">NOW: {activeItem.title}</span>}
        </div>
        {canEdit && (
          <div className="im-header-actions">
            <button className="im-btn-sm" onClick={downloadTemplate}>Download CSV Template</button>
            <label className="im-btn-sm im-upload-label">
              {uploading ? 'Uploading...' : 'Upload CSV'}
              <input ref={fileRef} type="file" accept=".csv" onChange={handleCSVUpload} style={{display:'none'}} disabled={uploading} />
            </label>
          </div>
        )}
      </div>

      {uploadResult && (
        <div className="im-upload-result">
          {uploadResult.success} item{uploadResult.success !== 1 ? 's' : ''} added successfully{uploadResult.failed > 0 ? `, ${uploadResult.failed} failed` : ''}!
          <button onClick={() => setUploadResult(null)} className="im-dismiss">x</button>
        </div>
      )}

      <div className="im-list">
        {items.length === 0 && <p className="im-empty">No items yet. Add items below or upload a CSV.</p>}
        {items.map((item, idx) => (
          <div key={item.id} className={`im-item im-${item.status}`}>
            <div className="im-pos">{idx + 1}</div>
            {item.image_url ? (
              <img src={item.image_url} alt={item.title} className="im-img" onError={e => { e.target.style.display='none' }} />
            ) : (
              <div className="im-no-img">No image</div>
            )}
            <div className="im-info">
              <div className="im-name">{item.title}</div>
              {item.description && <div className="im-desc">{item.description}</div>}
              <div className="im-meta">
                Start: ${parseFloat(item.starting_bid).toFixed(2)}
                {!isStandard && item.pre_bid_count > 0 && <span className="im-prebids"> · {item.pre_bid_count} pre-bid{item.pre_bid_count > 1 ? 's' : ''} · Top: ${parseFloat(item.top_pre_bid).toFixed(2)}</span>}
                {isStandard && <span> · Current bid: ${parseFloat(item.current_bid || item.starting_bid).toFixed(2)} · {item.bid_count || 0} bid{item.bid_count === 1 ? '' : 's'}</span>}
              </div>
              {isStandard && (
                <div className="im-meta">
                  Closes: {item.ends_at ? new Date(item.ends_at).toLocaleString() : 'Not set'}
                  {canEdit && item.status === 'open' && (
                    <span style={{marginLeft:'0.5rem'}}>
                      <input
                        type="datetime-local"
                        value={endsAtEdits[item.id] !== undefined ? endsAtEdits[item.id] : toLocalInputValue(item.ends_at)}
                        onChange={e => setEndsAtEdits(prev => ({ ...prev, [item.id]: e.target.value }))}
                        style={{fontSize:'0.75rem'}}
                      />
                      <button type="button" className="im-btn" onClick={() => saveEndsAt(item.id)}>Save</button>
                    </span>
                  )}
                </div>
              )}
            </div>
            {canEdit && (item.status === 'pending' || (isStandard && item.status === 'open')) && (
              <div className="im-actions">
                {!isStandard && <button onClick={() => moveItem(item.id, 'up')} disabled={idx === 0} className="im-btn">^</button>}
                {!isStandard && <button onClick={() => moveItem(item.id, 'down')} disabled={idx === items.length - 1} className="im-btn">v</button>}
                <button onClick={() => handleDelete(item.id)} className="im-btn im-del">x</button>
              </div>
            )}
            <span className={`im-badge im-badge-${item.status}`}>{item.status}</span>
          </div>
        ))}
      </div>

      {canEdit && (
        <form onSubmit={handleAdd} className="im-form">
          <h4>Add Single Item</h4>
          {error && <p className="error-msg">{error}</p>}
          <div className="im-row">
            <input placeholder="Title *" value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} required />
            <input placeholder="Starting bid ($) *" type="number" min="1" step="0.01" value={form.starting_bid} onChange={e => setForm(f => ({...f, starting_bid: e.target.value}))} required />
          </div>
          {isStandard && (
            <div className="im-row">
              <label style={{fontSize:'0.8rem',display:'flex',flexDirection:'column',gap:'0.2rem'}}>
                Closes at *
                <input type="datetime-local" value={form.ends_at} onChange={e => setForm(f => ({...f, ends_at: e.target.value}))} required />
              </label>
            </div>
          )}
          <input placeholder="Image URL (optional)" value={form.image_url} onChange={e => setForm(f => ({...f, image_url: e.target.value}))} />
          {form.image_url && <img src={form.image_url} alt="preview" className="im-preview" onError={e => e.target.style.display='none'} />}
          <input placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} />
          <button type="submit" className="btn-primary" disabled={adding}>{adding ? 'Adding...' : 'Add Item'}</button>
        </form>
      )}
    </div>
  )
}
