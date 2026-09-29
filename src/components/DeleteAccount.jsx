import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

// "Delete my account" (A5). Anonymise, don't erase: personal details go, records of past purchases stay.
// Needs the password and the word DELETE; the server refuses (with reasons) while something is still in progress.
export default function DeleteAccount() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reasons, setReasons] = useState([])

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError(''); setReasons([])
    try {
      await api.deleteAccount(password, confirm)
      for (const k of ['wtf_token', 'wtf_username', 'wtf_user_id']) localStorage.removeItem(k)
      navigate('/account-deleted', { replace: true })
    } catch (err) {
      setError(err.message || 'Could not delete your account')
      setReasons(err.reasons || [])
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card" style={{ marginTop: '2rem', borderColor: 'var(--danger, #b3261e)' }} aria-labelledby="delete-account-title">
      <h3 id="delete-account-title" style={{ marginTop: 0 }}>Delete my account</h3>
      <p style={{ fontSize: '0.9rem' }}>
        This removes your name, email, phone, address and saved card, signs you out everywhere, and replaces your
        username on past bids and messages with an anonymous one. Records of what you bought (items, amounts, dates and
        the shipping address used) are kept for accounting and tax. <strong>This can't be undone.</strong>
      </p>
      {!open ? (
        <button type="button" className="btn-danger" onClick={() => setOpen(true)}>Delete my account…</button>
      ) : (
        <form onSubmit={submit}>
          <div className="form-group">
            <label htmlFor="del-password">Your password</label>
            <input id="del-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <div className="form-group">
            <label htmlFor="del-confirm">Type DELETE to confirm</label>
            <input id="del-confirm" autoComplete="off" autoCapitalize="characters" value={confirm} onChange={e => setConfirm(e.target.value)} required />
          </div>
          {error && <p className="error-msg">{error}</p>}
          {reasons.length > 0 && (
            <ul style={{ fontSize: '0.85rem', margin: '0 0 1rem', paddingLeft: '1.2rem' }}>
              {reasons.map(r => <li key={r}>{r}</li>)}
            </ul>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="submit" className="btn-danger" disabled={busy || confirm !== 'DELETE' || !password}>
              {busy ? 'Deleting…' : 'Permanently delete my account'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => { setOpen(false); setPassword(''); setConfirm(''); setError(''); setReasons([]) }}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  )
}
