import { useState, useEffect } from 'react'
import { api } from '../api'
import './points.css'

// Buyer points + promotions (G2, wtf-handoff POINTS_BRIEF.md). Every piece here renders nothing while points are
// switched off on the server (GET /config says points.enabled false, /me/points says enabled false).

const money = cents => '$' + (Number(cents || 0) / 100).toFixed(2).replace(/\.00$/, '')
const fmtDate = iso => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

// GET /config once per page load: { enabled, points_per_dollar, points_per_reward, reward_cents }.
let configPromise = null
export function usePointsConfig() {
  const [cfg, setCfg] = useState(null)
  useEffect(() => {
    configPromise ||= api.getConfig().then(c => c.points || { enabled: false }).catch(() => ({ enabled: false }))
    let live = true
    configPromise.then(c => { if (live) setCfg(c) })
    return () => { live = false }
  }, [])
  return cfg
}

// The one sentence buyers need. Numbers come from the server's settings.
export function pointsSentence(cfg) {
  if (!cfg?.enabled) return ''
  const per = cfg.points_per_dollar === 1 ? 'a point' : `${cfg.points_per_dollar} points`
  return `Earn ${per} for every dollar you win. Every ${cfg.points_per_reward} points is ${money(cfg.reward_cents)} off.`
}

// Lot page / bid panel: "This win earns about 45 points". Logged in only (the caller decides).
export function EarnHint({ dollars }) {
  const cfg = usePointsConfig()
  if (!cfg?.enabled || !(dollars > 0)) return null
  const pts = Math.floor(dollars) * cfg.points_per_dollar
  if (!pts) return null
  return <p className="pts-earn">This win earns about <strong>{pts} points</strong>.</p>
}

const KIND_TEXT = { earn: 'Earned', redeem: 'Reward used', expire: 'Expired', reverse: 'Refunded', adjust: 'Adjusted' }

