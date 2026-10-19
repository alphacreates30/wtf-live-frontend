import { useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { api } from '../api'
import { useRoomSocket, useServerNow, fmtMoney, secondsLeft } from './useRoomSocket'
import LiveVideo from './LiveVideo'
import TermsAcknowledgementModal from '../components/TermsAcknowledgementModal'
import { FollowButton } from '../watch/WatchButtons'
import './LiveViewer.css'

// A live show's room for viewers and buyers (wtf-handoff LIVE_SHOWS_PHASE2_BRIEF.md step 2b; audit §3). Phone first:
// full-height video with the lot card over it (photo, title, current bid, time left), a one-tap Bid at the next valid
// amount (the server's lot rules send it: next_bid; the first bid in a show asks to confirm, as on the lot page), Max
// bid, Up next (3 lots, pre-bid while they wait), Follow, and the chat. Banners: you're winning, outbid, you won (the
// Glint and confetti; none with reduced motion), card declined (the card form in a sheet). The terms open when the
// server asks for them (bid_error code). Logged out: watch; Bid goes to login and back here. Logged in without an
// approved profile (the server's watch_only): watch like a guest, with "Finish your profile to bid" instead of Bid.
// Live shows have no buyer's premium: the bid is the price.
// The card form loads Stripe.js: only when a buyer opens it, never for every viewer.
const CardOnFileStandalone = lazy(() => import('../components/CardOnFile').then(m => ({ default: m.CardOnFileStandalone })))
const BID_TIMEOUT_MS = 6000
const SHIP_LINE = 'Everything you win in this show ships together in one box. Postage is charged once, after packing.'
const CARD_CODES = ['no_card', 'card_not_verified', 'payment_failed']
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function LiveViewerRoom({ auction, rehearsal }) {
  const navigate = useNavigate()
  const location = useLocation()
  const token = localStorage.getItem('wtf_token')
  const username = localStorage.getItem('wtf_username')
  const loginHref = `/login?next=${encodeURIComponent(location.pathname + location.search)}`
  const [st, setSt] = useState(null)
  const [viewers, setViewers] = useState(0)
  const [blocked, setBlocked] = useState(null)        // auction_error: { code, message }
  const [watchOnly, setWatchOnly] = useState(null)    // watch_only: { code: 'no_profile' | 'pending', message }
  const [banner, setBanner] = useState(null)          // { kind: 'winning' | 'outbid' | 'declined' | 'ok' | 'info', text }
  const [won, setWon] = useState(null)                // { lot_number, amount, title }
  const [confirm, setConfirm] = useState(null)        // { amount, kind: 'tap' | 'max' | 'prebid', lot }
  const [maxOpen, setMaxOpen] = useState(null)        // the lot the Max bid sheet is for
  const [cardOpen, setCardOpen] = useState(false)
  const cardDeclined = useRef(false)                  // the last card banner was a declined charge (not a missing card)
  const [profile, setProfile] = useState(null)
  const [termsAuction, setTermsAuction] = useState(null)
  const [termsAccepted, setTermsAccepted] = useState(null)
  const [placing, setPlacing] = useState(false)
  const [chat, setChat] = useState([])
  const [chatOpen, setChatOpen] = useState(false)
  const [hidden, setHidden] = useState(() => new Set())   // usernames whose messages were removed
  const [chatCfg, setChatCfg] = useState({ slow_mode_seconds: 0, pinned: null })
  const [chatErr, setChatErr] = useState(null)        // why the server refused MY message (only I see it)
  const [mod, setMod] = useState(null)                // the host muted / blocked me in this show: { mute, block, message }
  const [confirmed, setConfirmed] = useState(() => { try { return sessionStorage.getItem(`wtf_live_confirmed_${auction.id}`) === '1' } catch { return false } })
  const pending = useRef(null)
  const placingTimer = useRef(null)
  const wasLeading = useRef(false)
  const bannerTimer = useRef(null)
  const now = useServerNow(st?.server_now)

  const say = useCallback((kind, text, ms = 5000) => {
    setBanner({ kind, text })
    clearTimeout(bannerTimer.current)
    if (ms) bannerTimer.current = setTimeout(() => setBanner(null), ms)
  }, [])
  const donePlacing = () => { setPlacing(false); clearTimeout(placingTimer.current) }

  const { connected, emit } = useRoomSocket(auction.id, { token, rehearsal }, {
    show_state: s => {
      setSt(s)
      if (!s.open) wasLeading.current = false
      else if (s.you_lead) wasLeading.current = true
    },
    viewer_count: n => setViewers(n),
    new_bid: b => {
      setSt(s => (s?.open && s.open.id === b.item_id
        ? { ...s, open: { ...s.open, current_bid: b.amount, bid_count: b.bid_count, leader: b.username, next_bid: b.next_bid ?? s.open.next_bid, ends_at: b.ends_at || s.open.ends_at }, you_lead: !!b.you_lead, server_now: b.server_now || s.server_now }
        : s))
      if (b.you_lead) { wasLeading.current = true }
      else if (wasLeading.current) { wasLeading.current = false; say('outbid', `You've been outbid: ${fmtMoney(b.amount)}.`) }
    },
    item_extended: ({ ends_at, server_now }) => setSt(s => (s?.open ? { ...s, open: { ...s.open, ends_at }, server_now } : s)),
    lot_closed: c => {
      wasLeading.current = false
      if (c.you_won) { setWon({ lot_number: c.lot_number, amount: c.amount }); setBanner(null) }
    },
    bid_ok: r => {
      donePlacing()
      if (r.your_status === 'winning') say('winning', r.max_only ? 'Your max is raised. You\'re still winning.' : "You're winning.")
      else say('outbid', "Bid placed, but another bidder's max is higher.")
    },
    bid_error: e => {
      donePlacing()
      if (e.code === 'login_required') { navigate(loginHref); return }
      if (e.code === 'terms_required') { openTerms(pending.current); return }
      if (CARD_CODES.includes(e.code)) { cardDeclined.current = e.code === 'payment_failed'; say('declined', e.message, 0); openCard(); return }
      say('info', e.message || 'Your bid did not go through.')
    },
    payment_failed: p => { cardDeclined.current = true; say('declined', p.message || 'Your card was declined for a lot you won. Update your card to keep bidding.', 0) },
    payment_ok: p => say('ok', p.message || 'Your card went through. You can bid again.'),
    lot_rerun: r => { if (r.you) { cardDeclined.current = true; say('declined', r.message, 0) } },
    chat_history: rows => setChat(rows || []),
    new_chat: m => setChat(list => [...list, m].slice(-100)),
    chat_deleted: ({ id }) => setChat(list => list.filter(m => m.id !== id)),
    chat_settings: c => setChatCfg(c),
    chat_error: e => setChatErr({ ...e, at: Date.now() }),
    you_moderated: m => { setMod(m.mute || m.block ? m : null); if (m.block) say('info', m.message, 0) },
    messages_flagged: ({ username: u }) => setHidden(h => new Set([...h, u])),
    auction_error: e => setBlocked(e),
    watch_only: w => setWatchOnly(w),
    user_blocked: e => setBlocked({ code: 'blocked', message: e.message }),
  })

  useEffect(() => {
    if (!token) { setTermsAccepted(false); return }
    api.getTermsAcceptance(auction.id).then(r => setTermsAccepted(!!r.accepted)).catch(() => setTermsAccepted(false))
  }, [auction.id, token])

  function openTerms(run) {
    pending.current = run
    api.getAuction(auction.id, rehearsal).then(setTermsAuction).catch(e => say('info', e.message))
  }
  async function acceptTerms(choice) {
    await api.acceptTerms(auction.id, choice, rehearsal)
    setTermsAccepted(true); setTermsAuction(null)
    const run = pending.current; pending.current = null
    run?.()
  }
  function openCard() {
    setCardOpen(true)
    api.getMyProfile().then(setProfile).catch(() => setProfile(null))
  }

  // ---- Bidding ----
  function place(amount, lot) {
    setPlacing(true)
    clearTimeout(placingTimer.current)
    placingTimer.current = setTimeout(() => setPlacing(false), BID_TIMEOUT_MS)
    pending.current = () => place(amount, lot)
    emit('place_bid', { itemId: lot.id, max_amount: amount })
  }
  async function prebid(amount, lot) {
    try {
      await api.placePrebid(auction.id, lot.id, amount)
      say('ok', `Pre-bid saved on lot ${lot.lot_number}: up to ${fmtMoney(amount)}. It counts when the lot opens.`)
    } catch (e) {
      if (CARD_CODES.includes(e.code)) { cardDeclined.current = e.code === 'payment_failed'; say('declined', e.message, 0); openCard(); return }
      if (/terms/i.test(e.message)) { openTerms(() => prebid(amount, lot)); return }
      say('info', e.message)
    }
  }
  // Every bid path: logged in, terms, then (the first time in this show) a confirm; after that one tap.
  function startBid(amount, kind, lot) {
    if (!token) { navigate(loginHref); return }
    const go = () => {
      if (kind === 'prebid') return prebid(amount, lot)
      if (!confirmed || kind === 'max') { setConfirm({ amount, kind, lot }); return }
      place(amount, lot)
    }
    if (termsAccepted === false) { openTerms(go); return }
    go()
  }
  function confirmBid() {
    const c = confirm
    setConfirm(null)
    setConfirmed(true)
    try { sessionStorage.setItem(`wtf_live_confirmed_${auction.id}`, '1') } catch { /* private mode */ }
    if (c.kind === 'prebid') prebid(c.amount, c.lot); else place(c.amount, c.lot)
  }

  // A blocked or refused viewer.
  if (blocked) {
    return (
      <div className="page status-screen">
        <span className="status-tag status-tag-pending">{blocked.code === 'blocked' ? 'Removed' : 'Not available'}</span>
        <h2>{blocked.code === 'not_found' ? 'Show not found' : blocked.code === 'login_to_watch' ? 'Log in to watch' : 'You can’t join this show'}</h2>
        <p>{blocked.message}</p>
        {blocked.code === 'login_to_watch' && <Link className="btn-primary" to={loginHref}>Log in</Link>}
        {blocked.code === 'no_profile' && <Link className="btn-primary" to="/profile-setup">Complete your profile</Link>}
      </div>
    )
  }
  // Opened from the Home Screen there is no browser Back button, so even this state has a way out.
  if (!st) return <div className="vr vr-loading" aria-busy="true"><p>{connected ? 'Loading the show…' : 'Connecting…'}</p><Link to="/" className="vr-loading-out">Back to the homepage</Link></div>

  const open = st.open
  const shown = !open && st.shown ? st.shown : null
  const lot = open || shown
  const left = open ? secondsLeft(open.ends_at, now) : null
  const leading = !!open && st.you_lead
  const nextBid = open?.next_bid ?? null
  const showShipLine = !confirmed
  const messages = chat.filter(m => m.type === 'msg' && !hidden.has(m.username))

  return (
    <div className="vr">
      <header className="vr-top">
        <Link to="/" className="vr-back" aria-label="Leave the show">‹</Link>
        <div className="vr-title">
          <span className="vr-name">{st.title}</span>
          <span className="vr-meta">
            {st.on_air ? <span className="vr-live">{st.rehearsal ? 'Rehearsal' : 'Live'}</span> : <span className="vr-state">{st.ended ? 'Ended' : 'Starts soon'}</span>}
            <span className="tabular">{viewers} watching</span>
          </span>
        </div>
        {!st.rehearsal && !st.ended && <FollowButton auctionId={auction.id} upcoming={!st.on_air} className="vr-follow" />}
      </header>

      <main className="vr-stage">
        <LiveVideo auctionId={auction.id} rehearsal={rehearsal} onAir={!!st.on_air && !st.ended} className="vr-video" />
        {!connected && <div className="vr-banner vr-banner-warn" role="alert">Connection lost. Reconnecting…</div>}
        {banner && (
          <div className={`vr-banner vr-banner-${banner.kind}`} role={banner.kind === 'declined' || banner.kind === 'outbid' ? 'alert' : 'status'}>
            {banner.kind === 'outbid' && <img src="/brand/state-outbid.svg" alt="" width="28" height="28" />}
            <span className="vr-banner-text">{banner.text}</span>
            {banner.kind === 'declined' && token && <button type="button" className="vr-banner-btn" onClick={openCard}>Update card</button>}
            <button type="button" className="vr-banner-x" aria-label="Dismiss" onClick={() => setBanner(null)}>×</button>
          </div>
        )}

        {!st.on_air && !st.ended && (
          <section className="vr-panel card" aria-label="Before the show">
            <p className="wtf-label">{st.starts_at ? `Starts ${new Date(st.starts_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Starting soon'}</p>
            <h1 className="vr-panel-title">{st.title}</h1>
            <p className="vr-muted">Each lot sells on a short clock. No buyer's premium: your winning bid is the price. You can pre-bid on any lot now.</p>
            <p className="vr-ship">{SHIP_LINE}</p>
          </section>
        )}
        {st.ended && (
          <section className="vr-panel card" aria-label="The show has ended">
            <h1 className="vr-panel-title">The show has ended</h1>
            <p className="vr-muted">Thanks for watching. If you won, your summary email is on its way.</p>
            {token && <Link className="btn-primary" to="/my-orders">My orders</Link>}
          </section>
        )}

        {st.on_air && chatCfg.pinned && (
          <p className="vr-pinned" role="status"><span className="wtf-label">Pinned</span> <strong>@{chatCfg.pinned.username}</strong> {chatCfg.pinned.text}</p>
        )}
        {st.on_air && messages.length > 0 && (
          <ul className="vr-chat" aria-label="Chat" aria-live="off">
            {messages.slice(-4).map((m, i) => <li key={m.id || i}><strong>@{m.username}</strong>{m.role === 'host' && <span className="vr-host-tag">Host</span>} {m.text}</li>)}
          </ul>
        )}

        {st.on_air && lot && (
          <section className="vr-card" aria-label={`Lot ${lot.lot_number}`}>
            {lot.image_url ? <img className="vr-card-img" src={lot.image_url} alt="" /> : <span className="vr-card-img" aria-hidden="true" />}
            <div className="vr-card-body">
              <span className="wtf-label vr-card-num">Lot {lot.lot_number}</span>
              <h2 className="vr-card-title">{lot.title}</h2>
              {open
                ? <p className="vr-card-price"><span className="wtf-price">{fmtMoney(open.current_bid ?? 0)}</span>{open.leader ? <span className="vr-muted"> · @{open.leader}</span> : <span className="vr-muted"> · no bids yet</span>}</p>
                : <p className="vr-card-price vr-muted">Up now. Bidding opens in a moment.</p>}
            </div>
            {open && (
              <div className={`vr-clock tabular${left !== null && left <= 5 ? ' urgent' : ''}`}>
                <span className="vr-clock-num">{left}</span><span className="vr-clock-unit">s</span>
              </div>
            )}
          </section>
        )}
        {st.on_air && !lot && st.last && (
          <p className="vr-last" role="status">{st.last.status === 'sold' ? <>Lot {st.last.lot_number} sold to <strong>@{st.last.winner}</strong>: {fmtMoney(st.last.amount)}</> : <>Lot {st.last.lot_number} didn't sell</>}. Next lot coming up.</p>
        )}
      </main>

      <footer className="vr-bottom">
        {open && (
          <>
            {showShipLine && <p className="vr-ship">{SHIP_LINE}</p>}
            {watchOnly ? (
              <div className="vr-bidrow vr-watch-only">
                <Link className="btn-bid vr-bid vr-finish" to="/profile-setup">Finish your profile to bid</Link>
                {watchOnly.code === 'pending' && <p className="vr-muted vr-small">{watchOnly.message}</p>}
              </div>
            ) : (
            <div className="vr-bidrow">
              {mod?.block
                ? <p className="vr-muted vr-blocked-note" role="status">{mod.message}</p>
                : leading
                ? <span className="vr-winning" role="status">You're winning</span>
                : <button type="button" className="btn-bid vr-bid" disabled={placing || left === 0 || nextBid == null} onClick={() => startBid(nextBid, 'tap', open)}>
                    {placing ? 'Bidding…' : token ? `Bid ${fmtMoney(nextBid)}` : 'Log in to bid'}
                  </button>}
              {!mod?.block && <button type="button" className="btn-ghost vr-max" disabled={placing || left === 0} onClick={() => (token ? setMaxOpen(open) : navigate(loginHref))}>{leading ? 'Raise max' : 'Max bid'}</button>}
            </div>
            )}
          </>
        )}
        {st.up_next.length > 0 && !st.ended && (
          <div className="vr-next">
            <h3 className="wtf-label">Up next</h3>
            <ul className="vr-next-list">
              {st.up_next.map(l => (
                <li key={l.id} className="vr-next-item">
                  {l.image_url ? <img src={l.image_url} alt="" className="vr-next-img" /> : <span className="vr-next-img" aria-hidden="true" />}
                  <span className="vr-next-text"><span className="tabular">Lot {l.lot_number}</span> {l.title}</span>
                  <button type="button" className="vr-chip" onClick={() => (!token ? navigate(loginHref) : watchOnly ? navigate('/profile-setup') : setMaxOpen({ ...l, prebid: true }))}>Pre-bid</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {st.on_air && (
          <div className="vr-tools">
            <button type="button" className="vr-chip" onClick={() => (!token ? navigate(loginHref) : watchOnly ? navigate('/profile-setup') : setChatOpen(true))}>{!token ? 'Log in to chat' : watchOnly ? 'Finish your profile to chat' : 'Chat'}</button>
          </div>
        )}
      </footer>

      {confirm && <ConfirmSheet c={confirm} onCancel={() => setConfirm(null)} onConfirm={confirmBid} />}
      {maxOpen && (
        <MaxSheet lot={maxOpen} prebid={!!maxOpen.prebid} leading={leading && !maxOpen.prebid}
          min={maxOpen.prebid ? Math.max(Number(maxOpen.starting_bid) || 0, 1) : leading ? Number(open?.current_bid || 0) : nextBid}
          onCancel={() => setMaxOpen(null)}
          onConfirm={amount => { const l = maxOpen; setMaxOpen(null); startBid(amount, l.prebid ? 'prebid' : 'max', l) }} />
      )}
      {chatOpen && <ChatSheet messages={messages} cfg={chatCfg} mod={mod} error={chatErr} onClose={() => setChatOpen(false)} onSend={text => { setChatErr(null); emit('send_chat', { text }) }} />}
      {cardOpen && (
        <div className="vr-sheet-backdrop" onClick={() => setCardOpen(false)}>
          <div className="vr-sheet card" role="dialog" aria-modal="true" aria-label="Update your card" onClick={e => e.stopPropagation()}>
            <Suspense fallback={<p className="vr-muted">Loading the card form…</p>}>
              <CardOnFileStandalone profile={profile} startOpen declined={cardDeclined.current} onCancel={() => setCardOpen(false)}
                onSaved={ok => { if (ok) { setCardOpen(false); say('ok', 'Card saved and verified.') } }} />
            </Suspense>
          </div>
        </div>
      )}
      {termsAuction && <TermsAcknowledgementModal auction={termsAuction} onCancel={() => { setTermsAuction(null); pending.current = null }} onAccept={acceptTerms} />}
      {won && <WonOverlay won={won} onClose={() => setWon(null)} />}
    </div>
  )
}

// The first bid in a show (and every max bid) is confirmed: the amount, that there is no buyer's premium, that it's binding.
function ConfirmSheet({ c, onCancel, onConfirm }) {
  const ok = useRef(null)
  useEffect(() => { ok.current?.focus() }, [])
  const title = c.kind === 'tap' ? `Bid ${fmtMoney(c.amount)}?` : c.kind === 'prebid' ? `Pre-bid up to ${fmtMoney(c.amount)}?` : `Set a max bid of ${fmtMoney(c.amount)}?`
  return (
    <div className="vr-sheet-backdrop" onClick={onCancel} onKeyDown={e => e.key === 'Escape' && onCancel()}>
      <div className="vr-sheet card" role="dialog" aria-modal="true" aria-labelledby="vr-confirm-h" onClick={e => e.stopPropagation()}>
        <h2 id="vr-confirm-h" className="vr-sheet-title">{title}</h2>
        <p className="vr-muted">Lot {c.lot.lot_number}: {c.lot.title}</p>
        <p>If you win, you pay <strong className="wtf-price">{c.kind === 'tap' ? fmtMoney(c.amount) : `up to ${fmtMoney(c.amount)}`}</strong>. No buyer's premium in live shows; postage is added once per show.</p>
        {c.kind !== 'tap' && <p className="vr-muted vr-small">We bid for you, only as high as needed.</p>}
        <p className="vr-muted vr-small">Bids are binding and can't be taken back. After this one, Bid places your bid with one tap.</p>
        <div className="vr-sheet-actions">
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="button" ref={ok} className="btn-bid" onClick={onConfirm}>Confirm bid</button>
        </div>
      </div>
    </div>
  )
}

function MaxSheet({ lot, prebid, leading, min, onCancel, onConfirm }) {
  const [v, setV] = useState('')
  const [err, setErr] = useState('')
  const input = useRef(null)
  useEffect(() => { input.current?.focus() }, [])
  function submit(e) {
    e.preventDefault()
    const n = Math.round(Number(v) * 100) / 100
    if (!Number.isFinite(n) || n <= 0) { setErr('Enter an amount in dollars.'); return }
    if (min != null && n < min) { setErr(`At least ${fmtMoney(min)}.`); return }
    onConfirm(n)
  }
  return (
    <div className="vr-sheet-backdrop" onClick={onCancel}>
      <form className="vr-sheet card" role="dialog" aria-modal="true" aria-labelledby="vr-max-h" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <h2 id="vr-max-h" className="vr-sheet-title">{prebid ? `Pre-bid on lot ${lot.lot_number}` : leading ? 'Raise your max' : 'Your max bid'}</h2>
        <p className="vr-muted">{lot.title}</p>
        <label className="vr-label" htmlFor="vr-max-input">The most you'll pay{min != null ? ` (at least ${fmtMoney(min)})` : ''}</label>
        <input id="vr-max-input" ref={input} type="number" inputMode="decimal" min={min ?? 1} step="0.01" value={v} onChange={e => { setV(e.target.value); setErr('') }} />
        {err && <p className="error-msg" role="alert">{err}</p>}
        <p className="vr-muted vr-small">{prebid ? 'It counts when the lot opens; we bid for you, only as high as needed.' : 'We bid for you, only as high as needed. Only you see your max.'}</p>
        <div className="vr-sheet-actions">
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-bid">{prebid ? 'Save pre-bid' : 'Set max'}</button>
        </div>
      </form>
    </div>
  )
}

// The chat: the pinned message on top; slow mode said up front; a refused message comes back into the box with the
// reason (nobody else saw it). Muted or blocked by the host: the box is replaced by the note.
function ChatSheet({ messages, cfg, mod, error, onClose, onSend }) {
  const [text, setText] = useState('')
  const lastSent = useRef('')
  const end = useRef(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [messages.length])
  useEffect(() => { if (error && lastSent.current) { setText(t => t || lastSent.current); lastSent.current = '' } }, [error])
  const silenced = mod?.mute || mod?.block
  return (
    <div className="vr-sheet-backdrop" onClick={onClose}>
      <div className="vr-sheet card" role="dialog" aria-modal="true" aria-labelledby="vr-chat-h" onClick={e => e.stopPropagation()}>
        <div className="vr-sheet-head"><h2 id="vr-chat-h" className="vr-sheet-title">Chat</h2><button type="button" className="vr-x" onClick={onClose} aria-label="Close">×</button></div>
        {cfg.pinned && <p className="vr-pinned-sheet"><span className="wtf-label">Pinned</span> <strong>@{cfg.pinned.username}</strong> {cfg.pinned.text}</p>}
        <ul className="vr-chat-list">
          {messages.length === 0 && <li className="vr-muted">No messages yet.</li>}
          {messages.map((m, i) => <li key={m.id || i}><strong>@{m.username}</strong>{m.role === 'host' && <span className="vr-host-tag">Host</span>} {m.text}</li>)}
          <li ref={end} aria-hidden="true" />
        </ul>
        {silenced
          ? <p className="vr-muted vr-small" role="status">{mod.message}</p>
          : <>
              {cfg.slow_mode_seconds > 0 && <p className="vr-muted vr-small">Slow mode: one message every {cfg.slow_mode_seconds} seconds.</p>}
              {error && <p className="error-msg vr-small" role="alert">{error.message}</p>}
              <form className="vr-chat-form" onSubmit={e => { e.preventDefault(); if (text.trim()) { lastSent.current = text.trim(); onSend(text.trim()); setText('') } }}>
                <input value={text} onChange={e => setText(e.target.value)} maxLength={200} placeholder="Say something" aria-label="Message" />
                <button type="submit" className="btn-primary">Send</button>
              </form>
            </>}
      </div>
    </div>
  )
}

// You won: the won Glint and confetti (no confetti, and no motion, with reduced motion).
function WonOverlay({ won, onClose }) {
  const still = reducedMotion()
  useEffect(() => { const t = setTimeout(onClose, 6000); return () => clearTimeout(t) }, [onClose])
  return (
    <div className="vr-won" role="alertdialog" aria-modal="true" aria-labelledby="vr-won-h" onClick={onClose}>
      {!still && <div className="vr-confetti" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <span key={i} style={{ '--i': i }} />)}</div>}
      <div className="vr-won-card card">
        <img src="/brand/state-won.svg" alt="" width="72" height="72" className={still ? '' : 'vr-won-mark'} />
        <h2 id="vr-won-h" className="vr-won-title">You won lot {won.lot_number}</h2>
        {won.amount != null && <p className="wtf-price vr-won-amount">{fmtMoney(won.amount)}</p>}
        <p className="vr-muted vr-small">We charge your card on file now. It ships with everything else you win in this show.</p>
        <button type="button" className="btn-primary" onClick={onClose}>Keep watching</button>
      </div>
    </div>
  )
}
