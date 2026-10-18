import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useRoomSocket, useServerNow, fmtMoney, fmtDuration, secondsLeft, CLOCK_PRESETS } from './useRoomSocket'
import LiveVideo from './LiveVideo'
import LiveChecklist from './LiveChecklist'
import LiveLineup from './LiveLineup'
import './LiveHost.css'

// The host's screen for a live show (wtf-handoff LIVE_SHOWS_PHASE2_BRIEF.md step 2a; LIVE_HOST_AND_REWARDS.md
// Part 1). Portrait phone first: the stats strip on top, the camera with the lot card over it, ONE big button that
// always does the next step (Show lot N -> Start 30 s -> Sold to @name $X -> Next: lot N+1), small buttons under
// it, the lineup and chat in sheets. Everything it shows comes from the server's show_state; every tap is a host
// socket event the server checks (the state machine refuses steps out of order).
// controller: a second device (?controller=1): the same controls, no camera.
const ACTION_TIMEOUT_MS = 4000
const isTyping = el => !!el?.closest?.('input, textarea, select, [contenteditable="true"]')

export default function LiveHostRoom({ auction, rehearsal, controller = false }) {
  const token = localStorage.getItem('wtf_token')
  const [st, setSt] = useState(null)
  const [viewers, setViewers] = useState(0)
  const [busy, setBusy] = useState(null)              // the action waiting for host_ok / host_error
  const [toast, setToast] = useState(null)            // { text, kind: 'error' | 'info' }
  const [alerts, setAlerts] = useState([])            // declined cards: lot_payment_failed
  const [sheet, setSheet] = useState(null)            // 'lineup' | 'chat' | null
  const [chat, setChat] = useState([])
  const [seenChat, setSeenChat] = useState(0)
  const [lineupTick, setLineupTick] = useState(0)
  const [video, setVideo] = useState({ phase: 'idle', publishing: false, muted: false })
  const [confirmEnd, setConfirmEnd] = useState(false)
  const cam = useRef(null)
  const busyTimer = useRef(null)
  const toastTimer = useRef(null)
  const now = useServerNow(st?.server_now)

  const say = useCallback((text, kind = 'info') => {
    setToast({ text, kind })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), kind === 'error' ? 6000 : 3000)
  }, [])

  const { connected, emit } = useRoomSocket(auction.id, { token, rehearsal }, {
    show_state: s => setSt(s),
    viewer_count: n => setViewers(n),
    host_ok: () => { setBusy(null); clearTimeout(busyTimer.current) },
    host_error: ({ message }) => { setBusy(null); clearTimeout(busyTimer.current); say(message, 'error') },
    item_extended: ({ ends_at, server_now }) => setSt(s => (s?.open ? { ...s, open: { ...s.open, ends_at }, server_now } : s)),
    new_bid: b => setSt(s => (s?.open && s.open.id === b.item_id ? { ...s, open: { ...s.open, current_bid: b.amount, bid_count: b.bid_count, leader: b.username, ends_at: b.ends_at || s.open.ends_at }, server_now: b.server_now || s.server_now } : s)),
    lot_payment_failed: a => setAlerts(list => [...list.filter(x => x.order_id !== a.order_id), a]),
    lot_payment_fixed: a => setAlerts(list => list.filter(x => x.order_id !== a.order_id)),
    rerun_ok: r => { setBusy(null); clearTimeout(busyTimer.current); setAlerts(list => list.filter(x => x.order_id !== r.order_id)); say(`Back in the lineup as lot ${r.lot_number}${r.next ? ', next' : ', at the end'}.`) },
    lineup_changed: () => setLineupTick(t => t + 1),
    chat_history: rows => setChat(rows || []),
    new_chat: m => setChat(list => [...list, m].slice(-200)),
    auction_error: e => say(e.message || 'This show could not be opened.', 'error'),
  })

  function act(action, payload = {}) {
    if (busy) return
    setBusy(action)
    clearTimeout(busyTimer.current)
    busyTimer.current = setTimeout(() => setBusy(null), ACTION_TIMEOUT_MS)
    emit(action, payload)
  }

  // Go live: the camera starts (phone), then the show goes on air.
  async function goLive() {
    if (!controller && cam.current) await cam.current.start()
    act('go_live')
  }

  const onAir = !!st?.on_air
  const open = st?.open || null
  const shown = !open && st?.shown ? st.shown : null
  const nextLot = st?.up_next?.[0] || null
  const left = open ? secondsLeft(open.ends_at, now) : null
  const autostartIn = st?.autostart_at && !open ? secondsLeft(st.autostart_at, now) : null
  const shownSecs = shown ? (shown.clock_seconds ?? st.clock_seconds) : null

  // The one big button: always the next right step.
  let primary = null
  if (onAir) {
    if (open) primary = open.leader
      ? { action: 'sold_now', label: `Sold to @${open.leader}: ${fmtMoney(open.current_bid)}` }
      : { action: 'add_time', label: '+15 s' }
    else if (shown) primary = { action: 'start_clock', label: `Start ${shownSecs} s${shown.sudden_death ? ' · Sudden death' : ''}` }
    else if (nextLot) primary = { action: 'show_lot', label: st.last ? `Next: lot ${nextLot.lot_number}` : `Show lot ${nextLot.lot_number}` }
    else primary = { action: 'end', label: 'End show' }
  }
  function tapPrimary() {
    if (!primary) return
    if (primary.action === 'end') { setConfirmEnd(true); return }
    act(primary.action)
  }

  // A computer keyboard (or a Bluetooth clicker): Space = start the clock, N = next lot, + = add 15 s, P = pass.
  useEffect(() => {
    if (!onAir) return
    const key = e => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target) || document.querySelector('[aria-modal="true"]')) return
      if (e.key === ' ' && shown) { e.preventDefault(); act('start_clock') }
      else if ((e.key === 'n' || e.key === 'N') && !open && nextLot) act('show_lot')
      else if ((e.key === '+' || e.key === '=') && open) act('add_time')
      else if ((e.key === 'p' || e.key === 'P') && (open || shown)) act('pass')
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  const questions = chat.slice(seenChat).filter(m => m.type === 'msg' && /\?\s*$/.test(m.text || '')).length
  const ended = st?.ended

  if (!st) {
    return <div className="lh lh-loading" aria-busy="true"><p>{connected ? 'Loading the show…' : 'Connecting…'}</p></div>
  }

  return (
    <div className={`lh${controller ? ' lh-controller' : ''}`}>
      {/* Top strip */}
      <header className="lh-strip">
        <Link to="/host" className="lh-exit" aria-label="Back to the host dashboard">‹</Link>
        {onAir
          ? <span className="lh-live">{st.rehearsal ? 'Rehearsal' : 'Live'}</span>
          : <span className="lh-state">{ended ? 'Ended' : st.rehearsal ? 'Draft' : 'Scheduled'}</span>}
        {onAir && st.on_air_at && <span className="lh-stat tabular" title="On air for">{fmtDuration(now - Date.parse(st.on_air_at))}</span>}
        <span className="lh-stat tabular" title="Watching">{viewers} watching</span>
        <span className="lh-stat tabular" title="Sold so far">{st.stats.sold_count} sold · {fmtMoney(st.stats.sold_total)}</span>
        <span className="lh-stat tabular" title="Lots left">{st.stats.lots_left} left</span>
      </header>

      {(!connected || video.phase === 'reconnecting') && (
        <div className="lh-banner" role="alert">{!connected ? 'Connection lost. Reconnecting…' : 'Video reconnecting…'}</div>
      )}
      {alerts.map(a => <DeclineAlert key={a.order_id} a={a} onAir={onAir} disabled={!!busy}
        onRerun={next => act('rerun_lot', { orderId: a.order_id, next })} onDismiss={() => setAlerts(list => list.filter(x => x.order_id !== a.order_id))} />)}

      {/* Middle: the camera (phone) with the lot card over it. */}
      <main className="lh-stage">
        {/* The controller (a second device) shows what viewers see, without the sound; the phone films. */}
        <LiveVideo ref={controller ? undefined : cam} auctionId={auction.id} rehearsal={rehearsal} role={controller ? 'controller' : 'host'}
          onAir={onAir} className="lh-video" onStatus={setVideo} />
        {controller && <span className="lh-ctl wtf-label">Controller: what viewers see. The phone films.</span>}

        {!onAir && !ended && (
          <LiveChecklist auction={auction} st={st} controller={controller} onGoLive={goLive} busy={busy === 'go_live'} />
        )}

        {ended && (
          <div className="lh-ended card">
            <h1 className="lh-ended-title">{st.rehearsal ? 'Rehearsal over' : 'The show has ended'}</h1>
            <p>{st.stats.sold_count} lot{st.stats.sold_count === 1 ? '' : 's'} sold, {fmtMoney(st.stats.sold_total)}.</p>
            <div className="lh-ended-actions">
              <Link className="btn-primary" to={`/host/auction/${auction.id}/packing`}>Winners and packing list</Link>
              <Link className="btn-ghost" to="/host">Host dashboard</Link>
            </div>
          </div>
        )}

        {onAir && (open || shown) && (
          <LotCard lot={open || shown} open={!!open} left={left} clockSecs={shownSecs} autostartIn={autostartIn}
            onClock={(seconds, suddenDeath) => emit('set_lot_clock', { itemId: shown.id, ...(seconds !== undefined ? { seconds } : {}), ...(suddenDeath !== undefined ? { suddenDeath } : {}) })} />
        )}
        {onAir && !open && !shown && st.last && (
          <div className="lh-last" role="status">
            {st.last.status === 'sold'
              ? <>Lot {st.last.lot_number} sold to <strong>@{st.last.winner}</strong>: <span className="wtf-price">{fmtMoney(st.last.amount)}</span></>
              : <>Lot {st.last.lot_number} {st.last.passed ? 'passed' : 'had no bids'}{st.last.can_run_again && (
                  <span className="lh-last-actions">
                    <button type="button" className="lh-chip" disabled={!!busy} onClick={() => act('run_again', { itemId: st.last.item_id, next: true })}>Run again next</button>
                    <button type="button" className="lh-chip" disabled={!!busy} onClick={() => act('run_again', { itemId: st.last.item_id, next: false })}>At the end</button>
                  </span>)}</>}
          </div>
        )}
        {onAir && !open && !shown && !nextLot && <p className="lh-done-note">Every lot has been offered.</p>}
      </main>

      {onAir && (
        <footer className="lh-controls">
          {primary && (
            <button type="button" className={`lh-primary${primary.action === 'sold_now' ? ' lh-primary-sold' : ''}`} disabled={!!busy || !connected} onClick={tapPrimary}>
              {busy && busy === primary.action ? '…' : primary.label}
            </button>
          )}
          <div className="lh-small">
            {open && primary?.action !== 'add_time' && <button type="button" className="lh-btn" disabled={!!busy} onClick={() => act('add_time')}>+15 s</button>}
            {(open || shown) && <button type="button" className="lh-btn" disabled={!!busy} onClick={() => act('pass')}>Pass</button>}
            <button type="button" className={`lh-btn${st.on_hold ? ' lh-btn-on' : ''}`} aria-pressed={st.on_hold} disabled={!!busy} onClick={() => act('hold', { on: !st.on_hold })}>{st.on_hold ? 'Held' : 'Hold'}</button>
            {!controller && <button type="button" className="lh-btn" disabled={!video.publishing} onClick={() => cam.current?.flip()}>Flip</button>}
            {!controller && <button type="button" className={`lh-btn${video.muted ? ' lh-btn-on' : ''}`} aria-pressed={video.muted} disabled={!video.publishing} onClick={() => cam.current?.toggleMute()}>{video.muted ? 'Unmute' : 'Mute'}</button>}
            <button type="button" className="lh-btn" onClick={() => { setSheet('chat'); setSeenChat(chat.length) }}>Chat{questions > 0 && <span className="lh-badge" aria-label={`${questions} questions`}>{questions}</span>}</button>
            <button type="button" className="lh-btn" onClick={() => setSheet('lineup')}>Lineup</button>
          </div>
          {!controller && video.phase === 'connected' && !video.publishing && (
            <button type="button" className="lh-link" onClick={() => cam.current?.start()}>Start the camera</button>
          )}
          {video.message && !controller && <p className="lh-note">{video.message}</p>}
        </footer>
      )}

      {sheet === 'lineup' && (
        <LiveLineup auctionId={auction.id} rehearsal={rehearsal} st={st} refreshKey={lineupTick} busy={!!busy}
          onClose={() => setSheet(null)} act={act} onEnd={() => { setSheet(null); setConfirmEnd(true) }} />
      )}
      {sheet === 'chat' && <ChatSheet chat={chat} onClose={() => setSheet(null)} onSend={text => emit('send_chat', { text })} />}
      {confirmEnd && (
        <div className="lh-sheet-backdrop" onClick={() => setConfirmEnd(false)}>
          <div className="lh-dialog card" role="dialog" aria-modal="true" aria-labelledby="lh-end-h" onClick={e => e.stopPropagation()}>
            <h2 id="lh-end-h" className="lh-dialog-title">End the show?</h2>
            <p>{st.stats.lots_left ? `${st.stats.lots_left} lot${st.stats.lots_left === 1 ? ' has' : 's have'} not been offered.` : 'Every lot has been offered.'} Buyers get their summary emails once every payment has gone through.</p>
            <div className="lh-dialog-actions">
              <button type="button" className="btn-ghost" onClick={() => setConfirmEnd(false)}>Keep going</button>
              <button type="button" className="btn-primary" onClick={() => { setConfirmEnd(false); act('end_show') }}>End show</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className={`lh-toast${toast.kind === 'error' ? ' lh-toast-error' : ''}`} role={toast.kind === 'error' ? 'alert' : 'status'}>{toast.text}</div>}
    </div>
  )
}