// Account page: balance, progress to the next reward, $ saved, expiry, auto-apply switch, history.
export function PointsCard() {
  const [p, setP] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showAll, setShowAll] = useState(false)
  useEffect(() => { api.getMyPoints().then(setP).catch(e => setError(e.message)) }, [])
  if (error) return null            // points are an extra: never block the account page
  if (!p?.enabled) return null

  async function toggle(e) {
    const value = e.target.checked
    setSaving(true)
    try { const r = await api.setPointsAutoApply(value); setP({ ...p, auto_apply: r.auto_apply }) }
    catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }
  const pct = Math.min(100, Math.round(100 * p.toward_next / p.per_reward))
  const rows = showAll ? p.history : p.history.slice(0, 5)
  return (
    <section className="pts-card" aria-labelledby="pts-h">
      <h2 id="pts-h" className="pts-h">Your points</h2>
      <p className="pts-balance"><span className="pts-num tabular">{p.balance}</span> points</p>
      <div className="pts-bar" role="progressbar" aria-valuemin={0} aria-valuemax={p.per_reward} aria-valuenow={p.toward_next}
        aria-label={`${p.toward_next} of ${p.per_reward} points to your next ${money(p.reward_cents)} reward`}>
        <span style={{ width: pct + '%' }} />
      </div>
      <p className="pts-note">
        {p.rewards_ready > 0
          ? <><strong>{money(p.reward_cents)} reward ready</strong>{p.rewards_ready > 1 ? ` (${p.rewards_ready} in all)` : ''}. </>
          : null}
        {p.toward_next} / {p.per_reward} toward the next {money(p.reward_cents)} off.
      </p>
      <dl className="pts-facts">
        <div><dt>Saved so far</dt><dd className="tabular">{money(p.saved_cents)}</dd></div>
        <div><dt>Points expire</dt><dd>{p.expires_at ? fmtDate(p.expires_at) : 'No points yet'}</dd></div>
      </dl>
      <p className="pts-small">Points expire after {p.expiry_months} months with no win. Any win keeps them all.</p>
      <label className="pts-switch">
        <input type="checkbox" checked={p.auto_apply} onChange={toggle} disabled={saving} />
        <span>
          <strong>Auto-apply my rewards</strong>
          <span>One {money(p.reward_cents)} reward comes off your next invoice. Turn off to save it for a bigger win.</span>
        </span>
      </label>
      {p.history.length > 0 && (
        <>
          <h3 className="pts-h3">History</h3>
          <ul className="pts-history">
            {rows.map((r, i) => (
              <li key={i}>
                <span className="pts-hist-what">{KIND_TEXT[r.kind] || r.kind}{r.item_title ? `: ${r.item_title}` : r.note && !['earn', 'redeem'].includes(r.kind) ? ` (${r.note})` : ''}</span>
                <span className={`pts-hist-pts tabular${r.points < 0 ? ' neg' : ''}`}>{r.points > 0 ? '+' : ''}{r.points}</span>
                <span className="pts-hist-date">{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </li>
            ))}
          </ul>
          {p.history.length > 5 && <button type="button" className="pts-more" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show less' : `Show all ${p.history.length}`}</button>}
        </>
      )}
    </section>
  )
}

const PROMO_TEXT = {
  free_shipping: () => 'Free shipping on this auction',
  bundle_free_shipping: p => `Win ${p.bundle_min_lots} or more lots here and that box ships free`,
  percent_code: p => `${p.percent}% off your winning bids with a promo code`,
}

// Event page / lot page: the promotions running for this auction, and (logged in, auction still open) the code box.
export function PromoNotes({ auctionId, open = true, loggedIn = false, compact = false }) {
  const [promos, setPromos] = useState(null)
  const [entered, setEntered] = useState(null)
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!auctionId) return
    api.getAuctionPromotions(auctionId).then(setPromos).catch(() => setPromos([]))
  }, [auctionId])
  const hasCode = !!promos?.some(p => p.kind === 'percent_code')
  useEffect(() => {
    if (hasCode && loggedIn && !compact) api.getEnteredCode(auctionId).then(r => setEntered(r.entered)).catch(() => {})
  }, [hasCode, loggedIn, compact, auctionId])
  if (!promos?.length) return null

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr(''); setMsg('')
    try { const r = await api.applyCode(auctionId, code); setEntered(r.entered); setCode(''); setMsg(r.note) }
    catch (e2) { setErr(e2.message) }
    finally { setBusy(false) }
  }
  async function remove() {
    setBusy(true); setErr(''); setMsg('')
    try { await api.removeCode(auctionId); setEntered(null) } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }
  return (
    <div className={`pts-promos${compact ? ' compact' : ''}`}>
      <ul>
        {promos.map((p, i) => <li key={i}><span className="pts-tag">Offer</span>{PROMO_TEXT[p.kind]?.(p)}<span className="pts-until"> until {fmtDate(p.ends_at)}</span></li>)}
      </ul>
      {hasCode && loggedIn && open && !compact && (
        entered
          ? <p className="pts-code-on">Code <strong>{entered.code}</strong> ({entered.percent}% off) {entered.applied ? 'was used on your invoice.' : 'is on.'}
              {!entered.applied && <button type="button" className="pts-link" onClick={remove} disabled={busy}>Remove</button>}</p>
          : <form className="pts-code" onSubmit={submit} noValidate>
              <label htmlFor={`pts-code-${auctionId}`}>Promo code</label>
              <input id={`pts-code-${auctionId}`} value={code} onChange={e => { setCode(e.target.value); setErr('') }} autoCapitalize="characters" autoComplete="off" maxLength={30} />
              <button type="submit" className="btn-ghost" disabled={busy || code.trim().length < 3}>Apply</button>
            </form>
      )}
      {err && <p className="error-msg" role="alert">{err}</p>}
      {msg && <p className="pts-small" role="status">{msg}</p>}
    </div>
  )
}

// My Orders: the invoice's discount line and the points each lot earned.
export function InvoiceDiscountLine({ invoice }) {
  if (!invoice?.discount_kind || !(invoice.discount_cents > 0)) return null
  const label = invoice.discount_kind === 'points_reward' ? 'Points reward' : 'Promo code'
  return (
    <p className="pts-inv-line">
      {label} <span className="tabular">−{money(invoice.discount_cents)}</span>
      {invoice.discount_premium_cents > 0 && <> · premium <span className="tabular">−{money(invoice.discount_premium_cents)}</span></>}
      {' '}on this auction's invoice
    </p>
  )
}

export { money as pointsMoney }
