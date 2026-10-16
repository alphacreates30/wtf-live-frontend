import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { SERVICE_OPTIONS, ITEM_COUNT_OPTIONS, STATUS_LABELS } from '../services/content'
import './AdminRequests.css'

// Admin -> Requests (SERVICES_BRIEF.md §3): what people sent through the Services and Contact form. Filter by
// service and status; set the status and notes; see the photos (signed links, valid 10 minutes: reload for new
// ones); delete a request (its photos go with it). ?id=<request> shows one (the link in the notification email).
const SERVICE_LABEL = Object.fromEntries(SERVICE_OPTIONS)
const COUNT_LABEL = Object.fromEntries(ITEM_COUNT_OPTIONS)
const when = iso => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function AdminRequests() {
  const [params, setParams] = useSearchParams()
  const service = params.get('service') || ''
  const status = params.get('status') || ''
  const id = params.get('id') || ''
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    setError('')
    try { setData(await api.getServiceRequests({ service, status, id })) } catch (err) { setError(err.message) }
  }
  useEffect(() => { load() }, [service, status, id])   // eslint-disable-line react-hooks/exhaustive-deps

  function pick(key, value) {
    const next = new URLSearchParams(params)
    next.delete('id')
    if (value) next.set(key, value); else next.delete(key)
    setParams(next, { replace: true })
  }
  const replaceRow = row => setData(d => ({ ...d, requests: d.requests.map(r => (r.id === row.id ? row : r)) }))
  const dropRow = rid => setData(d => ({ ...d, requests: d.requests.filter(r => r.id !== rid) }))

  return (
    <div className="page arq">
      <h1 className="arq-title">Requests</h1>
      <p className="arq-sub">From the Services pages and Contact.{data?.available ? ` ${data.new_count} new.` : ''}</p>

      <div className="arq-filters" role="group" aria-label="Filter by service">
        <Chip on={!service} onClick={() => pick('service', '')}>All services</Chip>
        {SERVICE_OPTIONS.map(([k, label]) => <Chip key={k} on={service === k} onClick={() => pick('service', k)}>{label}</Chip>)}
      </div>
      <div className="arq-filters" role="group" aria-label="Filter by status">
        <Chip on={!status} onClick={() => pick('status', '')}>Any status</Chip>
        {Object.entries(STATUS_LABELS).map(([k, label]) => <Chip key={k} on={status === k} onClick={() => pick('status', k)}>{label}</Chip>)}
      </div>
      {id && <p className="arq-one">Showing one request. <button className="arq-textbtn" onClick={() => pick('id', '')}>Show all</button></p>}

      {error && <p className="error-msg">{error}</p>}
      {data && data.available === false && <p className="arq-empty">Requests aren't switched on yet (the database change for them hasn't been applied).</p>}
      {data?.available && data.requests.length === 0 && <p className="arq-empty">No requests{service || status ? ' match these filters' : ' yet'}.</p>}
      <ul className="arq-list">
        {data?.requests?.map(r => <RequestCard key={r.id} r={r} onChange={replaceRow} onDelete={dropRow} onError={setError} />)}
      </ul>
    </div>
  )
}

function Chip({ on, onClick, children }) {
  return <button type="button" className={`arq-chip ${on ? "arq-chip-on" : ""}`} aria-pressed={on} onClick={onClick}>{children}</button>
}

function RequestCard({ r, onChange, onDelete, onError }) {
  const [notes, setNotes] = useState(r.notes || '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState('')

  async function save(patch, what) {
    setBusy(true); setSaved(''); onError('')
    try { onChange(await api.updateServiceRequest(r.id, patch)); setSaved(what) } catch (err) { onError(err.message) } finally { setBusy(false) }
  }
  async function remove() {
    if (!confirm(`Delete the request from ${r.name}? Its photos are deleted too. This can't be undone.`)) return
    setBusy(true); onError('')
    try { await api.deleteServiceRequest(r.id); onDelete(r.id) } catch (err) { onError(err.message); setBusy(false) }
  }

  return (
    <li className={`card arq-card ${r.status === 'new' ? 'arq-card-new' : ''}`}>
      <div className="arq-top">
        <div>
          <span className="badge">{SERVICE_LABEL[r.service] || r.service}</span>
          <h2 className="arq-name">{r.name}</h2>
          <p className="arq-when">{when(r.created_at)}</p>
        </div>
        <label className="arq-status">
          <span className="wtf-label">Status</span>
          <select value={r.status} disabled={busy} onChange={e => save({ status: e.target.value }, 'Status saved')}>
            {Object.entries(STATUS_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
      </div>

      <dl className="arq-facts">
        <div><dt>Email</dt><dd className="arq-select">{r.email}</dd></div>
        <div><dt>Phone</dt><dd><a href={`tel:+1${r.phone}`}>{r.phone_display}</a></dd></div>
        {r.location && <div><dt>City / ZIP</dt><dd>{r.location}</dd></div>}
        {r.item_count && <div><dt>How many</dt><dd>{COUNT_LABEL[r.item_count] || r.item_count}</dd></div>}
        {r.heard_from && <div><dt>Heard about us</dt><dd>{r.heard_from}</dd></div>}
      </dl>
      <p className="arq-details">{r.details}</p>

      {r.photos.length > 0 && (
        <ul className="arq-photos" aria-label="Photos">
          {r.photos.map((p, i) => (
            <li key={p.path}>
              {p.url
                ? <a href={p.url} target="_blank" rel="noreferrer noopener"><img src={p.url} alt={`Photo ${i + 1} from ${r.name}`} loading="lazy" /></a>
                : <span className="arq-nophoto">Photo {i + 1} unavailable</span>}
            </li>
          ))}
        </ul>
      )}

      <label className="arq-notes">
        <span className="wtf-label">Notes</span>
        <textarea rows={2} value={notes} maxLength={4000} onChange={e => setNotes(e.target.value)} />
      </label>
      <div className="arq-actions">
        <button className="btn-ghost" disabled={busy || notes === (r.notes || '')} onClick={() => save({ notes }, 'Notes saved')}>Save notes</button>
        <button className="btn-ghost arq-delete" disabled={busy} onClick={remove}>Delete</button>
        {saved && <span className="arq-saved" role="status">{saved}</span>}
      </div>
    </li>
  )
}