// The lot on screen: photo, number, title, price, and the clock (or its presets before it starts).
function LotCard({ lot, open, left, clockSecs, autostartIn, onClock }) {
  const urgent = open && left !== null && left <= 5
  return (
    <section className="lh-card" aria-label={`Lot ${lot.lot_number}`}>
      {lot.image_url ? <img className="lh-card-img" src={lot.thumb_url || lot.image_url} alt="" /> : <div className="lh-card-img lh-card-noimg" aria-hidden="true" />}
      <div className="lh-card-body">
        <span className="wtf-label lh-card-num">Lot {lot.lot_number}</span>
        <h2 className="lh-card-title">{lot.title}</h2>
        {open
          ? <p className="lh-card-price"><span className="wtf-price">{fmtMoney(lot.current_bid ?? 0)}</span>{lot.leader ? <> · @{lot.leader}</> : <span className="lh-muted"> · no bids yet</span>}</p>
          : <p className="lh-card-price lh-muted">Opens at {fmtMoney(Math.max(Number(lot.starting_bid) || 0, 1))}{lot.pre_bid_count > 0 ? ` · ${lot.pre_bid_count} pre-bid${lot.pre_bid_count === 1 ? '' : 's'}` : ''}</p>}
        {!open && (
          <div className="lh-presets" role="group" aria-label="Clock for this lot">
            {CLOCK_PRESETS.map(sec => (
              <button key={sec} type="button" className={`lh-chip${clockSecs === sec ? ' lh-chip-on' : ''}`} aria-pressed={clockSecs === sec} onClick={() => onClock(sec)}>{sec} s</button>
            ))}
            <button type="button" className={`lh-chip${lot.sudden_death ? ' lh-chip-on' : ''}`} aria-pressed={!!lot.sudden_death} onClick={() => onClock(undefined, !lot.sudden_death)}>Sudden death</button>
          </div>
        )}
        {!open && autostartIn !== null && <p className="lh-autostart" role="status">Clock starts in {autostartIn} s (Hold to wait)</p>}
      </div>
      {open && (
        <div className={`lh-clock tabular${urgent ? ' urgent' : ''}`} aria-live="off">
          <span className="lh-clock-num">{left}</span><span className="lh-clock-unit">s</span>
          {lot.sudden_death && <span className="lh-clock-sd">Sudden death</span>}
        </div>
      )}
    </section>
  )
}

