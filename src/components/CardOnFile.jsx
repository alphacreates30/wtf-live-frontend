import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { api } from '../api'

// The buyer's card on file: whether it passed the $1 check, and a way to add or replace it. Bidding needs a VERIFIED
// card (backend biddingRefusal), and a declined charge asks the buyer to update it. Used on the profile page and, in
// a sheet, inside a live show's room. Stripe.js loads only where this is imported.
export const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)

// Stripe's card field lives in an iframe, so it can't see our CSS variables.
// Read the resolved token values instead of hardcoding hexes, so a palette
// change reaches the card field too.
export function cardStyle() {
  const css = getComputedStyle(document.documentElement)
  const token = name => css.getPropertyValue(name).trim()
  return {
    style: {
      base: {
        color: token('--text'),
        fontFamily: token('--font-body') || 'inherit',
        fontSize: '16px', // 16px stops iOS zooming the page on focus
        '::placeholder': { color: token('--ink-faint') },
      },
      invalid: { color: token('--error') },
    },
  }
}

// startOpen: the form is open at once (the room's "Update card" sheet). declined: the card on file was just declined
// for a lot (the room), so it isn't described as verified. onSaved(verified) after a save.
export function CardOnFile({ profile, onSaved, startOpen = false, onCancel, declined = false }) {
  const stripe = useStripe()
  const elements = useElements()
  const [open, setOpen] = useState(startOpen)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const verified = !!profile?.card_verified_at
  const hasCard = !!profile?.stripe_payment_method_id

  async function save(e) {
    e.preventDefault()
    setError(''); setNote(''); setSaving(true)
    try {
      const { client_secret } = await api.createSetupIntent()
      const { setupIntent, error: stripeErr } = await stripe.confirmCardSetup(client_secret, { payment_method: { card: elements.getElement(CardElement) } })
      if (stripeErr) { setError(stripeErr.message); return }
      const r = await api.savePaymentMethod(setupIntent.payment_method)
      if (r?.card_verified === false) setError("This card couldn't be verified. Try another card.")
      else { setNote('Card saved and verified.'); setOpen(false) }
      onSaved?.(r?.card_verified !== false)
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card profile-form card-on-file">
      <h3>Payment card</h3>
      {!hasCard ? <p className="profile-help">No card on file. Add one to bid.</p>
        : declined ? <p className="error-msg">Your card was declined. Add a card that works; we'll charge it for what you won as soon as you do.</p>
        : verified ? <p className="profile-help">Your card is on file and verified.</p>
        : <p className="error-msg">Your card couldn't be verified, so you can't bid yet. Add a card that works.</p>}
      {note && <p className="profile-help" role="status">{note}</p>}
      {open ? (
        <form onSubmit={save}>
          <div className="profile-card"><CardElement options={cardStyle()} /></div>
          {error && <p className="error-msg" role="alert">{error}</p>}
          <div className="card-on-file-actions">
            <button type="button" className="btn-ghost" onClick={() => { setOpen(false); setError(''); onCancel?.() }} disabled={saving}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving || !stripe}>{saving ? 'Saving…' : 'Save card'}</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>{hasCard ? 'Replace card' : 'Add a card'}</button>
      )}
    </div>
  )
}

// The card form with its own Stripe Elements (for a page that doesn't already have them).
export function CardOnFileStandalone(props) {
  return <Elements stripe={stripePromise}><CardOnFile {...props} /></Elements>
}
