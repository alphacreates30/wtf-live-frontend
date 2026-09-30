import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import '../watch/watch.css'

const KINDS = [
  ['lot_closing', 'A watched lot closes within the hour', 'One email listing every watched lot closing in the next hour, with the price and whether you\'re winning.'],
  ['auction_open', 'A followed auction opens', 'With a few photos, the number of lots and when it ends.'],
  ['auction_closing', 'A followed auction closes tomorrow', 'The day before its first lot closes, with its most bid-on lots.'],
]

// GET/PUT /me/notification-prefs. Outbid emails are separate and stay on.
export default function NotificationPrefs() {
  const [prefs, setPrefs] = useState(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  useEffect(() => { api.getNotificationPrefs().then(setPrefs).catch(e => setError(e.message)) }, [])

  async function change(kind, value) {
    setSaved(''); setError('')
    const before = prefs
    setPrefs({ ...prefs, [kind]: value })
    try { setPrefs(await api.setNotificationPrefs({ [kind]: value })); setSaved('Saved.') }
    catch (e) { setPrefs(before); setError(e.message) }
  }

  return (
    <div className="page prefs-page">
      <h1>Email reminders</h1>
      <p className="prefs-note">For lots you <Link to="/watching">watch</Link> and auctions you follow. Each reminder is sent once.</p>
      {error && <p className="error-msg">{error}</p>}
      {!prefs && !error && <p className="prefs-note">Loading…</p>}
      {prefs && (
        <ul className="prefs-list">
          {KINDS.map(([k, title, text]) => (
            <li key={k} className="prefs-item">
              <label>
                <input type="checkbox" checked={!!prefs[k]} onChange={e => change(k, e.target.checked)} />
                <span><strong>{title}</strong><span>{text}</span></span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="prefs-note" role="status">{saved}</p>
      <p className="prefs-note">Outbid emails are separate: you always get one when someone outbids you.</p>
    </div>
  )
}