function DeclineAlert({ a, onAir, disabled, onRerun, onDismiss }) {
  const [choose, setChoose] = useState(false)
  return (
    <div className="lh-alert" role="alert">
      <p><strong>Card declined:</strong> {a.item_title || `Lot ${a.lot_number}`}, @{a.buyer}.</p>
      <div className="lh-alert-actions">
        {onAir && a.can_rerun !== false && (choose
          ? <>
              <button type="button" className="lh-chip lh-chip-on" disabled={disabled} onClick={() => onRerun(true)}>Next</button>
              <button type="button" className="lh-chip lh-chip-on" disabled={disabled} onClick={() => onRerun(false)}>At the end</button>
            </>
          : <button type="button" className="lh-chip lh-chip-on" disabled={disabled} onClick={() => setChoose(true)}>Re-run now</button>)}
        <button type="button" className="lh-chip" onClick={onDismiss}>Wait</button>
      </div>
    </div>
  )
}

function ChatSheet({ chat, onClose, onSend }) {
  const [text, setText] = useState('')
  const [tab, setTab] = useState('all')
  const end = useRef(null)
  const rows = chat.filter(m => m.type === 'msg' && (tab === 'all' || /\?\s*$/.test(m.text || '')))
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [rows.length])
  return (
    <div className="lh-sheet-backdrop" onClick={onClose}>
      <div className="lh-sheet card" role="dialog" aria-modal="true" aria-labelledby="lh-chat-h" onClick={e => e.stopPropagation()}>
        <div className="lh-sheet-head">
          <h2 id="lh-chat-h" className="lh-sheet-title">Chat</h2>
          <div className="lh-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'all'} className={`lh-chip${tab === 'all' ? ' lh-chip-on' : ''}`} onClick={() => setTab('all')}>All</button>
            <button type="button" role="tab" aria-selected={tab === 'q'} className={`lh-chip${tab === 'q' ? ' lh-chip-on' : ''}`} onClick={() => setTab('q')}>Questions</button>
          </div>
          <button type="button" className="lh-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <ul className="lh-chat">
          {rows.length === 0 && <li className="lh-muted">{tab === 'q' ? 'No questions yet.' : 'No messages yet.'}</li>}
          {rows.map((m, i) => <li key={m.id || i}><strong>@{m.username}</strong> {m.text}</li>)}
          <li ref={end} aria-hidden="true" />
        </ul>
        <form className="lh-chat-form" onSubmit={e => { e.preventDefault(); if (text.trim()) { onSend(text.trim()); setText('') } }}>
          <input value={text} onChange={e => setText(e.target.value)} maxLength={200} placeholder="Say something to the room" aria-label="Message" />
          <button type="submit" className="btn-primary">Send</button>
        </form>
      </div>
    </div>
  )
}
