import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { resizeImageToBlob } from '../imageResize'
import { CONTACT_EMAIL } from './home/links'
import { SERVICE_OPTIONS, ITEM_COUNT_OPTIONS } from '../services/content'

// The one request form (SERVICES_BRIEF.md §3), on every Services page (pre-set to that service) and on Contact
// (pre-set to "General question"). POST /service-requests; the server checks everything again.
const MAX_PHOTOS = 10
const THANKS = "Thanks, we'll be in touch within 72 hours."

// The same rule as the server: a US number, 10 digits after an optional leading 1.
function usPhoneOk(v) {
  let d = String(v || '').replace(/\D/g, '')
  if (d.length === 11 && d[0] === '1') d = d.slice(1)
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(d) && d.slice(1, 3) !== '11'
}

export default function RequestForm({ service = 'general', about = '' }) {
  const [f, setF] = useState({ service, name: '', email: '', phone: '', location: '', details: about ? `${about}\n\n` : '', item_count: '', heard_from: '', website: '' })
  const [photos, setPhotos] = useState([])   // { id, file, url }
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [state, setState] = useState('editing')   // editing | sending | sent | unavailable
  const fileRef = useRef(null)
  const doneRef = useRef(null)

  useEffect(() => { setF(x => ({ ...x, service })) }, [service])
  useEffect(() => () => photos.forEach(p => URL.revokeObjectURL(p.url)), [])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (state === 'sent' || state === 'unavailable') doneRef.current?.focus() }, [state])

  const set = k => e => { setF(x => ({ ...x, [k]: e.target.value })); if (errors[k]) setErrors(x => ({ ...x, [k]: '' })) }

  function addPhotos(e) {
    const picked = Array.from(e.target.files || [])
    e.target.value = ''
    const room = MAX_PHOTOS - photos.length
    const ok = picked.filter(file => /^image\/(jpeg|png|webp)$/i.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name))
    const next = ok.slice(0, room).map(file => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }))
    setPhotos(p => [...p, ...next])
    setErrors(x => ({ ...x, photos: ok.length < picked.length ? 'Only JPEG, PNG or WebP photos can be added.'
      : picked.length > room ? `You can send up to ${MAX_PHOTOS} photos.` : '' }))
  }
  function removePhoto(id) {
    setPhotos(p => { const gone = p.find(x => x.id === id); if (gone) URL.revokeObjectURL(gone.url); return p.filter(x => x.id !== id) })
    setErrors(x => ({ ...x, photos: '' }))
  }

  function check() {
    const e = {}
    if (!f.name.trim()) e.name = 'Enter your name.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter a valid email address.'
    if (!usPhoneOk(f.phone)) e.phone = 'Enter a valid US phone number, with the area code.'
    if (!f.details.trim()) e.details = 'Tell us a little about what you have.'
    return e
  }

  async function submit(e) {
    e.preventDefault()
    setFormError('')
    const found = check()
    setErrors(found)
    if (Object.keys(found).length) {
      document.getElementById(`rf-${Object.keys(found)[0]}`)?.focus()
      return
    }
    setState('sending')
    try {
      const fd = new FormData()
      for (const [k, v] of Object.entries(f)) fd.append(k, typeof v === 'string' ? v.trim() : v)
      for (const p of photos) {
        const blob = await resizeImageToBlob(p.file, 2000, 0.85)
        fd.append('photos', blob, p.file.name.replace(/\.[^.]+$/, '') + (blob.type === 'image/png' ? '.png' : blob.type === 'image/webp' ? '.webp' : '.jpg'))
      }
      await api.sendServiceRequest(fd)
      setState('sent')
    } catch (err) {
      if (err.code === 'not_available') { setState('unavailable'); return }
      setState('editing')
      if (err.field) { setErrors(x => ({ ...x, [err.field]: err.message })); document.getElementById(`rf-${err.field}`)?.focus() }
      else setFormError(err.message)
    }
  }

  if (state === 'sent') {
    return <div className="rf-done success-msg" role="status" tabIndex={-1} ref={doneRef}>{THANKS}</div>
  }
  if (state === 'unavailable') {
    return (
      <div className="rf-done card" role="status" tabIndex={-1} ref={doneRef}>
        The request form isn't open yet. Please email us at <strong className="rf-email">{CONTACT_EMAIL}</strong> instead.
      </div>
    )
  }

  const err = k => errors[k] ? <p className="rf-error" id={`rf-${k}-err`}>{errors[k]}</p> : null
  const aria = k => ({ 'aria-invalid': !!errors[k] || undefined, 'aria-describedby': errors[k] ? `rf-${k}-err` : undefined })

  return (
    <form className="rf" onSubmit={submit} noValidate>
      <div className="rf-field">
        <label htmlFor="rf-service">What can we help with?</label>
        <select id="rf-service" value={f.service} onChange={set('service')} {...aria('service')}>
          {SERVICE_OPTIONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        {err('service')}
      </div>

      <div className="rf-row">
        <div className="rf-field">
          <label htmlFor="rf-name">Name</label>
          <input id="rf-name" autoComplete="name" value={f.name} onChange={set('name')} maxLength={120} {...aria('name')} />
          {err('name')}
        </div>
        <div className="rf-field">
          <label htmlFor="rf-location">City or ZIP <span className="rf-opt">(optional)</span></label>
          <input id="rf-location" autoComplete="postal-code" value={f.location} onChange={set('location')} maxLength={120} {...aria('location')} />
          {err('location')}
        </div>
      </div>

      <div className="rf-row">
        <div className="rf-field">
          <label htmlFor="rf-email">Email</label>
          <input id="rf-email" type="email" autoComplete="email" value={f.email} onChange={set('email')} maxLength={254} {...aria('email')} />
          {err('email')}
        </div>
        <div className="rf-field">
          <label htmlFor="rf-phone">Phone</label>
          <input id="rf-phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="(555) 555-5555" value={f.phone} onChange={set('phone')} maxLength={30} {...aria('phone')} />
          {err('phone')}
        </div>
      </div>

      <div className="rf-field">
        <label htmlFor="rf-details">What do you have?</label>
        <textarea id="rf-details" rows={5} value={f.details} onChange={set('details')} maxLength={4000} {...aria('details')} />
        {err('details')}
      </div>

      <div className="rf-row">
        <div className="rf-field">
          <label htmlFor="rf-item_count">Roughly how many items? <span className="rf-opt">(optional)</span></label>
          <select id="rf-item_count" value={f.item_count} onChange={set('item_count')} {...aria('item_count')}>
            <option value="">Choose…</option>
            {ITEM_COUNT_OPTIONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          {err('item_count')}
        </div>
        <div className="rf-field">
          <label htmlFor="rf-heard_from">How did you hear about us? <span className="rf-opt">(optional)</span></label>
          <input id="rf-heard_from" value={f.heard_from} onChange={set('heard_from')} maxLength={200} {...aria('heard_from')} />
          {err('heard_from')}
        </div>
      </div>

      <div className="rf-field">
        <span className="rf-label" id="rf-photos-label">Photos <span className="rf-opt">(optional, up to {MAX_PHOTOS})</span></span>
        {photos.length > 0 && (
          <ul className="rf-photos" aria-labelledby="rf-photos-label">
            {photos.map((p, i) => (
              <li key={p.id} className="rf-photo">
                <img src={p.url} alt={`Photo ${i + 1}`} />
                <button type="button" className="rf-photo-remove" onClick={() => removePhoto(p.id)} aria-label={`Remove photo ${i + 1}`}>×</button>
              </li>
            ))}
          </ul>
        )}
        {photos.length < MAX_PHOTOS && (
          <>
            <input ref={fileRef} id="rf-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple className="visually-hidden" onChange={addPhotos} {...aria('photos')} />
            <button type="button" className="btn-ghost rf-add" onClick={() => fileRef.current?.click()}>
              {photos.length ? 'Add more photos' : 'Add photos'}
            </button>
          </>
        )}
        {err('photos')}
      </div>

      {/* Honeypot: hidden from people (and screen readers); a bot that fills it is answered and ignored. */}
      <div className="rf-hp" aria-hidden="true">
        <label htmlFor="rf-website">Website</label>
        <input id="rf-website" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} />
      </div>

      <p className="rf-consent">
        By sending this, you agree we can use these details and photos to answer your request. We never share them or show them on the site.
        {' '}<a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>
      </p>

      {formError && <p className="error-msg" role="alert">{formError}</p>}
      <button type="submit" className="btn-primary rf-submit" disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending…' : 'Send'}
      </button>
    </form>
  )
}
