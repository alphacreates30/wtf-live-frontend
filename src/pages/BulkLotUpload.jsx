import { useState, useRef, useEffect, useCallback } from 'react'
import { api } from '../api'
import './BulkLotUpload.css'

// Bulk lot creation.
//
// Photos never touch the server until the host commits. Grouping is done by
// hand (click the first photo of a lot, click the last, everything between
// selects, Enter to group) because it relies on zero inference - the host
// marks where one lot ends and the next begins. AI only runs afterwards, on
// groups that are already confirmed correct, to write the listing copy.
//
// Nothing is saved until "Create lots" - so don't close the tab mid-batch.

const PHOTO_SOFT_CAP = 800
const THUMB_MAX = 320      // review grid
const ANALYSIS_MAX = 1200  // enough detail to read maker's marks and damage
const UPLOAD_MAX = 1600    // what bidders actually see

const CONDITION_OPTIONS = [
  'New', 'New in Box', 'Like New', 'Excellent', 'Very Good',
  'Good', 'Fair', 'Poor', 'For Parts or Repair',
]

function fileToDataUrl(file, maxEdge, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objUrl)
      let { width, height } = img
      if (width > maxEdge || height > maxEdge) {
        if (width > height) { height = Math.round(height * maxEdge / width); width = maxEdge }
        else { width = Math.round(width * maxEdge / height); height = maxEdge }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error(`Could not read ${file.name}`)) }
    img.src = objUrl
  })
}

function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(',')
  const mime = /:(.*?);/.exec(meta)[1]
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

const newLot = (photoIdxs, condition) => ({
  photoIdxs,
  condition,
  reserve_price: '',
  title: '',
  description: '',
  category: '',
  flaws: [],
  confidence: '',
  estimated_value: '',
  analyzed: false,
  analyzing: false,
  regenerating: false,
  error: '',
  include: true,
})

