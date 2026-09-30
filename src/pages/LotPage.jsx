import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom'
import { api } from '../api'
import { useServerClock, splitDuration, money, fmtDateTime, HOUR } from '../components/home/clock'
import Rail from '../components/home/Rail'
import LotCard from '../components/home/LotCard'
import Gallery from '../lot/Gallery'
import { WatchButton } from '../watch/WatchButtons'
import { usePreview } from '../preview/PreviewContext'
import TermsAcknowledgementModal from '../components/TermsAcknowledgementModal'
import '../components/home/home.css'
import './LotPage.css'

// A lot's own page (wtf-handoff LOT_PAGE_BRIEF.md): /a/<auction slug>/lot/<n>. Everything comes from the lot API
// (API.md): the public GET /lots/by-number (same for everyone), the buyer's own GET /lots/:id/me, the anonymised
// history and related lots. The page only renders: the server is the only judge of prices and minimums.
const ADMIN_USERNAME = 'whatthefind'
const POLL_MS = 5000

function timeLeft(ms) {
  if (ms <= 0) return 'Closed'
  const { days, hours, minutes, seconds } = splitDuration(ms)
  const pad = v => String(v).padStart(2, '0')
  if (days > 0) return `${days}d ${hours}h ${pad(minutes)}m`
  if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`
  return `${minutes}m ${pad(seconds)}s`
}
const fmtShort = iso => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const isTypingTarget = el => el && (el.closest('input, textarea, select, [contenteditable="true"]'))

export default function LotPage() {
  const { slug, n } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const preview = usePreview()
  const token = localStorage.getItem('wtf_token')
  const username = localStorage.getItem('wtf_username')
  const isAdmin = username === ADMIN_USERNAME
  const isSample = String(slug).startsWith('sample-')

  const [data, setData] = useState(null)
  const [missing, setMissing] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [me, setMe] = useState(null)
  const [history, setHistory] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [related, setRelated] = useState(null)
  const [sample, setSample] = useState(null)
  const [maxInput, setMaxInput] = useState('')
  const [confirm, setConfirm] = useState(null)       // { amount, kind: 'tap' | 'max' }
  const [placing, setPlacing] = useState(false)
  const [bidError, setBidError] = useState('')
  const [bidNote, setBidNote] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(null)
  const [termsAuction, setTermsAuction] = useState(null)
  const [toast, setToast] = useState('')
  const pendingRef = useRef(null)
  const toastTimer = useRef(null)
  const lotId = data?.lot.id

  const now = useServerClock(data?.server_now)

  // ---- Loading ----
  useEffect(() => {
    let cancelled = false
    setData(null); setMissing(false); setLoadError(''); setMe(null); setHistory(null); setRelated(null)
    setMaxInput(''); setBidError(''); setBidNote(''); setConfirm(null)
    window.scrollTo(0, 0)
    if (isSample) {
      // Preview mode: the admin's sample lots, built in the browser. Nothing is sent or stored.
      if (!preview.active) { setMissing(true); return }
      import('../preview/sampleData').then(mod => {
        if (cancelled) return
        const s = mod.sampleLotPage(slug, Number(n))
        if (!s) { setMissing(true); return }
        setSample(s); setData(s.lot); setHistory(s.bids); setRelated(s.related)
      })
      return () => { cancelled = true }
    }
    api.getLotByNumber(slug, n)
      .then(d => {
        if (cancelled) return
        // An old slug (the auction was renamed): move to the current address, keeping Back clean.
        if (d.auction.slug !== slug) navigate(`/a/${d.auction.slug}/lot/${d.lot.number}${location.hash}`, { replace: true })
        setData(d)
      })
      .catch(e => { if (!cancelled) { if (e.status === 404 || e.status === 400) setMissing(true); else setLoadError(e.message) } })
    return () => { cancelled = true }
  }, [slug, n, isSample, preview.active])   // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(async () => {
    if (!lotId || isSample) return
    try { setData(await api.getLot(lotId)) } catch { /* keep what is shown; the next poll retries */ }
    if (token && !isAdmin) { try { setMe(await api.getLotMe(lotId)) } catch { /* ignore */ } }
    if (historyOpen) { try { setHistory(await api.getLotBids(lotId)) } catch { /* ignore */ } }
  }, [lotId, isSample, token, isAdmin, historyOpen])

  useEffect(() => {
    if (!lotId || isSample) return
    if (token && !isAdmin) api.getLotMe(lotId).then(setMe).catch(() => {})
    api.getLotRelated(lotId).then(setRelated).catch(() => setRelated({ more_from_auction: [], similar: [], premium_pct: {} }))
  }, [lotId, isSample, token, isAdmin])

  useEffect(() => {
    if (!lotId || isSample) return
    const t = setInterval(() => { if (!document.hidden) refresh() }, POLL_MS)
    return () => clearInterval(t)
  }, [lotId, isSample, refresh])

  useEffect(() => {
    if (!historyOpen || !lotId || isSample || history) return
    api.getLotBids(lotId).then(setHistory).catch(() => setHistory({ bid_count: 0, bids: [], error: true }))
  }, [historyOpen, lotId, isSample, history])

  // Terms: the first bid in an auction goes through the acknowledgement (same gate as the auction room).
  const auctionId = data?.auction.id
  useEffect(() => {
    setTermsAccepted(null)
    if (!auctionId || isSample) return
    if (!token) { setTermsAccepted(false); return }
    api.getTermsAcceptance(auctionId).then(r => setTermsAccepted(!!r.accepted)).catch(() => setTermsAccepted(false))
  }, [auctionId, token, isSample])

  // Title and description for this lot (the share preview for link crawlers is served by api/lot-meta.js).
  useEffect(() => {
    if (!data) return
    const prev = document.title
    document.title = `Lot ${data.lot.number}: ${data.lot.title} | ${data.auction.title} | What The Find`
    return () => { document.title = prev }
  }, [data?.lot.id, data?.lot.title, data?.auction.title])   // eslint-disable-line react-hooks/exhaustive-deps

  function say(msg) {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2500)
  }

  // ---- Moving between lots ----
  const lotHrefN = num => `/a/${data.auction.slug}/lot/${num}`
  const auctionHref = data ? (isSample ? '/' : `/auction/${data.auction.id}`) : '/auctions'
  const prevHref = data ? (data.nav.prev ? lotHrefN(data.nav.prev.number) : auctionHref) : null
  const nextHref = data ? (data.nav.next ? lotHrefN(data.nav.next.number) : auctionHref) : null

  useEffect(() => {
    if (!data) return
    const key = e => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target) || document.querySelector('[aria-modal="true"]')) return
      if (e.key === 'ArrowLeft' && e.shiftKey) navigate(prevHref)
      if (e.key === 'ArrowRight' && e.shiftKey) navigate(nextHref)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [data, prevHref, nextHref, navigate])

  // Phones: a clear horizontal swipe on the page (not on the photos, which swipe themselves) changes lot.
  const touch = useRef(null)
  function onTouchStart(e) {
    if (e.target.closest('.lp-gallery, .rail-track, input, .lp-sheet')) { touch.current = null; return }
    const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }
  }
  function onTouchEnd(e) {
    const s = touch.current; touch.current = null
    if (!s) return
    const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y
    if (Math.abs(dx) > 80 && Math.abs(dy) < 40) navigate(dx < 0 ? nextHref : prevHref)
  }

  // ---- Bidding ----
  function startBid(amount, kind) {
    setBidError(''); setBidNote('')
    if (isSample) { say('Bidding is disabled in preview'); return }
    if (!token) { navigate(`/login?next=${encodeURIComponent(location.pathname)}`); return }
    const a = Number(amount)
    if (!Number.isFinite(a) || a <= 0) { setBidError('Enter your max bid in dollars.'); return }
    setConfirm({ amount: Math.round(a * 100) / 100, kind })
  }

  async function place(amount) {
    setPlacing(true); setBidError('')
    try {
      await api.placeStandardBid(data.auction.id, data.lot.id, amount)
      setMaxInput('')
      const [d, m] = await Promise.all([api.getLot(data.lot.id), api.getLotMe(data.lot.id)])
      setData(d); setMe(m); setHistory(null)
      if (historyOpen) api.getLotBids(data.lot.id).then(setHistory).catch(() => {})
      setBidNote(m.status === 'winning' ? "Bid placed. You're winning." : "Bid placed, but another bidder's max is higher. You've been outbid.")
    } catch (e) {
      setBidError(e.message || 'Bid failed')
    } finally {
      setPlacing(false)
    }
  }

  function confirmBid() {
    const amount = confirm.amount
    setConfirm(null)
    if (termsAccepted) { place(amount); return }
    pendingRef.current = () => place(amount)
    api.getAuction(data.auction.id).then(setTermsAuction).catch(e => setBidError(e.message))
  }

  async function acceptTerms(choice) {
    await api.acceptTerms(data.auction.id, choice)
    setTermsAccepted(true); setTermsAuction(null)
    const run = pendingRef.current; pendingRef.current = null
    if (run) run()
  }

  // ---- Render ----
  if (missing) {
    return (
      <div className="page lp-missing">
        <h1>Lot not found</h1>
        <p>{isSample ? 'Sample lots are only shown in preview mode.' : 'This lot may have been removed, or the link is incomplete.'}</p>
        <Link to="/auctions" className="btn-primary">Browse auctions</Link>
      </div>
    )
  }
  if (loadError) return <div className="page"><p className="error-msg">{loadError}</p></div>
  // Loading: the page's own shape (breadcrumb row, 4:3 photo box), full height, so nothing jumps when it fills in.
  if (!data) {
    return (
      <div className="lp lp-skeleton" aria-busy="true">
        <div className="lp-topbar"><p className="lp-muted">Loading lot…</p></div>
        <div className="lp-main"><div className="lp-gallery"><div className="lp-stage" /></div><div className="lp-panel" /></div>
      </div>
    )
  }

  const { lot, auction, photos, price, time, fulfilment } = data
  const msLeft = time.ends_at ? Date.parse(time.ends_at) - now : Infinity
  const open = lot.status === 'open' && msLeft > 0
  const finalHour = open && msLeft < HOUR
  const status = me?.status || (token && !isAdmin ? null : 'none')
  const winning = open && status === 'winning'
  // Preview shows the admin the buyer's view of a sample lot (its bid buttons only say they're disabled).
  const canBid = open && (!isAdmin || isSample)
  const minMax = me?.min_bid ?? price.next_bids[0]
  const pct = price.premium_pct
  // The confirm sheet's total for an amount the buyer picked: the backend's lot_rules.withPremium, same cents maths.
  const withPrem = amount => { const h = Math.round(amount * 100); return (h + Math.round(h * pct / 100)) / 100 }
  const priceLine = lot.status === 'sold' ? 'Sold for' : lot.status === 'unsold' ? (price.bid_count ? 'Highest bid' : null)
    : price.current_bid != null ? 'Current bid' : 'Opening bid'
  const shownPrice = price.current_bid ?? price.opening_bid
  const more = related?.more_from_auction || []
  const similar = related?.similar || []
  const premFor = related?.premium_pct || {}

  return (
    <div className={`lp${canBid ? ' lp-has-bar' : ''}`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {isSample && <div className="lp-preview" role="note"><strong>Preview:</strong> a sample lot. Only you can see it; bidding is disabled.</div>}

      <nav className="lp-topbar" aria-label="Breadcrumb and lot navigation">
        <ol className="lp-crumbs">
          <li><Link to="/auctions">Auctions</Link></li>
          <li><Link to={auctionHref}>{auction.title}</Link></li>
          <li aria-current="page">Lot {lot.number}</li>
        </ol>
        <div className="lp-stepper">
          <Link to={prevHref} className="lp-step" aria-label={data.nav.prev ? `Previous: lot ${data.nav.prev.number}` : 'Back to the auction'}>‹</Link>
          <span className="lp-step-of tabular">{lot.number} of {auction.lot_count}</span>
          <Link to={nextHref} className="lp-step" aria-label={data.nav.next ? `Next: lot ${data.nav.next.number}` : 'Back to the auction'}>›</Link>
        </div>
      </nav>

      <div className="lp-main">
        <Gallery photos={photos} title={lot.title} placeholderLabel={lot.placeholder_label} seed={lot.id} />

        <section className="lp-panel" aria-labelledby="lp-title">
          <p className="wtf-label">Lot {lot.number}</p>
          <h1 id="lp-title" className="lp-title">{lot.title}</h1>

          <div className="lp-price">
            {priceLine ? <>
              <p className="lp-price-label">{priceLine}</p>
              <p className="lp-price-amount wtf-price">{money(lot.status === 'open' || lot.status === 'upcoming' ? shownPrice : price.current_bid)}</p>
              {/* Premium is always beside the price (BRAND.md), computed by the server with the invoice's maths. */}
              {lot.status !== 'unsold' && <p className="lp-price-prem"><span className="wtf-price">{money(price.total_with_premium)}</span> with {pct}% buyer's premium</p>}
            </> : <p className="lp-price-label">Closed without a sale</p>}
            {price.bid_count > 0 && <p className="lp-bidcount">{price.bid_count === 1 ? '1 bid' : `${price.bid_count} bids`}</p>}
          </div>

          {token && !isAdmin && me && <StatusLine status={me.status} myMax={me.my_max} open={open} />}

          {lot.status === 'upcoming' && <p className="lp-time-closed">Bidding opens {fmtDateTime(auction.starts_at)}.</p>}
          {open && (
            <div className="lp-time">
              <p className="lp-time-label">Time left</p>
              <p className={`lp-time-left tabular${finalHour ? ' urgent' : ''}`} role="timer" aria-live="off">{timeLeft(msLeft)}</p>
              <p className="lp-time-close">Closes {fmtDateTime(time.ends_at)}</p>
              <p className="lp-softclose">A bid in the last {time.soft_close_minutes} minutes extends bidding to {time.soft_close_minutes} minutes from that bid.</p>
            </div>
          )}
          {!open && lot.status !== 'upcoming' && <p className="lp-time-closed">Bidding closed {time.ends_at ? fmtDateTime(time.ends_at) : ''}</p>}

          {canBid && (
            <div className="lp-bid" id="lp-bid">
              {!winning && price.next_bids.length === 2 && (
                <div className="lp-taps">
                  {price.next_bids.map(a => (
                    <button key={a} type="button" className="btn-bid lp-tap" disabled={placing} onClick={() => startBid(a, 'tap')}>
                      {token || isSample ? `Bid ${money(a)}` : `Log in to bid ${money(a)}`}
                    </button>
                  ))}
                </div>
              )}
              <form className="lp-max" noValidate onSubmit={e => { e.preventDefault(); startBid(maxInput, 'max') }}>
                <label htmlFor="lp-max-input" className="lp-max-label">{winning ? 'Raise your max bid' : 'Or set a max bid'}</label>
                <div className="lp-max-row">
                  <span className="lp-max-dollar" aria-hidden="true">$</span>
                  <input id="lp-max-input" type="number" inputMode="decimal" min={minMax} step="0.01" value={maxInput}
                    placeholder={`${minMax} or more`} onChange={e => { setMaxInput(e.target.value); setBidError('') }} disabled={placing} />
                  <button type="submit" className={winning ? 'btn-bid' : 'btn-primary'} disabled={placing || !maxInput}>Set max</button>
                </div>
                <p className="lp-max-help">We bid for you, only as high as needed.</p>
              </form>
              <div className="lp-watch"><WatchButton itemId={lot.id} disabled={isSample} /></div>
              {bidError && <p className="error-msg" role="alert">{bidError}</p>}
              {bidNote && <p className={status === 'winning' ? 'success-msg' : 'lp-outbid-msg'} role="status">{bidNote}</p>}
            </div>
          )}
          {isAdmin && open && !isSample && <p className="lp-host-note">You're the host. Bidding is for buyers.</p>}
        </section>
      </div>

      <div className="lp-sections">
        <section className="lp-section" aria-labelledby="lp-details-h">
          <h2 id="lp-details-h" className="lp-h2">Details</h2>
          {lot.description
            ? lot.description.split(/\n{2,}/).map((p, i) => <p key={i} className="lp-desc">{p}</p>)
            : <p className="lp-desc lp-muted">No description yet.</p>}
          <dl className="lp-facts">
            <div><dt>Lot number</dt><dd>{lot.number}</dd></div>
            {lot.condition && <div><dt>Condition</dt><dd>{lot.condition}</dd></div>}
            {time.ends_at && <div><dt>Lot closes</dt><dd>{fmtDateTime(time.ends_at)}</dd></div>}
            {auction.ends_at && <div><dt>Auction ends</dt><dd>{fmtDateTime(auction.ends_at)}</dd></div>}
          </dl>
          {auction.story && (
            <p className="lp-story">
              <span className="wtf-label">From the collection</span>
              <span className="lp-story-line">{auction.story}</span>
              <Link to={auctionHref} className="lp-link">Read the collection's story</Link>
            </p>
          )}
          <p className="lp-questions">
            Questions about this lot? <a className="lp-link" href={`mailto:${data.contact_email}?subject=${encodeURIComponent(`Lot ${lot.number}: ${lot.title}`)}`}>Email us</a>
          </p>
        </section>

        <section className="lp-section" aria-labelledby="lp-ship-h">
          <h2 id="lp-ship-h" className="lp-h2">Shipping and pickup</h2>
          <ul className="lp-ship">
            {fulfilment.pickup && (
              <li>
                <p className="lp-ship-h">Local pickup · Free</p>
                <p>
                  {fulfilment.pickup.city ? `In ${fulfilment.pickup.city}. ` : ''}The exact address is sent to winners.
                  {fulfilment.pickup.starts_at && fulfilment.pickup.ends_at && ` Pickup window: ${fmtShort(fulfilment.pickup.starts_at)} to ${fmtShort(fulfilment.pickup.ends_at)}.`}
                </p>
              </li>
            )}
            {fulfilment.shipping && (
              <li>
                <p className="lp-ship-h">Shipping · {fulfilment.shipping.carrier}, within the US</p>
                <p>
                  Shipping is calculated after the auction from your address and the item's size. You pay the exact
                  postage with no handling fee, charged separately once your lots are packed and weighed, and we email
                  you the amount.
                </p>
              </li>
            )}
          </ul>
          {fulfilment.pickup && fulfilment.shipping && <p className="lp-muted lp-small">You choose pickup or shipping before your first bid in this auction.</p>}
        </section>

        <section className="lp-section" aria-labelledby="lp-hist-h">
          <details className="lp-history" open={historyOpen} onToggle={e => setHistoryOpen(e.currentTarget.open)}>
            <summary><h2 id="lp-hist-h" className="lp-h2">Bid history ({price.bid_count})</h2></summary>
            {!history ? <p className="lp-muted">Loading…</p>
              : history.error ? <p className="lp-muted">Could not load the history. Try again in a moment.</p>
              : history.bids.length === 0 ? <p className="lp-muted">No bids yet.</p>
              : (
                <table className="lp-hist-table">
                  <caption className="visually-hidden">Bids on lot {lot.number}, newest first. Bidders are anonymous.</caption>
                  <thead><tr><th scope="col">Bidder</th><th scope="col">Bid</th><th scope="col">Time</th></tr></thead>
                  <tbody>
                    {history.bids.map((b, i) => (
                      <tr key={i} className={b.you ? 'you' : ''}>
                        <td>{b.bidder}</td>
                        <td className="tabular">{money(b.amount)}</td>
                        <td className="tabular">{fmtShort(b.at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            <p className="lp-muted lp-small">Every bid that set the price, newest first. Bidders stay anonymous and max bids are never shown.</p>
          </details>
        </section>
      </div>

      <nav className="lp-prevnext" aria-label="Previous and next lot">
        <Link to={prevHref} className="lp-pn lp-pn-prev">
          <span className="wtf-label">{data.nav.prev ? `‹ Lot ${data.nav.prev.number}` : '‹ Back to'}</span>
          <span className="lp-pn-title">{data.nav.prev ? data.nav.prev.title : auction.title}</span>
        </Link>
        <Link to={nextHref} className="lp-pn lp-pn-next">
          <span className="wtf-label">{data.nav.next ? `Lot ${data.nav.next.number} ›` : 'Back to ›'}</span>
          <span className="lp-pn-title">{data.nav.next ? data.nav.next.title : auction.title}</span>
        </Link>
      </nav>
      <p className="lp-swipe-hint">Swipe left or right for the next lot</p>

      <div className="lp-rails home">
        <Rail id="lp-more" title="More from this auction" count={more.length} viewAllHref={isSample ? null : auctionHref}>
          {more.map(l => <LotCard key={l.id} lot={l} premiumPct={premFor[l.auction_id]} now={now} extra={<div className="lc-watch"><WatchButton itemId={l.id} disabled={isSample} /></div>} />)}
        </Rail>
        <Rail id="lp-similar" title="Similar lots" note="From other open auctions" count={similar.length}>
          {similar.map(l => <LotCard key={l.id} lot={l} premiumPct={premFor[l.auction_id]} now={now} extra={<div className="lc-watch"><WatchButton itemId={l.id} /></div>} />)}
        </Rail>
      </div>

      {canBid && (
        <div className="lp-bar" role="region" aria-label="Bid">
          <div className="lp-bar-price">
            <span className="lp-bar-amount wtf-price">{money(shownPrice)}</span>
            <span className={`lp-bar-time tabular${finalHour ? ' urgent' : ''}`}>{winning ? "You're winning" : timeLeft(msLeft)}</span>
          </div>
          {winning || price.next_bids.length === 0
            ? <a href="#lp-bid" className="btn-ghost lp-bar-btn" onClick={e => { e.preventDefault(); document.getElementById('lp-max-input')?.focus() }}>Raise max</a>
            : <button type="button" className="btn-bid lp-bar-btn" disabled={placing} onClick={() => startBid(price.next_bids[0], 'tap')}>
                {token || isSample ? `Bid ${money(price.next_bids[0])}` : 'Log in to bid'}
              </button>}
        </div>
      )}

      {confirm && (
        <ConfirmSheet
          amount={confirm.amount} kind={confirm.kind} pct={pct} total={withPrem(confirm.amount)}
          lot={lot} winning={winning}
          onCancel={() => setConfirm(null)} onConfirm={confirmBid}
        />
      )}
      {termsAuction && (
        <TermsAcknowledgementModal auction={termsAuction} onCancel={() => { setTermsAuction(null); pendingRef.current = null }} onAccept={acceptTerms} />
      )}
      {toast && <div className="preview-toast" role="status">{toast}</div>}
    </div>
  )
}

function StatusLine({ status, myMax, open }) {
  const text = {
    winning: "You're winning", outbid: "You've been outbid", no_bid: "You haven't bid",
    won: 'You won this lot', lost: "You didn't win this lot", closed: null,
  }[status]
  if (!text) return null
  return (
    <div className={`lp-status lp-status-${status}`} role="status">
      {status === 'outbid' && <img src="/brand/state-outbid.svg" alt="" width="28" height="28" />}
      {status === 'won' && <img src="/brand/state-won.svg" alt="" width="28" height="28" />}
      <span className="lp-status-text">{text}</span>
      {open && myMax != null && <span className="lp-status-max">Your max: <span className="wtf-price">{money(myMax)}</span> <span className="lp-muted">(only you see this)</span></span>}
    </div>
  )
}

// Every bid is confirmed: the amount, what it costs with the premium, and that it is binding.
function ConfirmSheet({ amount, kind, pct, total, lot, winning, onCancel, onConfirm }) {
  const okRef = useRef(null)
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel
  useEffect(() => {
    okRef.current?.focus()
    const key = e => { if (e.key === 'Escape') cancelRef.current() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  return (
    <div className="lp-sheet-backdrop" onClick={onCancel}>
      <div className="lp-sheet card" role="dialog" aria-modal="true" aria-labelledby="lp-sheet-h" onClick={e => e.stopPropagation()}>
        <h2 id="lp-sheet-h" className="lp-sheet-title">{kind === 'tap' ? `Bid ${money(amount)}?` : winning ? `Raise your max to ${money(amount)}?` : `Set a max bid of ${money(amount)}?`}</h2>
        <p className="lp-sheet-lot">Lot {lot.number}: {lot.title}</p>
        <p className="lp-sheet-total">If you win at {money(amount)}, you pay <strong className="wtf-price">{money(total)}</strong> with the {pct}% buyer's premium{kind === 'max' ? ', and less if nobody bids you up that far.' : '.'}</p>
        {kind === 'max' && <p className="lp-muted lp-small">We bid for you, only as high as needed.</p>}
        <p className="lp-muted lp-small">Bids are binding and can't be taken back.</p>
        <div className="lp-sheet-actions">
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="button" ref={okRef} className="btn-bid" onClick={onConfirm}>Confirm bid</button>
        </div>
      </div>
    </div>
  )
}
