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

function resizeImageToBlob(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objUrl)
      const MAX = 800
      let { width, height } = img
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX }
        else { width = Math.round(width * MAX / height); height = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error('Image conversion failed'))
        resolve(blob)
      }, file.type || 'image/jpeg', 0.85)
    }
    img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('Failed to load image')) }
    img.src = objUrl
  })
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
  // Auto-stagger state
  const [staggerFirstClose, setStaggerFirstClose] = useState(dateTimeLocal(60))
  const [staggerInterval, setStaggerInterval] = useState(2)
  const [staggerApplying, setStaggerApplying] = useState(false)
  const fileRef = useRef(null)
  const imgInputRef = useRef(null)
  const imageFilesRef = useRef([])
  const [imagePreviews, setImagePreviews] = useState([])
  const [uploadingImage, setUploadingImage] = useState(false)
  const [replacingPhotoFor, setReplacingPhotoFor] = useState(null)
  const pollRef = useRef(null)
  const prevItemsRef = useRef([])
  const [closedToasts, setClosedToasts] = useState([])

  // Multi-image state
  const [itemImages, setItemImages] = useState({})
  const [expandedImages, setExpandedImages] = useState({})
  const [newImageUrl, setNewImageUrl] = useState({})
  const [imageAdding, setImageAdding] = useState({})

  useEffect(() => {
    if (!auctionId) return
    loadItems()
    pollRef.current = setInterval(loadItems, 30000)
    return () => clearInterval(pollRef.current)
  }, [auctionId])

  useEffect(() => {
    if (prevItemsRef.current.length === 0) { prevItemsRef.current = items; return }
    const newlyClosed = items.filter(item => {
      const prev = prevItemsRef.current.find(p => p.id === item.id)
      return prev && prev.status === 'open' && item.status !== 'open'
    })
    if (newlyClosed.length) {
      const toasts = newlyClosed.map(item => ({
        key: `${item.id}-${Date.now()}`,
        title: item.title,
        winner: item.leading_bidder,
        amount: item.current_bid,
      }))
      setClosedToasts(prev => [...prev, ...toasts])
      toasts.forEach(t => setTimeout(() => setClosedToasts(prev => prev.filter(x => x.key !== t.key)), 8000))
    }
    prevItemsRef.current = items
  }, [items])

  async function loadItems() {
    try { setItems(await api.getAuctionItems(auctionId)) } catch {}
  }

  async function loadImagesForItem(itemId) {
    try {
      const imgs = await api.getItemImages(auctionId, itemId)
      setItemImages(prev => ({ ...prev, [itemId]: imgs || [] }))
    } catch {
      setItemImages(prev => ({ ...prev, [itemId]: [] }))
    }
  }

  async function toggleImages(itemId) {
    const isOpen = expandedImages[itemId]
    if (!isOpen && !itemImages[itemId]) {
      await loadImagesForItem(itemId)
    }
    setExpandedImages(prev => ({ ...prev, [itemId]: !isOpen }))
  }

  async function addImage(itemId) {
    const url = (newImageUrl[itemId] || '').trim()
    if (!url) return
    setImageAdding(prev => ({ ...prev, [itemId]: true }))
    try {
      const imgs = itemImages[itemId] || []
      await api.addItemImage(auctionId, itemId, url, imgs.length)
      setNewImageUrl(prev => ({ ...prev, [itemId]: '' }))
      await loadImagesForItem(itemId)
    } catch (e) {
      alert(e.message || 'Failed to add image')
    } finally {
      setImageAdding(prev => ({ ...prev, [itemId]: false }))
    }
  }

  async function deleteImage(imageId, itemId) {
    if (!confirm('Remove this image?')) return
    try {
      await api.deleteItemImage(imageId)
      await loadImagesForItem(itemId)
    } catch (e) {
      alert(e.message || 'Failed to delete image')
    }
  }

  function handleImageSelect(e) {
    const files = Array.from(e.target.files)
    if (!files.length) return
    imageFilesRef.current = files
    const previews = []
    let loaded = 0
    files.forEach((file, idx) => {
      const reader = new FileReader()
      reader.onload = ev => {
        previews[idx] = ev.target.result
        loaded++
        if (loaded === files.length) setImagePreviews([...previews])
      }
      reader.readAsDataURL(file)
    })
  }

  function clearImageSelection(idx) {
    if (idx !== undefined) {
      imageFilesRef.current = imageFilesRef.current.filter((_, i) => i !== idx)
      setImagePreviews(p => p.filter((_, i) => i !== idx))
    } else {
      imageFilesRef.current = []
      setImagePreviews([])
      if (imgInputRef.current) imgInputRef.current.value = ''
    }
  }

  async function handleAddPhoto(itemId, e) {
    const file = e.target.files[0]
    if (!file) return
    setReplacingPhotoFor(itemId)
    setError('')
    try {
      const blob = await resizeImageToBlob(file)
      const result = await api.uploadImage(blob, file.type || 'image/jpeg')
      await api.addItemImage(auctionId, itemId, result.url, null)
      await loadItems()
    } catch (err) { setError(err.message) }
    finally {
      setReplacingPhotoFor(null)
      if (e.target) e.target.value = ''
    }
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!form.title || !form.starting_bid) return setError('Title and starting bid are required')
    if (isStandard && !form.ends_at) return setError('Closing time is required for standard auction items')
    setAdding(true); setError('')
    try {
      let image_url = ''
      const extraFiles = imageFilesRef.current.slice(1)
      if (imageFilesRef.current.length) {
        setUploadingImage(true)
        const primaryFile = imageFilesRef.current[0]
        const blob = await resizeImageToBlob(primaryFile)
        const result = await api.uploadImage(blob, primaryFile.type || 'image/jpeg')
        image_url = result.url
        setUploadingImage(false)
      }
      const payload      const payload = { title: form.title, description: form.description, image_url, starting_bid: parseFloat(form.starting_bid) }
      if (isStandard) payload.ends_at = new Date(form.ends_at).toISOString()
      const newItem = await api.createAuctionItem(auctionId, payload)
      if (newItem?.id && extraFiles.length) {
        for (let xi = 0; xi < extraFiles.length; xi++) {
          try {
            const f = extraFiles[xi]
            const b = await resizeImageToBlob(f)
            const ru = await api.uploadImage(b, f.type || 'image/jpeg')
            await api.addItemImage(auctionId, newItem.id, ru.url, xi + 1)
          } catch (_) {}
        }
      }      setForm({ title: '', description: '', image_url: '', starting_bid: '', ends_at: dateTimeLocal(60) })
      clearImageSelection()
      await loadItems()
    } catch (err) { setError(err.message) }
    finally { setAdding(false); setUploadingImage(false) }
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
  const openCount = items.filter(i => i.status === 'open').length
  const pendingCount = items.filter(i => i.status === 'pending' || i.status === 'open').length
  const activeItem = !isStandard && items.find(i => i.status === 'active')

  return (
    <div className="item-manager">
      {closedToasts.length > 0 && (
        <div className="im-toasts">
          {closedToasts.map(t => (
            <div key={t.key} className="im-toast">
              <span>🔔 <strong>{t.title}</strong> just closed{t.winner ? ` — Won by @${t.winner} for $${parseFloat(t.amount || 0).toFixed(2)}` : ' — No bids'}</span>
              <button className="im-toast-dismiss" onClick={() => setClosedToasts(prev => prev.filter(x => x.key !== t.key))}>×</button>
            </div>
          ))}
        </div>
      )}
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
                <label className="im-btn im-replace-photo" title="Add photo">
                  {replacingPhotoFor === item.id ? '…' : '📷'}
                  <input type="file" accept="image/*" style={{display:'none'}} onChange={e => handleAddPhoto(item.id, e)} disabled={replacingPhotoFor === item.id} />
                </label>
                <button onClick={() => handleDelete(item.id)} className="im-btn im-del">x</button>
              </div>
            )}
            <button
              className={`im-btn im-images-btn${expandedImages[item.id] ? ' active' : ''}`}
              onClick={() => toggleImages(item.id)}
              title="Manage extra images"
            >
              🖼 {itemImages[item.id] ? itemImages[item.id].length : '…'}
            </button>
            <span className={`im-badge im-badge-${item.status}`}>{item.status}</span>

            {expandedImages[item.id] && (
              <div className="im-image-panel">
                <p className="im-image-panel-title">Extra Images (shown in detail modal)</p>
                <div className="im-image-thumbs">
                  {(itemImages[item.id] || []).length === 0 && (
                    <span className="im-image-empty">No extra images yet</span>
                  )}
                  {(itemImages[item.id] || []).map(img => (
                    <div key={img.id} className="im-image-thumb-wrap">
                      <img src={img.url} alt="" className="im-image-thumb" onError={e => { e.target.src = '' }} />
                      <button className="im-image-del" onClick={() => deleteImage(img.id, item.id)} title="Remove">✕</button>
                    </div>
                  ))}
                </div>
                <div className="im-image-add-row">
                  <input
                    type="url"
                    placeholder="Paste image URL…"
                    value={newImageUrl[item.id] || ''}
                    onChange={e => setNewImageUrl(prev => ({ ...prev, [item.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addImage(item.id) } }}
                    className="im-image-url-input"
                  />
                  <button
                    className="im-btn"
                    onClick={() => addImage(item.id)}
                    disabled={imageAdding[item.id] || !(newImageUrl[item.id] || '').trim()}
                  >
                    {imageAdding[item.id] ? '…' : 'Add'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {canEdit && isStandard && items.length > 0 && (
        <div className='im-stagger-panel'>
          <h4 className='im-stagger-title'>⏱ Auto-stagger closing times</h4>
          <div className='im-stagger-row'>
            <label className='im-stagger-label'>
              First lot closes at
              <input type='datetime-local' value={staggerFirstClose} onChange={e => setStaggerFirstClose(e.target.value)} className='im-stagger-input' />
            </label>
            <label className='im-stagger-label'>
              Interval between lots
              <select value={staggerInterval} onChange={e => setStaggerInterval(Number(e.target.value))} className='im-stagger-select'>
                <option value={1}>1 minute</option>
                <option value={2}>2 minutes (recommended)</option>
                <option value={3}>3 minutes</option>
                <option value={5}>5 minutes</option>
                <option value={10}>10 minutes</option>
              </select>
            </label>
            <button type='button' className='btn-primary im-stagger-btn' onClick={applyStagger} disabled={staggerApplying || !staggerFirstClose}>
              {staggerApplying ? 'Applying…' : `Apply to ${openCount} lot${openCount !== 1 ? 's' : ''}`}
            </button>
          </div>
          <p className='im-stagger-hint'>Lot 1 closes at the time above. Each subsequent lot closes {staggerInterval} minute{staggerInterval !== 1 ? 's' : ''} later.</p>
        </div>
      )}

      {error && <p className='error-msg' style={{margin:'0.5rem 0'}}>{error}</p>}


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
          <div className="im-image-upload">
            <label className="im-img-pick-btn">
              {imagePreview ? '🔄 Change photo' : '📷 Add photo (optional)'}
              <input ref={imgInputRef} type="file" accept="image/*" multiple style={{display:'none'}} onChange={handleImageSelect} />
            </label>
            {imagePreviews.length > 0 && (
              <div className="im-img-preview-row">
                {imagePreviews.map((src, idx) => (
                  <div key={idx} className="im-img-preview-wrap">
                    <img src={src} alt={"preview " + (idx+1)} className="im-preview" />
                    <button type="button" className="im-remove-img" onClick={() => clearImageSelection(idx)}>&#x2715;</button>
                  </div>
                ))}
              </div>
            )}          </div>}
          <input placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} />
          <button type="submit" className="btn-primary" disabled={adding || uploadingImage}>{uploadingImage ? 'Uploading photo...' : adding ? 'Adding...' : 'Add Item'}</button>
          <p style={{fontSize:'0.78rem',color:'var(--text-muted)',marginTop:'0.25rem'}}>After adding, use the 🖼 button on each item to attach extra images shown in the detail modal.</p>
        </form>
      )}
    </div>
  )
}
