import { useState, useRef, useEffect, useCallback } from 'react'
import { api } from '../api'
import './BulkLotUpload.css'
import { sortFilesByShootingOrder, moveInOrder } from '../photoOrder'

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
      ctx.fillStyle = '#fff'   // not UI: white matte under transparent photos when converting to JPEG
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

// ---- Incoming files (picker and drag-and-drop share this) ----

// Chrome/Edge on Windows can't decode HEIC (the iPhone default), and Windows
// often reports it with an empty MIME type - so match the extension too.
const isHeic = f => /\.(heic|heif)$/i.test(f.name) || /^image\/hei[cf]/i.test(f.type)
// OS clutter that rides along when a whole folder is dropped. Ignored silently
// rather than reported as "skipped", since the host never chose them.
const isJunk = f => f.name.startsWith('.') || /^(thumbs\.db|desktop\.ini)$/i.test(f.name)

// Grouping assumes shooting order (each lot is a burst, range-selected first
// to last). A drop's order is whatever the OS hands over, so every batch is
// sorted by the photo's own date taken (EXIF, read here before the upload
// strips it), then file name (IMG_8101 before IMG_8102), then last-modified -
// see photoOrder.js. Last-modified alone broke for Drive copies, whose file
// times are sync times. The host can still drag photos into any order.

function entryFile(entry) {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

async function entryFiles(entry) {
  if (entry.isFile) return [await entryFile(entry)]
  if (!entry.isDirectory) return []
  const reader = entry.createReader()
  const out = []
  // readEntries hands back at most ~100 per call; keep going until empty.
  for (;;) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject))
    if (!batch.length) break
    for (const child of batch) out.push(...await entryFiles(child))
  }
  return out
}

// Files from a drop, recursing into any folders. Entries must be taken
// synchronously inside the drop event - the DataTransfer is emptied after it.
function droppedFiles(dataTransfer) {
  const items = [...(dataTransfer.items || [])].filter(i => i.kind === 'file')
  const entries = items.map(i => i.webkitGetAsEntry?.())
  if (!entries.length || entries.some(e => !e)) {
    return Promise.resolve({ files: [...(dataTransfer.files || [])], hadFolder: false })
  }
  const hadFolder = entries.some(e => e.isDirectory)
  return Promise.all(entries.map(entryFiles)).then(lists => ({ files: lists.flat(), hadFolder }))
}

const canDecode = file => fileToDataUrl(file, 16).then(() => true, () => false)

const isFileDrag = e => [...(e.dataTransfer?.types || [])].includes('Files')

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
  // Why the host should read this one before creating it (from the server: short description, "appears to be",
  // low confidence). Cleared by "Looks right" or by regenerating into a description that passes.
  needsLook: [],
  analyzed: false,
  analyzing: false,
  regenerating: false,
  error: '',
  include: true,
})

