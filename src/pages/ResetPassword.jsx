import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import './Login.css'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [done, setDone] = useState(null)   // username once reset
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError("The two passwords don't match."); return }
    setLoading(true)
    try {
      const r = await api.resetPassword(token, password)
      setDone(r.username)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card card">
        <h2 className="login-heading">Set a new password</h2>
        {!token ? (
          <>
            <p className="login-sub login-sub-left">This link is incomplete. Open the link from your email again, or request a new one.</p>
            <Link to="/forgot-password" className="btn-primary login-submit login-link-btn">Request a new link</Link>
          </>
        ) : done ? (
          <>
            <p className="login-sub login-sub-left">Your password has been changed. Log in as <strong>{done}</strong> with your new password.</p>
            <Link to="/login" className="btn-primary login-submit login-link-btn">Log in</Link>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="reset-pw">New password</label>
              <input id="reset-pw" type="password" autoComplete="new-password" minLength={6}
                value={password} onChange={e => setPassword(e.target.value)} required />
              <span className="login-hint">At least 6 characters.</span>
            </div>
            <div className="form-group">
              <label htmlFor="reset-pw2">Confirm new password</label>
              <input id="reset-pw2" type="password" autoComplete="new-password" minLength={6}
                value={confirm} onChange={e => setConfirm(e.target.value)} required />
            </div>
            {error && <p className="error-msg">{error}</p>}
            {error && /expired|already used/i.test(error) && (
              <Link to="/forgot-password" className="login-forgot">Request a new link</Link>
            )}
            <button type="submit" className="btn-primary login-submit" disabled={loading}>
              {loading ? 'Please wait…' : 'Set new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
