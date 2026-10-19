import { useEffect, useState } from 'react'
import { pushKey, pushSupported, needsHomeScreen, currentSubscription, turnOn, turnOff } from './push'
import './push.css'

// "Turn on phone alerts" (live phase 6): logged in only, and only once the server has its keys (else nothing at all).
// On an iPhone that isn't running the site from the Home Screen, a short how-to instead. compact: the room's version.
export default function PhoneAlerts({ compact = false }) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('wtf_token') : null
  const [key, setKey] = useState(undefined)
  const [on, setOn] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let live = true
    pushKey().then(k => { if (live) setKey(k) })
    currentSubscription().then(s => { if (live) setOn(!!s) }).catch(() => { if (live) setOn(false) })
    return () => { live = false }
  }, [])

  if (!token || !key) return null
  if (needsHomeScreen()) {
    return (
      <div className={`pa${compact ? ' pa-compact' : ''}`}>
        <p className="pa-title">Phone alerts on iPhone</p>
        <p className="pa-text">Add What The Find to your Home Screen first: tap Share, then Add to Home Screen. Open it from there and turn on phone alerts.</p>
      </div>
    )
  }
  if (!pushSupported() || on === null) return null

  async function toggle() {
    setBusy(true); setMsg('')
    try {
      if (on) { await turnOff(); setOn(false); setMsg('Phone alerts are off on this device.') }
      else { await turnOn(); setOn(true); setMsg("Phone alerts are on. We'll tell this device when a show goes live.") }
    } catch (e) { setMsg(e.message || 'Phone alerts were not turned on.') }
    setBusy(false)
  }

  return (
    <div className={`pa${compact ? ' pa-compact' : ''}`}>
      {on
        ? <p className="pa-text">Phone alerts are on for this device. <button type="button" className="pa-link" disabled={busy} onClick={toggle}>Turn off</button></p>
        : <button type="button" className="btn-ghost pa-btn" disabled={busy} onClick={toggle}>{busy ? 'One moment…' : 'Turn on phone alerts'}</button>}
      {msg && <p className="pa-text" role="status">{msg}</p>}
    </div>
  )
}
