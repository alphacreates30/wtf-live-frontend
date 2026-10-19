import { useEffect, useState } from 'react'
import { api } from '../api'
import PhoneAlerts from './PhoneAlerts'
import './push.css'

// The profile page's live show alerts (phase 6): "Tell me when any show goes live" (profiles.live_alerts, on by
// default; every alert email has a one-click way out too), and phone alerts for this device. Hidden before the
// server has the setting (migration ze).
export default function LiveAlertsCard() {
  const [state, setState] = useState(null)
  const [msg, setMsg] = useState('')
  useEffect(() => { api.getLiveAlerts().then(setState).catch(() => setState(null)) }, [])
  if (!state || !state.available) return null
  async function change(v) {
    setMsg('')
    const before = state
    setState({ ...state, live_alerts: v })
    try { setState(await api.setLiveAlerts(v)); setMsg('Saved.') } catch (e) { setState(before); setMsg(e.message) }
  }
  return (
    <section className="card live-alerts" aria-labelledby="live-alerts-h">
      <h2 id="live-alerts-h" className="live-alerts-title">Live shows</h2>
      <label className="live-alerts-row">
        <input type="checkbox" checked={!!state.live_alerts} onChange={e => change(e.target.checked)} />
        <span><strong>Tell me when any show goes live</strong><span className="pa-text live-alerts-hint">An email the moment a show starts. Shows you follow always tell you.</span></span>
      </label>
      {msg && <p className="pa-text" role="status">{msg}</p>}
      <PhoneAlerts />
    </section>
  )
}
