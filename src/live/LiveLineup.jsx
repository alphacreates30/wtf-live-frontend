import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { fmtMoney, CLOCK_PRESETS } from './useRoomSocket'

// The host's lineup (swipe up / the Lineup button): the lots still to offer, in order (drag the handle to reorder;
// lot numbers never change), Show now on any of them, and the lots already offered: sold (to whom), and unsold
// (Run again: next or at the end). The show's options (auto-pace, default clock) and End show are here too.
// Drag works with a finger on a phone (pointer events, not HTML drag and drop, which iPhones don't support).
export default function LiveLineup({ auctionId, rehearsal, st, refreshKey, busy, onClose, act, onEnd }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [order, setOrder] = useState(null)        // ids while dragging
  const [drag, setDrag] = useState(null)          // { id, startY, offset }
  const listRef = useRef(null)
  const startY = useRef(0)

  useEffect(() => {
    let cancelled = false
    api.getLineup(auctionId, rehearsal).then(d => { if (!cancelled) { setData(d); setOrder(null) } }).catch(e => !cancelled && setError(e.message))
    return () => { cancelled = true }
  }, [auctionId, rehearsal, refreshKey, st?.stats?.lots_left, st?.shown?.id, st?.open?.id])

  // Swipe down on the handle bar closes the sheet.
  const swipe = useRef(null)

  if (!data) {
    return (
      <div className="lh-sheet-backdrop" onClick={onClose}>
        <div className="lh-sheet card" role="dialog" aria-modal="true" aria-label="Lineup" onClick={e => e.stopPropagation()}><p className="lh-muted">{error || 'Loading the lineup…'}</p></div>
      </div>
    )
  }

  const byId = Object.fromEntries(data.waiting.map(l => [l.id, l]))
  const waiting = (order || data.waiting.map(l => l.id)).map(id => byId[id]).filter(Boolean)
  const locked = id => id === st?.open?.id

  function onPointerDown(e, id) {
    if (busy) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    startY.current = e.clientY
    setOrder(waiting.map(l => l.id))
    setDrag({ id, offset: 0 })
  }
  function onPointerMove(e) {
    if (!drag || !listRef.current) return
    const rows = [...listRef.current.querySelectorAll('[data-lot]')]
    const ids = order.slice()
    const from = ids.indexOf(drag.id)
    let to = from
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect()
      if (e.clientY > r.top + r.height / 2) to = i
    }
    if (e.clientY < rows[0]?.getBoundingClientRect().top + rows[0]?.offsetHeight / 2) to = 0
    if (to !== from) { ids.splice(from, 1); ids.splice(to, 0, drag.id); setOrder(ids) }
  }
  function onPointerUp() {
    if (!drag) return
    const changed = order.join() !== data.waiting.map(l => l.id).join()
    setDrag(null)
    if (changed) act('reorder_lineup', { itemIds: order })
    else setOrder(null)
  }
  // Keyboard reorder: the handle's up/down arrows.
  function move(id, dir) {
    const ids = waiting.map(l => l.id), i = ids.indexOf(id), j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    setOrder(ids)
    act('reorder_lineup', { itemIds: ids })
  }

  return (
    <div className="lh-sheet-backdrop" onClick={onClose}>
      <div className="lh-sheet lh-sheet-tall card" role="dialog" aria-modal="true" aria-labelledby="lh-lineup-h" onClick={e => e.stopPropagation()}>
        <div className="lh-grab" aria-hidden="true"
          onTouchStart={e => { swipe.current = e.touches[0].clientY }}
          onTouchEnd={e => { if (swipe.current !== null && e.changedTouches[0].clientY - swipe.current > 60) onClose(); swipe.current = null }} />
        <div className="lh-sheet-head">
          <h2 id="lh-lineup-h" className="lh-sheet-title">Lineup</h2>
          <button type="button" className="lh-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="lh-options">
          <label className="lh-toggle"><input type="checkbox" checked={!!st.auto_pace} disabled={busy} onChange={e => act('set_show_options', { auto_pace: e.target.checked })} />
            <span>Auto-pace<span className="lh-hint">After a sale, the next lot and its clock start by themselves after 15 s.</span></span></label>
          <label className="lh-select">Default clock
            <select value={st.clock_seconds} disabled={busy} onChange={e => act('set_show_options', { clock_seconds: Number(e.target.value) })}>
              {CLOCK_PRESETS.map(s => <option key={s} value={s}>{s} s</option>)}
            </select>
          </label>
        </div>

        <h3 className="wtf-label lh-group">To offer ({waiting.length})</h3>
        {waiting.length === 0 && <p className="lh-muted">Nothing left to offer.</p>}
        <ol className="lh-lineup" ref={listRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          {waiting.map((l, i) => (
            <li key={l.id} data-lot={l.id} className={`lh-row${drag?.id === l.id ? ' lh-row-drag' : ''}${st.shown?.id === l.id ? ' lh-row-shown' : ''}`}>
              <button type="button" className="lh-handle" aria-label={`Move lot ${l.lot_number}. Arrow keys move it up or down.`} disabled={busy}
                onPointerDown={e => onPointerDown(e, l.id)}
                onKeyDown={e => { if (e.key === 'ArrowUp') { e.preventDefault(); move(l.id, -1) } if (e.key === 'ArrowDown') { e.preventDefault(); move(l.id, 1) } }}>⋮⋮</button>
              {l.thumb_url || l.image_url ? <img className="lh-row-img" src={l.thumb_url || l.image_url} alt="" /> : <span className="lh-row-img lh-card-noimg" aria-hidden="true" />}
              <span className="lh-row-text">
                <span className="tabular">{i === 0 ? 'Next · ' : ''}Lot {l.lot_number}</span> {l.title}
                <span className="lh-muted"> · opens {fmtMoney(Math.max(Number(l.starting_bid) || 0, 1))}{l.clock_seconds ? ` · ${l.clock_seconds} s` : ''}{l.sudden_death ? ' · sudden death' : ''}{l.run_again_of ? ' · again' : ''}</span>
              </span>
              {st.on_air && !st.open && st.shown?.id !== l.id && (
                <button type="button" className="lh-chip" disabled={busy} onClick={() => { act('show_lot', { itemId: l.id }); onClose() }}>Show now</button>
              )}
            </li>
          ))}
        </ol>

        <h3 className="wtf-label lh-group">Offered ({data.done.length})</h3>
        <ul className="lh-lineup">
          {data.done.map(l => (
            <li key={l.id} className="lh-row">
              <span className="lh-row-text">
                <span className="tabular">Lot {l.lot_number}</span> {l.title}
                <span className="lh-muted"> · {l.status === 'open' ? 'selling now' : l.status === 'sold' ? `sold to @${l.winner}, ${fmtMoney(l.amount)}` : 'not sold'}</span>
              </span>
              {l.status === 'unsold' && l.can_run_again && st.on_air && !locked(l.id) && (
                <span className="lh-row-actions">
                  <button type="button" className="lh-chip" disabled={busy} onClick={() => act('run_again', { itemId: l.id, next: true })}>Run again next</button>
                  <button type="button" className="lh-chip" disabled={busy} onClick={() => act('run_again', { itemId: l.id, next: false })}>At the end</button>
                </span>
              )}
            </li>
          ))}
        </ul>

        {st.on_air && <button type="button" className="btn-ghost lh-end" disabled={busy || !!st.open} onClick={onEnd}>{st.open ? 'End show (after this lot)' : 'End show'}</button>}
      </div>
    </div>
  )
}
