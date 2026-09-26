import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import './Login.css'

// The server answers the same whether or not the username/email exists, so
// this page never says "no such account" - that would let anyone probe who
// has one.
export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.forgotPassword(identifier.trim())
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card card">
        <h2 className="login-heading">Forgot your password?</h2>
        {sent ? (
          <>
            <p className="login-sub login-sub-left">
              If an account matches <strong>{identifier.trim()}</strong>, we've emailed it a link to set a new
              password. The link works once, for 1 hour. Check your spam folder if it doesn't arrive in a few minutes.
            </p>
            <p className="login-sub login-sub-left">
              No longer have access to that email? Contact WhatTheFind and we can set a temporary password for you.
            </p>
            <Link to="/login" className="btn-primary login-submit login-link-btn">Back to log in</Link>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            <p className="login-sub login-sub-left">Enter your username or the email on your account and we'll send you a reset link.</p>
            <div className="form-group">
              <label htmlFor="forgot-id">Username or email</label>
              <input
                id="forgot-id"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                required
              />
            </div>
            {error && <p className="error-msg">{error}</p>}
            <button type="submit" className="btn-primary login-submit" disabled={loading}>
              {loading ? 'Please wait…' : 'Send reset link'}
            </button>
            <Link to="/login" className="login-forgot">Back to log in</Link>
          </form>
        )}
      </div>
    </div>
  )
}
