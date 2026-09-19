import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { api } from '../api'
import './Buyer.css'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)

// Stripe's card field lives in an iframe, so it can't see our CSS variables.
// Read the resolved token values instead of hardcoding hexes, so a palette
// change reaches the card field too.
function cardStyle() {
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

function StatusScreen({ tag, tagClass, title, children }) {
  return (
    <div className="page status-screen">
      <span className={`status-tag ${tagClass}`}>{tag}</span>
      <h2>{title}</h2>
      {children}
    </div>
  )
}

function Field({ id, label, children }) {
  return (
    <label className="profile-field" htmlFor={id}>{label}{children}</label>
  )
}

function ProfileForm() {
  const navigate = useNavigate()
  const stripe = useStripe()
  const elements = useElements()

  const [form, setForm] = useState({
    full_name: '', email: '', phone: '',
    address_line1: '', address_line2: '',
    city: '', state: '', zip: '', country: 'US',
  })
  const [status, setStatus] = useState(null) // null | 'pending' | 'approved' | 'rejected' | 'blocked'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getMyProfile().then(profile => {
      if (profile) {
        setStatus(profile.status)
        setForm({
          full_name: profile.full_name || '',
          email: profile.email || '',
          phone: profile.phone || '',
          address_line1: profile.address_line1 || '',
          address_line2: profile.address_line2 || '',
          city: profile.city || '',
          state: profile.state || '',
          zip: profile.zip || '',
          country: profile.country || 'US',
        })
      }
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)

    try {
      // 1. Save profile first - this is what actually creates the profiles
      // row, so the Stripe fields below have a row to attach to.
      await api.saveProfile(form)

      // 2. Create SetupIntent + Stripe customer
      const { client_secret } = await api.createSetupIntent()

      // 3. Confirm card setup
      const cardEl = elements.getElement(CardElement)
      const { setupIntent, error: stripeErr } = await stripe.confirmCardSetup(client_secret, {
        payment_method: {
          card: cardEl,
          billing_details: { name: form.full_name, email: form.email },
        },
      })
      if (stripeErr) { setError(stripeErr.message); setSaving(false); return }

      // 4. Save payment method ID to backend
      await api.savePaymentMethod(setupIntent.payment_method)

      setStatus('pending')
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="page"><p className="buyer-note">Loading…</p></div>

  if (status === 'approved') {
    return (
      <StatusScreen tag="Approved" tagClass="status-tag-approved" title="Your account is approved">
        <p>You can join and bid in auctions.</p>
        <button className="btn-primary" onClick={() => navigate('/')}>Browse Auctions</button>
      </StatusScreen>
    )
  }

  if (status === 'pending') {
    return (
      <StatusScreen tag="Pending" tagClass="status-tag-pending" title="Pending Approval">
        <p>
          Your profile has been submitted. The WhatTheFind team will review it shortly.
          You'll be able to join auctions once approved.
        </p>
      </StatusScreen>
    )
  }

  if (status === 'rejected') {
    return (
      <StatusScreen tag="Not approved" tagClass="status-tag-rejected" title="Application Not Approved">
        <p>Your buyer application was not approved. Please contact WhatTheFind for more information.</p>
      </StatusScreen>
    )
  }

  if (status === 'blocked') {
    return (
      <StatusScreen tag="Suspended" tagClass="status-tag-blocked" title="Account Suspended">
        <p>Your account has been suspended. Please contact WhatTheFind.</p>
      </StatusScreen>
    )
  }

  // No profile yet — show the form
  return (
    <div className="page profile-page">
      <h2>Complete Your Buyer Profile</h2>
      <p className="profile-lead">
        Required before you can participate in auctions. Your card will be saved on file — you won't be charged until you win a bid.
      </p>

      <form onSubmit={handleSubmit} className="card profile-form">
        <h3>Personal Info</h3>

        <Field id="pf-name" label="Full name *">
          <input id="pf-name" autoComplete="name" value={form.full_name} onChange={set('full_name')} required />
        </Field>

        <Field id="pf-email" label="Email">
          <input id="pf-email" type="email" autoComplete="email" inputMode="email" value={form.email} onChange={set('email')} />
        </Field>

        <Field id="pf-phone" label="Phone *">
          <input id="pf-phone" type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={set('phone')} required />
        </Field>

        <h3>Shipping Address</h3>

        <Field id="pf-a1" label="Address line 1 *">
          <input id="pf-a1" autoComplete="address-line1" value={form.address_line1} onChange={set('address_line1')} required />
        </Field>

        <Field id="pf-a2" label="Address line 2">
          <input id="pf-a2" autoComplete="address-line2" value={form.address_line2} onChange={set('address_line2')} />
        </Field>

        <div className="profile-row">
          <Field id="pf-city" label="City *">
            <input id="pf-city" autoComplete="address-level2" value={form.city} onChange={set('city')} required />
          </Field>
          <Field id="pf-state" label="State *">
            <input id="pf-state" autoComplete="address-level1" value={form.state} onChange={set('state')} required maxLength={2} />
          </Field>
          <Field id="pf-zip" label="ZIP *">
            <input id="pf-zip" autoComplete="postal-code" inputMode="numeric" value={form.zip} onChange={set('zip')} required />
          </Field>
        </div>

        <Field id="pf-country" label="Country">
          <input id="pf-country" autoComplete="country" value={form.country} onChange={set('country')} />
        </Field>

        <h3>Payment Card</h3>
        <p className="profile-help">
          Your card is saved securely via Stripe. You won't be charged until you win a bid.
        </p>
        <div className="profile-card">
          <CardElement options={cardStyle()} />
        </div>

        {error && <p className="error-msg">{error}</p>}

        <button type="submit" className="btn-primary profile-submit" disabled={saving || !stripe}>
          {saving ? 'Submitting…' : 'Submit Profile & Save Card'}
        </button>
      </form>
    </div>
  )
}

export default function ProfileSetup() {
  return (
    <Elements stripe={stripePromise}>
      <ProfileForm />
    </Elements>
  )
}
