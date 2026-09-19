import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import '../pages/Buyer.css'
import './PaymentControl.css'

// Manual Charge / Retry for one invoice (a standard auction: one invoice per buyer
// per auction) or one live-auction order. Real money on a real card, so:
//   - one button, "Charge" when unpaid and "Retry" when failed; NOT rendered when
//     paid or charging (the backend's atomic claim would reject it anyway)
//   - a confirm step that names the buyer and the exact amount
//   - disabled the instant it is clicked. A ref, not just state: state updates are
//     async, so a fast double-click could otherwise fire two requests before the
//     first render disables the button
//   - never automatic: no polling, no retry-on-mount. A human decides every attempt.
// Each retry uses a fresh idempotency key on the backend, so a second attempt
// really reaches the card instead of replaying a cached decline.

const fmt = cents => '$' + (Number(cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function elapsedSince(iso) {
  if (!iso) return null
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (Number.isNaN(s)) return null
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

const STATUS_LABEL = { unpaid: 'Unpaid', charging: 'Charging', paid: 'Paid', failed: 'Payment failed' }

export default function PaymentControl({
  kind,            // 'invoice' | 'order'
  id,              // invoice id or order id
  buyer,           // display name, e.g. buyer username
  auctionTitle,
  lots = [],       // [{ id, title, hammer_cents, premium_cents }]
  status,          // unpaid | charging | paid | failed
  error,           // last payment_error
  paymentIntentId, // present once charged
  chargingSince,   // ISO, when known
  compact = false, // per-order rows: hide the itemised breakdown
  onDone,          // () => Promise - refresh the list quietly after an attempt
}) {
  const [confirming, setConfirming] = useState(false)
  const [inFlight, setInFlight] = useState(false)
  // What just happened, shown immediately (no reload) until the refreshed data lands.
  const [override, setOverride] = useState(null)
  const firing = useRef(false)
  const cancelRef = useRef(null)

  const hammer = lots.reduce((s, l) => s + (l.hammer_cents || 0), 0)
  const premium = lots.reduce((s, l) => s + (l.premium_cents || 0), 0)
  const total = hammer + premium

  const eff = override || { status, error, paymentIntentId }
  const st = eff.status || 'unpaid'
  const canAct = (st === 'unpaid' || st === 'failed') && !eff.paymentIntentId
  const isRetry = st === 'failed'
  const name = buyer ? `@${buyer}` : 'this buyer'

  useEffect(() => { if (confirming) cancelRef.current?.focus() }, [confirming])
  useEffect(() => {
    if (!confirming) return
    const onKey = e => { if (e.key === 'Escape' && !firing.current) setConfirming(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [confirming])

  async function fire() {
    if (firing.current) return           // synchronous guard against a double-click
    firing.current = true
    setInFlight(true)
    try {
      const res = kind === 'invoice' ? await api.chargeInvoice(id) : await api.chargeOrder(id)
      setOverride({ status: 'paid', error: null, paymentIntentId: res?.payment_intent_id || null })
    } catch (e) {
      // e.detail is the specific reason (declined / expired / insufficient funds...), e.message has it too
      setOverride({ status: 'failed', error: e.detail || e.message, paymentIntentId: null })
    } finally {
      setConfirming(false)
      setInFlight(false)
      try { await onDone?.() } catch { /* the list shows its own error */ }
      setOverride(null)                  // props now carry the truth
      firing.current = false
    }
  }

  return (
    <div className={`pc${compact ? ' pc-compact' : ''}`}>
      {!compact && (
        <>
          <div className="pc-head">
            <div>
              <div className="pc-buyer">{name}</div>
              <div className="pc-sub">
                {auctionTitle ? `${auctionTitle} · ` : ''}{lots.length} lot{lots.length === 1 ? '' : 's'}
              </div>
            </div>
            <span className={`badge pay-badge pay-${st}`}>{STATUS_LABEL[st] || st}</span>
          </div>

          <ul className="pc-lots">
            {lots.map(l => (
              <li key={l.id}>
                <span className="pc-lot-title">{l.title}</span>
                <span className="pc-lot-amt">{fmt(l.hammer_cents)} + {fmt(l.premium_cents)}</span>
              </li>
            ))}
          </ul>

          {/* Hammer and premium beside each other, THEN the total - never a bare total. */}
          <dl className="pc-totals">
            <div><dt>Hammer</dt><dd>{fmt(hammer)}</dd></div>
            <div><dt>Buyer's premium</dt><dd>{fmt(premium)}</dd></div>
            <div className="pc-total"><dt>Total</dt><dd>{fmt(total)}</dd></div>
          </dl>
        </>
      )}

      {compact && (
        <div className="pc-compact-row">
          <span className={`badge pay-badge pay-${st}`}>{STATUS_LABEL[st] || st}</span>
          <span className="pc-compact-amt">{fmt(total)}</span>
        </div>
      )}

      {st === 'failed' && eff.error && (
        <p className="error-msg pc-reason" role="alert"><strong>Payment failed.</strong> {eff.error}</p>
      )}

      {st === 'charging' && (
        <p className="pc-charging">
          Charging — waiting on Stripe{elapsedSince(chargingSince) ? ` (for ${elapsedSince(chargingSince)})` : ''}.
          A charge stuck here frees itself after 5 minutes; refresh to update.
        </p>
      )}

      {eff.paymentIntentId && (
        <p className="pc-pi">
          <span>PaymentIntent</span>
          <code>{eff.paymentIntentId}</code>
        </p>
      )}

      {canAct && (
        <button
          type="button"
          className="btn-primary pc-btn"
          onClick={() => setConfirming(true)}
          disabled={inFlight}
        >
          {inFlight ? 'Charging…' : `${isRetry ? 'Retry' : 'Charge'} ${fmt(total)}`}
        </button>
      )}

      {confirming && (
        <div className="pc-backdrop" onClick={inFlight ? undefined : () => setConfirming(false)}>
          <div className="pc-dialog card" role="dialog" aria-modal="true" aria-labelledby={`pc-title-${id}`} onClick={e => e.stopPropagation()}>
            <h2 id={`pc-title-${id}`} className="pc-dialog-title">{isRetry ? 'Retry' : 'Charge'} {fmt(total)} to {name}?</h2>
            <p className="pc-dialog-body">
              This charges the card {name} has on file, for real.
              {!compact && lots.length > 0 && <> Hammer <strong>{fmt(hammer)}</strong> + buyer's premium <strong>{fmt(premium)}</strong> = <strong>{fmt(total)}</strong>{auctionTitle ? <> for <em>{auctionTitle}</em></> : null}.</>}
            </p>
            {isRetry && eff.error && <p className="error-msg pc-reason"><strong>Last attempt failed.</strong> {eff.error}</p>}
            <div className="pc-dialog-actions">
              <button type="button" className="btn-ghost" ref={cancelRef} onClick={() => setConfirming(false)} disabled={inFlight}>Cancel</button>
              <button type="button" className="btn-primary" onClick={fire} disabled={inFlight}>
                {inFlight ? 'Charging…' : `${isRetry ? 'Retry' : 'Charge'} ${fmt(total)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