export default function BulkLotUpload({ auctionId, onDone }) {
  const [photos, setPhotos] = useState([])        // { thumb, name }
  const [ungrouped, setUngrouped] = useState([])  // photo indices, in display order
  // Display order of every photo (indices). Starts as shooting order; dragging a photo changes it. Photos returned
  // from a lot go back to their place in it, so a manual reorder survives ungrouping.
  const [order, setOrder] = useState([])
  const byOrder = useCallback(o => { const rank = new Map(o.map((id, i) => [id, i])); return (a, b) => rank.get(a) - rank.get(b) }, [])
  const [lots, setLots] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [anchor, setAnchor] = useState(null)
  const [defaultCondition, setDefaultCondition] = useState('Good')
  const [busy, setBusy] = useState('')            // '', 'reading', 'analyzing', 'committing'
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' })
  const [error, setError] = useState('')
  const [doneCount, setDoneCount] = useState(0)
  const [notice, setNotice] = useState('')        // non-fatal: skipped files, HEIC
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const dropRef = useRef(null)
  const filesRef = useRef([])
  const fileInputRef = useRef(null)
  const containerRef = useRef(null)

  // ---- Load files ----
  // Picker and drop both land here, so filtering, the cap, ordering and the
  // reading progress are identical either way.
  async function handleFiles(incoming, { hadFolder = false } = {}) {
    if (busy && busy !== 'done') return
    const candidates = incoming.filter(f => !isJunk(f))
    const heic = candidates.filter(isHeic)
    let files = candidates.filter(f => !isHeic(f) && f.type.startsWith('image/'))
    const skipped = candidates.length - heic.length - files.length

    // Probe one HEIC rather than let them all become broken thumbnails the AI
    // can't read either. Safari decodes them; Chrome on Windows won't.
    let heicSkipped = 0
    if (heic.length) {
      if (await canDecode(heic[0])) files = files.concat(heic)
      else heicSkipped = heic.length
    }

    const notes = []
    if (skipped) notes.push(`${skipped} file${skipped !== 1 ? 's' : ''} skipped (not photos).`)
    if (heicSkipped) notes.push(`${heicSkipped} photo${heicSkipped !== 1 ? 's are' : ' is'} HEIC, which this browser can't read. On the iPhone set Settings › Camera › Formats to Most Compatible, or export them as JPEG.`)

    if (!files.length) {
      setNotice('')
      if (notes.length) setError(`No photos loaded. ${notes.join(' ')}`)
      else if (hadFolder) setError('That folder has no photos in it.')
      return
    }
    if (files.length > PHOTO_SOFT_CAP) {
      setError(`That's ${files.length} photos. Keep batches at or under ${PHOTO_SOFT_CAP} and split the rest into a second batch.`)
      return
    }
    setError(''); setBusy('reading')
    setProgress({ done: 0, total: files.length, label: 'Sorting by date taken' })
    files = await sortFilesByShootingOrder(files)
    setNotice(notes.join(' '))
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
    setOrder(thumbs.map((_, i) => i))
    setLots([])
    setSelected(new Set())
    setAnchor(null)
    setBusy('')
    fileInputRef.current?.blur()
  }

  // ---- Drag and drop ----
  // dragenter/leave fire for every child the pointer crosses, so count depth
  // instead of toggling, or the highlight flickers.
  function onDragEnter(e) {
    if (!isFileDrag(e)) return
    e.preventDefault()
    dragDepth.current++
    setDragging(true)
  }
  function onDragOver(e) {
    if (!isFileDrag(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
  function onDragLeave(e) {
    if (!isFileDrag(e)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (!dragDepth.current) setDragging(false)
  }
  function onDrop(e) {
    if (!isFileDrag(e)) return
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    droppedFiles(e.dataTransfer)
      .then(({ files, hadFolder }) => handleFiles(files, { hadFolder }))
      .catch(() => setError("Couldn't read what was dropped. Try Choose photos instead."))
  }

  // A file dropped anywhere else on the page makes the browser open it and
  // navigate away, taking every grouped lot with it. Swallow file drags
  // outside the drop zone; text drags (e.g. into a description) pass through.
  useEffect(() => {
    function guard(e) {
      if (!isFileDrag(e)) return
      e.preventDefault()
      if (e.type === 'dragover' && !dropRef.current?.contains(e.target)) e.dataTransfer.dropEffect = 'none'
    }
    window.addEventListener('dragover', guard)
    window.addEventListener('drop', guard)
    return () => {
      window.removeEventListener('dragover', guard)
      window.removeEventListener('drop', guard)
    }
  }, [])

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

  // ---- Reordering (before grouping) ----
  // Drag a photo onto another to put it before or after it. Mouse: press and move. Touch: press and hold, then
  // move (a quick swipe still scrolls). Keyboard: Alt + arrow keys on a focused photo.
  const reorder = useCallback((id, targetId, after) => {
    setOrder(prev => {
      const next = moveInOrder(prev, id, targetId, after)
      setUngrouped(u => [...u].sort(byOrder(next)))
      return next
    })
  }, [byOrder])

  const gridRef = useRef(null)
  const drag = useRef(null)          // { id, pointerId, type, x0, y0, active, timer, target, after }
  const suppressClick = useRef(false)
  const [dragView, setDragView] = useState(null)   // { id, x, y, target, after } while dragging

  function dropTargetAt(x, y) {
    const el = document.elementFromPoint(x, y)?.closest?.('.blu-cell[data-idx]')
    if (!el || !gridRef.current?.contains(el)) return null
    const r = el.getBoundingClientRect()
    return { target: Number(el.dataset.idx), after: x > r.left + r.width / 2 }
  }
  function startDrag(d) {
    d.active = true
    try { gridRef.current?.setPointerCapture?.(d.pointerId) } catch { /* not all browsers */ }
    if (d.type === 'touch') navigator.vibrate?.(15)
    setDragView({ id: d.id, x: d.x, y: d.y, target: null, after: false })
  }
  function onCellPointerDown(e, idx) {
    if (e.button !== undefined && e.button !== 0) return
    const d = { id: idx, pointerId: e.pointerId, type: e.pointerType, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, active: false }
    if (e.pointerType === 'touch') d.timer = setTimeout(() => { if (drag.current === d) startDrag(d) }, 350)
    drag.current = d
  }
  function onGridPointerMove(e) {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    d.x = e.clientX; d.y = e.clientY
    const moved = Math.hypot(e.clientX - d.x0, e.clientY - d.y0)
    if (!d.active) {
      if (d.type === 'touch') { if (moved > 10) { clearTimeout(d.timer); drag.current = null } return }   // a swipe: let it scroll
      if (moved > 6) startDrag(d); else return
    }
    const t = dropTargetAt(e.clientX, e.clientY)
    d.target = t && t.target !== d.id ? t.target : null
    d.after = t ? t.after : false
    setDragView({ id: d.id, x: e.clientX, y: e.clientY, target: d.target, after: d.after })
    // Near the grid's top or bottom edge: scroll it, so a long batch can be crossed in one drag.
    const g = gridRef.current
    if (g) {
      const r = g.getBoundingClientRect()
      if (e.clientY < r.top + 40) g.scrollTop -= 12
      else if (e.clientY > r.bottom - 40) g.scrollTop += 12
    }
  }
  function onGridPointerUp(e) {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    clearTimeout(d.timer)
    drag.current = null
    if (d.active) {
      suppressClick.current = true               // the click that follows a drag is not a selection
      setTimeout(() => { suppressClick.current = false }, 0)
      if (d.target != null) reorder(d.id, d.target, d.after)
      setDragView(null)
    }
  }
  // While a touch drag is on, the page must not scroll under the finger.
  useEffect(() => {
    const g = gridRef.current
    if (!g) return
    const stop = e => { if (drag.current?.active) e.preventDefault() }
    g.addEventListener('touchmove', stop, { passive: false })
    return () => g.removeEventListener('touchmove', stop)
  })
  function onCellKeyDown(e, idx) {
    // Space selects the focused photo. Enter does too, but only when nothing is selected yet: with a selection,
    // Enter must reach the screen's own "Enter groups" (click first, click last, Enter).
    if (e.key === ' ' || (e.key === 'Enter' && !selected.size)) { e.preventDefault(); e.stopPropagation(); toggleSelect(idx); return }
    if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    e.preventDefault()
    const pos = ungrouped.indexOf(idx)
    const other = ungrouped[pos + (e.key === 'ArrowLeft' ? -1 : 1)]
    if (other == null) return
    reorder(idx, other, e.key === 'ArrowRight')
    requestAnimationFrame(() => gridRef.current?.querySelector(`[data-idx="${idx}"]`)?.focus())
  }

  // Enter groups, Escape clears. At hundreds of lots per batch, reaching for
  // the mouse after every range selection adds up. Only suppressed when focus
  // is on a text field inside this component (e.g. a lot's title/description) -
  // focus sitting in an unrelated form elsewhere on the page shouldn't block it.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Enter' && e.key !== 'Escape') return
      if (!selected.size) return
      const active = document.activeElement
      const tag = active?.tagName
      const isTextField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (isTextField && containerRef.current?.contains(active)) return
      e.preventDefault()
      e.key === 'Enter' ? groupSelected() : clearSelection()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selected, groupSelected, clearSelection])

  // Nothing here is saved server-side until "Create lots" succeeds - photos
  // and every AI-catalogued field live only in this tab's memory. Warn
  // before a close/refresh throws away a run that may represent real
  // AI-cataloguing spend (measured ~$0.02/lot) and real time (~200 lots is
  // ~25 min of sequential AI calls). commit() removes committed lots from
  // `lots`, so this stops warning on its own once they're actually saved.
  useEffect(() => {
    function onBeforeUnload(e) {
      if (!lots.some(l => l.analyzed || l.title)) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [lots])

  // Each remaining photo becomes its own lot.
  function groupRestIndividually() {
    if (!ungrouped.length) return
    setLots(prev => [...prev, ...ungrouped.map(i => newLot([i], defaultCondition))])
    setUngrouped([])
    setSelected(new Set())
    setAnchor(null)
  }

  function ungroupLot(li) {
    setUngrouped(prev => [...prev, ...lots[li].photoIdxs].sort(byOrder(order)))
    setLots(prev => prev.filter((_, i) => i !== li))
  }

  function movePhotoOut(li, pi) {
    setLots(prev => {
      const next = prev.map((l, i) => i === li ? { ...l, photoIdxs: l.photoIdxs.filter(p => p !== pi) } : l)
      return next.filter(l => l.photoIdxs.length)
    })
    setUngrouped(prev => [...prev, pi].sort(byOrder(order)))
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

  // "Create" with lots still flagged "Needs a look": the first click shows a warning, the second creates.
  const [confirmUnchecked, setConfirmUnchecked] = useState(false)
  const needsLookCount = lots.filter(l => l.include && l.needsLook?.length).length

  async function analyzeOne(i, standalone = true) {
    const lot = lots[i]
    if (!lot) return
    if (standalone) updateLot(i, { analyzing: true, error: '' })
    try {
      const files = lot.photoIdxs.map(p => filesRef.current[p]).filter(Boolean).slice(0, 6)
      const images = []
      for (const f of files) images.push(await fileToDataUrl(f, ANALYSIS_MAX, 0.85))

      // analyzeLot never throws on a malformed model response - it resolves
      // with parse_failed: true, an empty title, and raw text as the
      // description, so this can't be caught below without checking for it
      // explicitly. One silent retry first: measured 1/20 on a real batch,
      // and it's a one-off wording slip (a stray character breaking JSON),
      // not something a repeat of the identical request usually repeats.
      let a = await api.analyzeLot(images, lot.condition, auctionId)
      if (a.parse_failed) a = await api.analyzeLot(images, lot.condition, auctionId)
      if (a.parse_failed) throw new Error('AI response could not be parsed (tried twice)')

      updateLot(i, {
        title: a.title || '',
        description: a.description || '',
        category: a.category || '',
        flaws: a.visible_flaws || [],
        confidence: a.confidence || '',
        estimated_value: a.estimated_value_usd || '',
        needsLook: Array.isArray(a.needs_look) ? a.needs_look : [],
        analyzed: true, analyzing: false, error: '',
      })
    } catch (err) {
      // Not analyzed: true - a failure (rate limit, network blip, a
      // transient 5xx) must stay retryable, not become a dead end. Leaving
      // analyzed false keeps this lot both in analyzeAll's next pass (no
      // re-paying for lots that already succeeded) and eligible for the
      // per-lot "Catalogue this lot" button.
      updateLot(i, { analyzing: false, analyzed: false, error: err.message })
    }
  }

  async function regenerate(i) {
    const lot = lots[i]
    if (!lot.title?.trim()) { setError('Enter a title first, then regenerate.'); return }
    updateLot(i, { regenerating: true })
    try {
      const r = await api.regenerateDescription(lot.title, lot.condition, auctionId)
      updateLot(i, {
        description: r.description || lot.description,
        category: r.category || lot.category,
        needsLook: Array.isArray(r.needs_look) ? r.needs_look : lot.needsLook,
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
    if (bad !== -1) { setError(`Group ${bad + 1} needs a title before it can be created.`); return }
    // Lots flagged "Needs a look" and not yet checked: ask once, on the page (no browser dialog).
    const unchecked = keep.filter(l => l.needsLook?.length).length
    if (unchecked && !confirmUnchecked) { setConfirmUnchecked(true); return }
    setConfirmUnchecked(false)

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
    setAnchor(null); setError(''); setNotice(''); setBusy(''); setDoneCount(0)
    filesRef.current = []
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const pct = progress.total ? Math.round(progress.done / progress.total * 100) : 0
  const includedCount = lots.filter(l => l.include).length
  const analyzedCount = lots.filter(l => l.analyzed).length
  const working = busy === 'reading' || busy === 'analyzing' || busy === 'committing'

  return (
    <div className="blu" ref={containerRef}>
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
      {notice && <div className="blu-notice" onClick={() => setNotice('')}>{notice}</div>}

      {busy === 'done' && (
        <div className="blu-success">
          ✓ {doneCount} lot{doneCount !== 1 ? 's' : ''} created. They're in the lot list below —
          set closing times before the auction runs.
        </div>
      )}

      {/* ---------- Upload ---------- */}
      {photos.length === 0 && busy !== 'reading' && (
        <label
          ref={dropRef}
          className={`blu-drop${dragging ? ' blu-drop-active' : ''}`}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <input
            ref={fileInputRef} type="file" accept="image/*" multiple hidden
            onChange={e => { handleFiles([...(e.target.files || [])]); e.target.value = '' }}
          />
          <div className="blu-drop-icon">📷</div>
          <div className="blu-drop-main">{dragging ? 'Drop to add' : 'Choose photos'}</div>
          <div className="blu-drop-or">or drag photos (or a folder of them) here</div>
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
                Press <b>Enter</b> to group, <b>Esc</b> to clear. Sorted by date taken; drag a photo to move it
                (on a phone, press and hold, then drag).
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

          <div
            className={`blu-grid${dragView ? ' is-dragging' : ''}`}
            ref={gridRef}
            onPointerMove={onGridPointerMove}
            onPointerUp={onGridPointerUp}
            onPointerCancel={onGridPointerUp}
          >
            {ungrouped.map((idx, pos) => (
              <div
                key={idx}
                data-idx={idx}
                role="button"
                tabIndex={0}
                aria-pressed={selected.has(idx)}
                aria-label={`Photo ${pos + 1}: ${photos[idx]?.name || ''}. Alt and arrow keys move it.`}
                className={[
                  'blu-cell', selected.has(idx) && 'sel', anchor === idx && 'anchor',
                  dragView?.id === idx && 'dragging',
                  dragView?.target === idx && (dragView.after ? 'drop-after' : 'drop-before'),
                ].filter(Boolean).join(' ')}
                onPointerDown={e => onCellPointerDown(e, idx)}
                onClick={() => { if (!suppressClick.current) toggleSelect(idx) }}
                onKeyDown={e => onCellKeyDown(e, idx)}
                onContextMenu={e => { if (drag.current) e.preventDefault() }}
              >
                <div className="blu-cell-img">
                  {photos[idx]?.thumb
                    ? <img src={photos[idx].thumb} alt="" draggable={false} />
                    : <div className="blu-cell-fail">!</div>}
                  <span className="blu-cell-n">{pos + 1}</span>
                </div>
                <span className="blu-cell-name" title={photos[idx]?.name}>{photos[idx]?.name}</span>
              </div>
            ))}
          </div>
          {dragView && photos[dragView.id]?.thumb && (
            <img className="blu-drag-ghost" src={photos[dragView.id].thumb} alt="" style={{ left: dragView.x, top: dragView.y }} />
          )}
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
                  {confirmUnchecked ? `Create anyway (${includedCount}) →` : `Create ${includedCount} lot${includedCount !== 1 ? 's' : ''} →`}
                </button>
              )}
            </div>
          </div>

          {needsLookCount > 0 && (
            <p className={`blu-needs-look-summary${confirmUnchecked ? ' confirm' : ''}`} role="status">
              {needsLookCount} lot{needsLookCount !== 1 ? 's need' : ' needs'} a look before you create {needsLookCount !== 1 ? 'them' : 'it'}.
              {confirmUnchecked ? ' Click "Create anyway" to create them unchecked, or check each and click "Looks right".' : ' Nothing is published until you publish the auction.'}
            </p>
          )}

          {analyzedCount > 0 && (
            <p className="blu-unsaved-warning">
              Nothing here is saved yet - photos and AI catalogue results live only in this
              browser tab. Don't close or refresh until you click "Create lots", or you'll lose
              this batch (and re-run its AI cataloguing cost) and have to start over.
            </p>
          )}

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
                      Group {i + 1}
                    </label>
                    {lot.confidence && <span className={`blu-conf ${lot.confidence}`}>{lot.confidence} confidence</span>}
                    {lot.needsLook?.length > 0 && <span className="blu-needs-look">Needs a look</span>}
                    {lot.error && <span className="blu-lot-error">AI failed — retry below, or fill in by hand</span>}
                    <button className="blu-btn-xs blu-ungroup" onClick={() => ungroupLot(i)}>Ungroup</button>
                  </div>

                  {!lot.analyzed && !lot.analyzing && (
                    <div className="blu-pending">
                      {lot.error ? 'Retry needed.' : 'Not catalogued yet.'}
                      <button className="blu-btn-xs" onClick={() => analyzeOne(i)}>
                        {lot.error ? 'Retry cataloguing' : 'Catalogue this lot'}
                      </button>
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

                      {lot.needsLook?.length > 0 && (
                        <div className="blu-needs-look-box">
                          <span><strong>Check before creating:</strong> {lot.needsLook.join(' · ')}</span>
                          <button className="blu-btn-xs" onClick={() => { updateLot(i, { needsLook: [] }); setConfirmUnchecked(false) }}>Looks right</button>
                        </div>
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
              {confirmUnchecked && needsLookCount > 0 && (
                <span className="blu-needs-look-summary confirm">{needsLookCount} lot{needsLookCount !== 1 ? 's' : ''} still flagged "Needs a look".</span>
              )}
              <button className="blu-btn blu-btn-go" onClick={commit}>
                {confirmUnchecked ? `Create anyway (${includedCount}) →` : `Create ${includedCount} lot${includedCount !== 1 ? 's' : ''} →`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
