import { useState } from 'react'
import './TermsAcknowledgementModal.css'

function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function TermsAcknowledgementModal({ auction, onCancel, onAccept }) {
  const [checked, setChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const offersPickup = auction.fulfillment_mode === 'pickup' || auction.fulfillment_mode === 'both'
  const premiumPct = auction.buyers_premium_pct ?? 15
  const pickupWindow = auction.pickup_starts_at && auction.pickup_ends_at
    ? `${fmtDate(auction.pickup_starts_at)} – ${fmtDate(auction.pickup_ends_at)}`
    : null

  async function handleAccept() {
    if (!checked || submitting) return
    setSubmitting(true); setError('')
    try {
      await onAccept()
    } catch (err) {
      setError(err.message || 'Could not record your acceptance. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="terms-modal-backdrop" onClick={submitting ? undefined : onCancel}>
      <div className="terms-modal card" onClick={e => e.stopPropagation()}>
        <h2 className="terms-modal-title">Before you bid — {auction.title}</h2>
        <ul className="terms-modal-list">
          <li>Lots open at <strong>$0.00</strong>. Some carry an undisclosed reserve.</li>
          <li>A <strong>{premiumPct}% buyer's premium</strong> is added to your winning bid.</li>
          <li><strong>Your card is charged automatically</strong> when a lot closes and you've won it.</li>
          <li><strong>Bids are binding and cannot be retracted.</strong></li>
          <li>Lots are sold <strong>as-is</strong>. All sales final, except a lot materially not as described — tell us within 3 days and we'll refund it.</li>
          {offersPickup && (
            <>
              <li>
                <strong>Pickup:{pickupWindow ? ` ${pickupWindow}` : ''}</strong>
                {auction.pickup_address ? ` at ${auction.pickup_address}.` : '.'} Choose shipping instead if you can't collect.
              </li>
              <li className="terms-modal-warning">
                ⚠️ Lots not collected within the pickup window, with no shipping arranged, are <strong>forfeited with no refund</strong>. Contact us before the window ends and we'll ship instead.
              </li>
            </>
          )}
        </ul>

        <label className="terms-modal-checkbox">
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />
          <span>
            I have read and agree to the{' '}
            <a href="/terms" target="_blank" rel="noreferrer">Terms of Sale</a>
          </span>
        </label>

        {error && <p className="error-msg">{error}</p>}

        <div className="terms-modal-actions">
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={submitting}>Cancel</button>
          <button type="button" className="btn-primary" onClick={handleAccept} disabled={!checked || submitting}>
            {submitting ? 'Placing bid…' : 'Agree and place bid'}
          </button>
        </div>
      </div>
    </div>
  )
}
