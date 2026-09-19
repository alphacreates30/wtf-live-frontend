import { useState } from 'react'
import './TermsAcknowledgementModal.css'

function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function TermsAcknowledgementModal({ auction, onCancel, onAccept }) {
  const [checked, setChecked] = useState(false)
  // Only meaningful (and only required) when the auction offers both - no
  // default, no pre-selected radio, so accepting always reflects a
  // deliberate pick rather than a default the buyer never actually chose.
  const [choice, setChoice] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const bothOffered = auction.fulfillment_mode === 'both'
  const pickupOnly = auction.fulfillment_mode === 'pickup'
  const shippingOnly = auction.fulfillment_mode === 'shipping'
  const premiumPct = auction.buyers_premium_pct ?? 15
  const pickupWindow = auction.pickup_starts_at && auction.pickup_ends_at
    ? `${fmtDate(auction.pickup_starts_at)} – ${fmtDate(auction.pickup_ends_at)}`
    : null
  const canAccept = checked && (!bothOffered || !!choice) && !submitting

  async function handleAccept() {
    if (!canAccept) return
    setSubmitting(true); setError('')
    try {
      await onAccept(bothOffered ? choice : undefined)
    } catch (err) {
      setError(err.message || 'Could not record your acceptance. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="terms-modal-backdrop" onClick={submitting ? undefined : onCancel}>
      <div className="terms-modal card" role="dialog" aria-modal="true" aria-labelledby="terms-modal-title" onClick={e => e.stopPropagation()}>
        {/* Scrolls on its own; the footer below never does, so the button a buyer
            needs to bid is always on screen. */}
        <div className="terms-modal-body">
        <h2 className="terms-modal-title" id="terms-modal-title">Before you bid — {auction.title}</h2>
        <ul className="terms-modal-list">
          <li>Lots open at <strong>$0.00</strong>. Some carry an undisclosed reserve.</li>
          <li>A <strong>{premiumPct}% buyer's premium</strong> is added to your winning bid.</li>
          <li><strong>Your card is charged automatically</strong> when a lot closes and you've won it.</li>
          <li><strong>Bids are binding and cannot be retracted.</strong></li>
          <li>Lots are sold <strong>as-is</strong>. All sales final, except a lot materially not as described — tell us within 3 days and we'll refund it.</li>
          {pickupOnly && (
            <>
              <li>
                <strong>Pickup:{pickupWindow ? ` ${pickupWindow}` : ''}</strong>
                {auction.pickup_address ? ` at ${auction.pickup_address}.` : '.'}
              </li>
              <li className="terms-modal-warning">
                Lots not collected within the pickup window are <strong>forfeited with no refund</strong>.
              </li>
            </>
          )}
          {shippingOnly && (
            <li>
              <strong>Shipping:</strong> postage is charged at actual cost, no added fee, as a separate payment after your item is packed.
            </li>
          )}
        </ul>

        {bothOffered && (
          <div className="terms-modal-choice">
            <p className="terms-modal-choice-label">How will you receive your winnings? *</p>
            <label className={`terms-modal-choice-option ${choice === 'pickup' ? 'terms-modal-choice-selected' : ''}`}>
              <input type="radio" name="fulfillment_choice" checked={choice === 'pickup'} onChange={() => setChoice('pickup')} />
              <span>
                <strong>Local pickup</strong>
                <br />
                {pickupWindow ? `${pickupWindow}` : 'Window to be confirmed'}{auction.pickup_address ? ` at ${auction.pickup_address}` : ''}.{' '}
                <span className="terms-modal-warning">Lots not collected in this window are forfeited with no refund.</span>
              </span>
            </label>
            <label className={`terms-modal-choice-option ${choice === 'shipping' ? 'terms-modal-choice-selected' : ''}`}>
              <input type="radio" name="fulfillment_choice" checked={choice === 'shipping'} onChange={() => setChoice('shipping')} />
              <span>
                <strong>Shipping</strong>
                <br />
                Postage charged at actual cost, no added fee, as a separate payment after your item is packed.
              </span>
            </label>
          </div>
        )}
        </div>

        <div className="terms-modal-footer">
        <label className="terms-modal-checkbox">
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />
          <span>
            I have read and agree to the{' '}
            <a href="/terms" target="_blank" rel="noreferrer">Terms of Sale</a>
          </span>
        </label>

        {error && <p className="error-msg">{error}</p>}
        {!canAccept && !submitting && (
          <p className="terms-modal-needs">
            {!checked ? 'Tick the box to continue' : 'Choose pickup or shipping to continue'}
          </p>
        )}

        <div className="terms-modal-actions">
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={submitting}>Cancel</button>
          <button type="button" className="btn-primary" onClick={handleAccept} disabled={!canAccept}>
            {submitting ? 'Placing bid…' : 'Agree and place bid'}
          </button>
        </div>
        </div>
      </div>
    </div>
  )
}
