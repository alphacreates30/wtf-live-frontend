import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { fmtMoney } from './useRoomSocket'

// The pre-show checklist (brief step 2a), shown on the host's screen before Go live: camera, light and sound
// (checked on this device: a preview, the picture's brightness, the microphone's level), the lineup with its opening
// bids, and the test buyers in the room with whether each can bid. A draft show also gets its private rehearsal link
// here. Nothing is sent to viewers until Go live.
const DARK_LUMA = 60        // average brightness 0-255 below which the picture is too dark
const HEARD_LEVEL = 0.04    // microphone level (0-1, RMS) that counts as "we can hear you"

export default function LiveChecklist({ auction, st, controller, onGoLive, busy }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [link, setLink] = useState(null)
  const [copied, setCopied] = useState(false)
  const rehearsal = auction.status === 'draft'
  const preview = useRef(null)   // the device check's camera stream: stopped before Go live starts the show's own

  const load = () => api.getLiveChecklist(auction.id).then(setData).catch(e => setError(e.message))
  useEffect(() => { load() }, [auction.id])   // eslint-disable-line react-hooks/exhaustive-deps

  async function makeLink() {
    try {
      const r = await api.rotateRehearsalKey(auction.id)
      setLink(`${window.location.origin}${r.path}`); setCopied(false)
    } catch (e) { setError(e.message) }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true) } catch { /* the link is on screen to copy by hand */ }
  }

  return (
    <div className="lc card" role="region" aria-labelledby="lc-h">
      <h1 id="lc-h" className="lc-title">{rehearsal ? 'Rehearsal' : 'Before you go live'}</h1>
      <p className="lc-sub">{auction.title}{st.starts_at && !rehearsal ? ` · scheduled ${new Date(st.starts_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}</p>

      {!controller && <DeviceCheck stream={preview} />}
      {controller && <p className="lc-note">This is the controller: the camera, light and sound are checked on the phone that films.</p>}

      <section className="lc-section">
        <h2 className="lc-h2">Lineup and opening bids</h2>
        {!data ? <p className="lc-muted">{error || 'Loading…'}</p> : (
          <>
            <p className={data.lots.waiting ? '' : 'error-msg'}>
              {data.lots.waiting} lot{data.lots.waiting === 1 ? '' : 's'} to offer · default clock {data.show.clock_seconds} s · auto-pace {data.show.auto_pace ? 'on' : 'off'}
            </p>
            {data.lots.without_photo > 0 && <p className="lc-warn">{data.lots.without_photo} lot{data.lots.without_photo === 1 ? ' has' : 's have'} no photo.</p>}
            <ol className="lc-lineup">
              {data.lineup.slice(0, 8).map(l => (
                <li key={l.id}><span className="tabular">Lot {l.lot_number}</span> {l.title} <span className="lc-muted">· opens {fmtMoney(Math.max(l.starting_bid, 1))}{l.clock_seconds ? ` · ${l.clock_seconds} s` : ''}{l.sudden_death ? ' · sudden death' : ''}{l.pre_bid_count ? ` · ${l.pre_bid_count} pre-bid${l.pre_bid_count === 1 ? '' : 's'}` : ''}</span></li>
              ))}
            </ol>
            {data.lineup.length > 8 && <p className="lc-muted">and {data.lineup.length - 8} more</p>}
            <Link to={`/host/auction/${auction.id}/lots`} className="lc-link">Edit the lots</Link>
          </>
        )}
      </section>

      <section className="lc-section">
        <h2 className="lc-h2">Buyers in the room</h2>
        {!data ? null : data.buyers_in_room.length === 0
          ? <p className="lc-muted">Nobody is in the room yet.{rehearsal ? ' Send the rehearsal link to your test buyers.' : ''}</p>
          : (
            <table className="lc-buyers">
              <thead><tr><th scope="col">Buyer</th><th scope="col">Card</th><th scope="col">Terms</th></tr></thead>
              <tbody>
                {data.buyers_in_room.map(b => (
                  <tr key={b.username}>
                    <td>@{b.username}</td>
                    <td>{!b.approved ? 'Not approved' : b.card_verified ? 'Verified' : b.card ? 'Not verified' : 'No card'}</td>
                    <td>{b.terms ? 'Accepted' : 'Not yet'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        <button type="button" className="lc-link" onClick={load}>Refresh</button>
      </section>

      {rehearsal && (
        <section className="lc-section">
          <h2 className="lc-h2">Rehearsal link</h2>
          <p className="lc-muted">Only logged-in accounts with this link can join. The show stays hidden everywhere else. A new link shuts the old one.</p>
          {link && <p className="lc-linkbox"><code>{link}</code> <button type="button" className="lc-link" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button></p>}
          <button type="button" className="btn-ghost" onClick={makeLink}>{link || data?.show.has_rehearsal_link ? 'Make a new link' : 'Make the link'}</button>
        </section>
      )}

      {error && <p className="error-msg">{error}</p>}
      <button type="button" className="lh-primary lc-go" disabled={busy || !data?.lots.waiting} onClick={() => { for (const t of preview.current?.getTracks() || []) t.stop(); preview.current = null; onGoLive() }}>
        {busy ? '…' : rehearsal ? 'Start the rehearsal' : 'Go live'}
      </button>
    </div>
  )
}

// Camera, light and sound on this device: a preview, the picture's average brightness, the microphone's level.
// The stream stops when this unmounts (Go live starts the show's own camera).
function DeviceCheck({ stream }) {
  const video = useRef(null)
  const [state, setState] = useState({ started: false, error: '', light: null, heard: false, level: 0 })

  async function start() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true })
      stream.current = s
      if (video.current) video.current.srcObject = s
      setState(x => ({ ...x, started: true, error: '' }))
    } catch {
      setState(x => ({ ...x, error: 'Allow the camera and microphone for this site, then try again.' }))
    }
  }

  useEffect(() => {
    if (!state.started) return
    const s = stream.current
    const canvas = document.createElement('canvas')
    canvas.width = 32; canvas.height = 32
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    let audioCtx = null, analyser = null, buf = null
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 512
      audioCtx.createMediaStreamSource(s).connect(analyser)
      buf = new Float32Array(analyser.fftSize)
    } catch { /* no sound meter on this browser */ }
    const id = setInterval(() => {
      let light = null
      if (video.current?.readyState >= 2) {
        ctx.drawImage(video.current, 0, 0, 32, 32)
        const px = ctx.getImageData(0, 0, 32, 32).data
        let sum = 0
        for (let i = 0; i < px.length; i += 4) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]
        light = sum / (px.length / 4)
      }
      let level = 0
      if (analyser) {
        analyser.getFloatTimeDomainData(buf)
        level = Math.sqrt(buf.reduce((t, v) => t + v * v, 0) / buf.length)
      }
      setState(x => ({ ...x, light: light ?? x.light, level, heard: x.heard || level > HEARD_LEVEL }))
    }, 400)
    return () => { clearInterval(id); try { audioCtx?.close() } catch { /* closed */ } }
  }, [state.started])

  useEffect(() => () => { for (const t of stream.current?.getTracks() || []) t.stop() }, [])

  const lightOk = state.light !== null && state.light >= DARK_LUMA
  return (
    <section className="lc-section">
      <h2 className="lc-h2">Camera, light and sound</h2>
      <div className="lc-device">
        <video ref={video} className="lc-preview" autoPlay muted playsInline />
        {!state.started && <button type="button" className="btn-ghost lc-start" onClick={start}>Check the camera</button>}
      </div>
      {state.error && <p className="error-msg">{state.error}</p>}
      {state.started && (
        <ul className="lc-checks">
          <li className={state.light !== null ? 'lc-ok' : ''}>Camera: {state.light !== null ? 'working' : 'waiting for a picture…'}</li>
          <li className={lightOk ? 'lc-ok' : 'lc-warn'}>Light: {state.light === null ? '…' : lightOk ? 'good' : 'too dark. Add a lamp facing the lots.'}</li>
          <li className={state.heard ? 'lc-ok' : ''}>Sound: {state.heard ? 'we can hear you' : 'say something…'}
            <span className="lc-meter" aria-hidden="true"><span style={{ width: `${Math.min(100, Math.round(state.level * 400))}%` }} /></span></li>
        </ul>
      )}
    </section>
  )
}
