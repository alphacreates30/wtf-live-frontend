import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import '../watch/watch.css'

// The link in every reminder email. No login needed: the signed token says
// whose reminders these are. Opening the page changes nothing (mail scanners
// open links); the one button does it.
export default function Unsubscribe() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [info, setInfo] = useState(null)
  const [done, setDone] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { api.unsubscribeInfo(token).then(setInfo).catch(e => setError(e.message)) }, [token])

  async function confirm() {
    setBusy(true)
    try { setDone(await api.unsubscribe(token)) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="page prefs-page">
      <h1>Unsubscribe</h1>
      {error && <p className="error-msg">{error}</p>}
      {done && (
        <>
          <p className="success-msg" role="status">Done. You won't get {done.what} any more.</p>
          <p className="prefs-note">Changed your mind? Log in and turn them back on in <Link to="/notifications">email reminders</Link>. Outbid emails are separate.</p>
        </>
      )}
      {!done && info && (
        <>
          <p>Stop getting {info.what}?</p>
          <p style={{ marginTop: 'var(--space-4)' }}>
            <button type="button" className="btn-primary" onClick={confirm} disabled={busy}>{busy ? 'Unsubscribing…' : 'Unsubscribe'}</button>
          </p>
        </>
      )}
    </div>
  )
}
