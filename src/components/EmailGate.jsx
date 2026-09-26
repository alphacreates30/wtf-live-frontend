import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api'
import '../pages/Login.css'

// Every account needs an email - it's how a forgotten password gets reset.
// Accounts made before that was required are stopped here, once, until they
// add one. Fails open: if the check itself can't run (offline, server
// mid-deploy), the site stays usable and the gate asks again next visit.
const EXEMPT = ['/login', '/terms', '/forgot-password', '/reset-password']

export default function EmailGate({ children }) {
  const token = localStorage.getItem('wtf_token')
  const { pathname } = useLocation()
  const [needsEmail, setNeedsEmail] = useState(false)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!token) { setNeedsEmail(false); return }
    let live = true
    api.getMe()
      .then(me => { if (live) setNeedsEmail(!me?.email) })
      .catch(() => { if (live) setNeedsEmail(false) })
    return () => { live = false }
  }, [token])

  if (!token || !needsEmail || EXEMPT.includes(pathname)) return children

  async function save(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.setEmail(email.trim())
      setNeedsEmail(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card card">
        <h2 className="login-heading">Add your email</h2>
        <p className="login-sub login-sub-left">
          Every WhatTheFind account now needs an email address. It's how you reset your password if you
          ever forget it. We'll only use it for your account and your auctions.
        </p>
        <form onSubmit={save} className="login-form">
          <div className="form-group">
            <label htmlFor="gate-email">Email</label>
            <input id="gate-email" type="email" autoComplete="email" inputMode="email"
              value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" className="btn-primary login-submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save and continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
