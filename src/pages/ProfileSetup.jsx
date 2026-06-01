import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { api } from '../api'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)

const CARD_STYLE = {
  style: {
    base: {
      color: '#e8e8e8',
      fontFamily: 'inherit',
      fontSize: '14px',
      '::placeholder': { color: '#666' },
    },
    invalid: { color: '#ff4444' },
  },
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
      // 1. Create SetupIntent + Stripe customer
      const { client_secret, customer_id } = await api.createSetupIntent()

      // 2. Confirm card setup
      const cardEl = elements.getElement(CardElement)
      const { setupIntent, error: stripeErr } = await stripe.confirmCardSetup(client_secret, {
        payment_method: {
          card: cardEl,
          billing_details: { name: form.full_name, email: form.email },
        },
      })
      if (stripeErr) { setError(stripeErr.message); setSaving(false); return }

      // 3. Save payment method ID to backend
      await api.savePaymentMethod(setupIntent.payment_method, customer_id)

      // 4. Save profile
      await api.saveProfile(form)
      setStatus('pending')
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="page"><p style={{ color: 'var(--text-muted)' }}>Loading…</p></div>

  if (status === 'approved') {
    return (
      <div className="page" style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center', paddingTop: '4rem' }}>
        <div style={{ fontSize: '3rem' }}>✅</div>
        <h2>Your account is approved!</h2>
        <p style={{ color: 'var(--text-muted)' }}>You can join and bid in live auctions.</p>
        <button className="btn-primary" onClick={() => navigate('/')}>Browse Auctions</button>
      </div>
    )
  }

  if (status === 'pending') {
    return (
      <div className="page" style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center', paddingTop: '4rem' }}>
        <div style={{ fontSize: '3rem' }}>⏳</div>
        <h2>Pending Approval</h2>
        <p style={{ color: 'var(--text-muted)' }}>
          Your profile has been submitted. The WhatTheFind team will review it shortly.
          You'll be able to join auctions once approved.
        </p>
      </div>
    )
  }

  if (status === 'rejected') {
    return (
      <div className="page" style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center', paddingTop: '4rem' }}>
        <div style={{ fontSize: '3rem' }}>❌</div>
        <h2>Application Not Approved</h2>
        <p style={{ color: 'var(--text-muted)' }}>
          Your buyer application was not approved. Please contact WhatTheFind for more information.
        </p>
      </div>
    )
  }

  if (status === 'blocked') {
    return (
      <div className="page" style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center', paddingTop: '4rem' }}>
        <div style={{ fontSize: '3rem' }}>🚫</div>
        <h2>Account Suspended</h2>
        <p style={{ color: 'var(--text-muted)' }}>Your account has been suspended. Please contact WhatTheFind.</p>
      </div>
    )
  }

  // No profile yet — show the form
  return (
    <div className="page" style={{ maxWidth: 520, margin: '0 auto', paddingTop: '2rem' }}>
      <h2 style={{ marginBottom: '0.25rem' }}>Complete Your Buyer Profile</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        Required before you can participate in auctions. Your card will be saved on file — you won't be charged until you win a bid.
      </p>

      <form onSubmit={handleSubmit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.5rem' }}>
        <h3 style={{ margin: '0 0 0.5rem' }}>Personal Info</h3>

        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Full name *
          <input className="input" value={form.full_name} onChange={set('full_name')} required style={{ display: 'block', width: '100%', marginTop: '0.25rem' }} />
        </label>

        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Email
          <input className="input" type="email" value={form.email} onChange={set('email')} style={{ display: 'block', width: '100%', marginTop: '0.25rem' }} />
        </label>

        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Phone *
          <input className="input" type="tel" value={form.phone} onChange={set('phone')} required style={{ display: 'block', width: '100%', marginTop: '0.25rem' }} />
        </label>

        <h3 style={{ margin: '0.5rem 0 0.25rem' }}>Shipping Address</h3>

        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Address line 1 *
          <input className="input" value={form.address_line1} onChange={set('address_line1')} required style={{ display: 'block', width: '100%', marginTop: '0.25rem' }} />
        </label>

        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Address line 2
          <input className="input" value={form.address_line2} onChange={set('address_line2')} style={{ display: 'block', width: '100%', marginTop: '0.25rem' }} />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>City *
            <input className="input" value={form.city} onChange={set('city')} required style={{ display: 'block', width: '100%', marginTop: '0.25rem' }} />
          </label>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>State *
            <input className="input" value={form.state} onChange={set('state')} required maxLength={2} style={{ display: 'block', width: '100%', marginTop: '0.25rem' }} />
          </label>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ZIP *
            <input className="input" value={form.zip} onChange={set('zip')} required style={{ display: 'block', width: '100%', marginTop: '0.25rem' }} />
          </label>
        </div>

        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Country
          <input className="input" value={form.country} onChange={set('country')} style={{ display: 'block', width: '100%', marginTop: '0.25rem' }} />
        </label>

        <h3 style={{ margin: '0.5rem 0 0.25rem' }}>Payment Card</h3>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 0.5rem' }}>
          Your card is saved securely via Stripe. You won't be charged until you win a bid.
        </p>
        <div style={{ background: 'var(--surface-2, #1a1a1a)', border: '1px solid var(--border, #333)', borderRadius: '6px', padding: '0.75rem' }}>
          <CardElement options={CARD_STYLE} />
        </div>

        {error && <p className="error-msg">{error}</p>}

        <button type="submit" className="btn-primary" disabled={saving || !stripe} style={{ marginTop: '0.5rem' }}>
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