export default function BulkLotUpload({ auctionId, onDone }) {
  const [photos, setPhotos] = useState([])        // { thumb, name }
  const [ungrouped, setUngrouped] = useState([])  // photo indices, upload order
  const [lots, setLots] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [anchor, setAnchor] = useState(null)
  const [defaultCondition, setDefaultCondition] = useState('Good')
  const [busy, setBusy] = useState('')            // '', 'reading', 'analyzing', 'committing'
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' })
  const [error, setError] = useState('')
  const [doneCount, setDoneCount] = useState(0)
  const filesRef = useRef([])
  const fileInputRef = useRef(null)

  // ---- Load files ----
  async function handleFiles(e) {
    const files = [...(e.target.files || [])]
    if (!files.length) return
    if (files.length > PHOTO_SOFT_CAP) {
      setError(`That's ${files.length} photos. Keep batches at or under ${PHOTO_SOFT_CAP} and split the rest into a second batch.`)
      return
    }
    setError(''); setBusy('reading')
    setProgress({ done: 0, total: files.length, label: 'Reading photos' })
    filesRef.current = files

    const thumbs = []
    for (let i = 0; i < files.length; i++) {
      try {
        thumbs.push({ thumb: await fileToDataUrl(files[i], THUMB_MAX, 0.7), name: files[i].name })
      } catch {
        thumbs.push({ thumb: null, name: files[i].name, failed: true })
      }
      setProgress({ done: i + 1, total: files.length, label: 'Reading photos' })
    }
    setPhotos(thumbs)
    setUngrouped(thumbs.map((_, i) => i))
    setLots([])
    setSelected(new Set())
    setAnchor(null)
    setBusy('')
  }

  // ---- Range selection ----
  // Click the first photo of a lot, then click the last: everything between
  // selects. Clicking the anchor again collapses back to just that photo.
  const toggleSelect = useCallback((idx) => {
    // With an active anchor, this click is the "last photo of the burst":
    // select the whole range between them. Clicking the anchor itself
    // collapses back to a single photo.
    if (selected.size > 0 && anchor != null && ungrouped.includes(anchor)) {
      if (idx === anchor) { setSelected(new Set([idx])); return }
      const a = ungrouped.indexOf(anchor)
      const b = ungrouped.indexOf(idx)
      const [s, e] = a < b ? [a, b] : [b, a]
      const next = new Set()
      for (let i = s; i <= e; i++) next.add(ungrouped[i])
      setSelected(next)
      return
    }
    // Otherwise this click sets a new anchor.
    setAnchor(idx)
    setSelected(new Set([idx]))
  }, [selected, anchor, ungrouped])

  const groupSelected = useCallback(() => {
    if (!selected.size) return
    // Keep upload order so the first photo shot becomes the lot's main image.
    const idxs = ungrouped.filter(i => selected.has(i))
    setLots(prev => [...prev, newLot(idxs, defaultCondition)])
    setUngrouped(prev => prev.filter(i => !selected.has(i)))
    setSelected(new Set())
    setAnchor(null)
  }, [selected, ungrouped, defaultCondition])

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    setAnchor(null)
  }, [])

  // Enter groups, Escape clears. At hundreds of lots per batch, reaching for
  // the mouse after every range selection adds up.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Enter' && e.key !== 'Escape') return
      if (!selected.size) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      e.key === 'Enter' ? groupSelected() : clearSelection()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selected, groupSelected, clearSelection])

  // Each remaining photo becomes its own lot.
  function groupRestIndividually() {
    if (!ungrouped.length) return
    setLots(prev => [...prev, ...ungrouped.map(i => newLot([i], defaultCondition))])
    setUngrouped([])
    setSelected(new Set())
    setAnchor(null)
  }

  function ungroupLot(li) {
    setUngrouped(prev => [...prev, ...lots[li].photoIdxs].sort((a, b) => a - b))
    setLots(prev => prev.filter((_, i) => i !== li))
  }

  function movePhotoOut(li, pi) {
    setLots(prev => {
      const next = prev.map((l, i) => i === li ? { ...l, photoIdxs: l.photoIdxs.filter(p => p !== pi) } : l)
      return next.filter(l => l.photoIdxs.length)
    })
    setUngrouped(prev => [...prev, pi].sort((a, b) => a - b))
  }

  function updateLot(i, patch) {
    setLots(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  }

  // ---- AI analysis, after grouping is confirmed ----
  async function analyzeAll() {
    const targets = lots.map((l, i) => i).filter(i => !lots[i].analyzed)
    if (!targets.length) { setError('Every lot has already been catalogued.'); return }
    setError(''); setBusy('analyzing')
    setProgress({ done: 0, total: targets.length, label: 'AI is cataloguing lots' })

    for (let n = 0; n < targets.length; n++) {
      const i = targets[n]
      await analyzeOne(i, false)
      setProgress({ done: n + 1, total: targets.length, label: 'AI is cataloguing lots' })
    }
    setBusy('')
  }

  async function analyzeOne(i, standalone = true) {
    const lot = lots[i]
    if (!lot) return
    if (standalone) updateLot(i, { analyzing: true, error: '' })
    try {
      const files = lot.photoIdxs.map(p => filesRef.current[p]).filter(Boolean).slice(0, 6)
      const images = []
      for (const f of files) images.push(await fileToDataUrl(f, ANALYSIS_MAX, 0.85))
      const a = await api.analyzeLot(images, lot.condition)
      updateLot(i, {
        title: a.title || '',
        description: a.description || '',
        category: a.category || '',
        flaws: a.visible_flaws || [],
        confidence: a.confidence || '',
        estimated_value: a.estimated_value_usd || '',
        analyzed: true, analyzing: false, error: '',
      })
    } catch (err) {
      updateLot(i, { analyzing: false, analyzed: true, error: err.message })
    }
  }

  async function regenerate(i) {
    const lot = lots[i]
    if (!lot.title?.trim()) { setError('Enter a title first, then regenerate.'); return }
    updateLot(i, { regenerating: true })
    try {
      const r = await api.regenerateDescription(lot.title, lot.condition)
      updateLot(i, {
        description: r.description || lot.description,
        category: r.category || lot.category,
        regenerating: false,
      })
    } catch (err) {
      setError(err.message)
      updateLot(i, { regenerating: false })
    }
  }

  // ---- Commit ----
  async function commit() {
    const keep = lots.filter(l => l.include)
    if (!keep.length) { setError('No lots selected to create.'); return }
    const bad = keep.findIndex(l => !l.title?.trim())
    if (bad !== -1) { setError(`Lot ${bad + 1} needs a title before it can be created.`); return }

    setError(''); setBusy('committing')
    const totalPhotos = keep.reduce((s, l) => s + l.photoIdxs.length, 0)
    setProgress({ done: 0, total: totalPhotos, label: 'Uploading photos' })

    let uploaded = 0
    const payload = []
    try {
      for (const lot of keep) {
        const urls = []
        for (const pi of lot.photoIdxs) {
          const f = filesRef.current[pi]
          if (!f) continue
          const blob = dataUrlToBlob(await fileToDataUrl(f, UPLOAD_MAX, 0.88))
          const { url } = await api.uploadImage(blob, 'image/jpeg')
          urls.push(url)
          setProgress({ done: ++uploaded, total: totalPhotos, label: 'Uploading photos' })
        }
        payload.push({
          title: lot.title.trim(),
          description: lot.description,
          condition: lot.condition,
          reserve_price: lot.reserve_price === '' ? null : Number(lot.reserve_price),
          image_urls: urls,
        })
      }

      setProgress({ done: totalPhotos, total: totalPhotos, label: 'Creating lots' })
      const res = await api.bulkCreateItems(auctionId, payload)
      setDoneCount(res.created_count)
      if (res.failed_count) {
        setError(`${res.failed_count} lot(s) failed: ` + res.failed.map(f => f.error).join('; '))
      }
      // Drop the committed lots; anything excluded stays for a second pass.
      setLots(prev => prev.filter(l => !l.include))
      setBusy('done')
      onDone?.()
    } catch (err) {
      setError(err.message)
      setBusy('')
    }
  }

  function reset() {
    setPhotos([]); setUngrouped([]); setLots([]); setSelected(new Set())
    setAnchor(null); setError(''); setBusy(''); setDoneCount(0)
    filesRef.current = []
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const pct = progress.total ? Math.round(progress.done / progress.total * 100) : 0
  const includedCount = lots.filter(l => l.include).length
  const analyzedCount = lots.filter(l => l.analyzed).length
  const working = busy === 'reading' || busy === 'analyzing' || busy === 'committing'

  return (
    <div className="blu">
      <div className="blu-head">
        <div>
          <h3 className="blu-title">Bulk Lot Upload</h3>
          <p className="blu-sub">
            Upload a batch, group the photos into lots yourself, then let AI write the
            titles and descriptions. Every lot opens at $0.00.
          </p>
        </div>
        {photos.length > 0 && <button className="blu-btn-ghost" onClick={reset}>Start over</button>}
      </div>

      {error && <div className="blu-error" onClick={() => setError('')}>{error}</div>}

      {busy === 'done' && (
        <div className="blu-success">
          ✓ {doneCount} lot{doneCount !== 1 ? 's' : ''} created. They're in the lot list below —
          set closing times before the auction runs.
        </div>
      )}

      {/* ---------- Upload ---------- */}
      {photos.length === 0 && busy !== 'reading' && (
        <label className="blu-drop">
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFiles} hidden />
          <div className="blu-drop-icon">📷</div>
          <div className="blu-drop-main">Choose photos</div>
          <div className="blu-drop-sub">
            Shoot each lot as a burst — the item, its box, any damage — then move to the next.
            Up to {PHOTO_SOFT_CAP} per batch. Nothing is saved until you create the lots.
          </div>
        </label>
      )}

      {/* ---------- Progress ---------- */}
      {working && (
        <div className="blu-progress-card">
          <div className="blu-progress-label">{progress.label}…</div>
          <div className="blu-bar"><div className="blu-bar-fill" style={{ width: `${pct}%` }} /></div>
          <div className="blu-progress-count">{progress.done} of {progress.total}</div>
        </div>
      )}

      {/* ---------- Ungrouped bucket ---------- */}
      {ungrouped.length > 0 && !working && (
        <div className="blu-card">
          <div className="blu-bucket-head">
            <div>
              <strong>{ungrouped.length} ungrouped photo{ungrouped.length !== 1 ? 's' : ''}</strong>
              <span className="blu-bucket-hint">
                Click the first photo of a lot, then click the last — everything between selects.
                Press <b>Enter</b> to group, <b>Esc</b> to clear.
              </span>
            </div>
            <div className="blu-bucket-actions">
              <label className="blu-field-inline">
                <span>Condition</span>
                <select value={defaultCondition} onChange={e => setDefaultCondition(e.target.value)}>
                  {CONDITION_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              {selected.size > 0 && (
                <>
                  <button className="blu-btn" onClick={groupSelected}>
                    Group {selected.size} as one lot
                  </button>
                  <button className="blu-btn-ghost" onClick={clearSelection}>Clear</button>
                </>
              )}
              {selected.size === 0 && (
                <button className="blu-btn-ghost" onClick={groupRestIndividually}>
                  Each photo its own lot
                </button>
              )}
            </div>
          </div>

          <div className="blu-grid">
            {ungrouped.map(idx => (
              <div
                key={idx}
                className={`blu-cell ${selected.has(idx) ? 'sel' : ''} ${anchor === idx ? 'anchor' : ''}`}
                onClick={() => toggleSelect(idx)}
              >
                {photos[idx]?.thumb
                  ? <img src={photos[idx].thumb} alt={photos[idx].name} draggable={false} />
                  : <div className="blu-cell-fail">!</div>}
                <span className="blu-cell-n">{idx + 1}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------- Grouped lots ---------- */}
      {lots.length > 0 && !working && (
        <div className="blu-card">
          <div className="blu-bucket-head">
            <div>
              <strong>{lots.length} lot{lots.length !== 1 ? 's' : ''} grouped</strong>
              <span className="blu-bucket-hint">
                {analyzedCount < lots.length
                  ? 'Catalogue them once the grouping looks right.'
                  : 'Edit anything that needs it. If you fix a title, regenerate the description to match.'}
              </span>
            </div>
            <div className="blu-bucket-actions">
              {analyzedCount < lots.length && (
                <button className="blu-btn" onClick={analyzeAll}>
                  Catalogue {lots.length - analyzedCount} lot{lots.length - analyzedCount !== 1 ? 's' : ''} with AI →
                </button>
              )}
              {analyzedCount > 0 && (
                <button className="blu-btn blu-btn-go" onClick={commit}>
                  Create {includedCount} lot{includedCount !== 1 ? 's' : ''} →
                </button>
              )}
            </div>
          </div>

          <div className="blu-lots">
            {lots.map((lot, i) => (
              <div key={i} className={`blu-lot ${lot.include ? '' : 'excluded'}`}>
                <div className="blu-lot-photos">
                  {lot.photoIdxs.map(pi => (
                    <div key={pi} className="blu-lot-photo">
                      <img src={photos[pi]?.thumb} alt="" />
                      <button
                        className="blu-photo-x"
                        title="Move back to ungrouped"
                        onClick={() => movePhotoOut(i, pi)}
                      >×</button>
                    </div>
                  ))}
                </div>

                <div className="blu-lot-fields">
                  <div className="blu-lot-top">
                    <label className="blu-include">
                      <input
                        type="checkbox"
                        checked={lot.include}
                        onChange={e => updateLot(i, { include: e.target.checked })}
                      />
                      Lot {i + 1}
                    </label>
                    {lot.confidence && <span className={`blu-conf ${lot.confidence}`}>{lot.confidence} confidence</span>}
                    {lot.error && <span className="blu-lot-error">AI failed — fill in by hand</span>}
                    <button className="blu-btn-xs blu-ungroup" onClick={() => ungroupLot(i)}>Ungroup</button>
                  </div>

                  {!lot.analyzed && !lot.analyzing && (
                    <div className="blu-pending">
                      Not catalogued yet.
                      <button className="blu-btn-xs" onClick={() => analyzeOne(i)}>Catalogue this lot</button>
                    </div>
                  )}
                  {lot.analyzing && <div className="blu-pending">Cataloguing…</div>}

                  {(lot.analyzed || lot.title) && (
                    <>
                      <input
                        className="blu-input blu-input-title"
                        placeholder="Lot title"
                        value={lot.title}
                        onChange={e => updateLot(i, { title: e.target.value })}
                      />
                      <div className="blu-desc-wrap">
                        <textarea
                          className="blu-input blu-textarea"
                          placeholder="Description"
                          rows={3}
                          value={lot.description}
                          onChange={e => updateLot(i, { description: e.target.value })}
                        />
                        <button
                          className="blu-btn-xs blu-regen"
                          onClick={() => regenerate(i)}
                          disabled={lot.regenerating}
                          title="Rewrite the description from the title above"
                        >
                          {lot.regenerating ? 'Rewriting…' : '↻ Regenerate from title'}
                        </button>
                      </div>

                      {lot.flaws?.length > 0 && (
                        <div className="blu-flaws"><strong>Flaws spotted:</strong> {lot.flaws.join(' · ')}</div>
                      )}
                    </>
                  )}

                  <div className="blu-lot-row">
                    <label className="blu-field-sm">
                      <span>Condition</span>
                      <select value={lot.condition} onChange={e => updateLot(i, { condition: e.target.value })}>
                        {CONDITION_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                    <label className="blu-field-sm">
                      <span>Reserve (optional)</span>
                      <input
                        type="number" min="0" step="0.01" placeholder="none"
                        value={lot.reserve_price}
                        onChange={e => updateLot(i, { reserve_price: e.target.value })}
                      />
                    </label>
                    {lot.estimated_value && (
                      <div className="blu-est">
                        <span>AI estimate</span>
                        <strong>${lot.estimated_value}</strong>
                      </div>
                    )}
                    <div className="blu-start">Opens at <strong>$0.00</strong></div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {analyzedCount > 0 && (
            <div className="blu-foot">
              <button className="blu-btn blu-btn-go" onClick={commit}>
                Create {includedCount} lot{includedCount !== 1 ? 's' : ''} →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
