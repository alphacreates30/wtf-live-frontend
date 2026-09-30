import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import './preview.css'

// Admin-only "Preview with sample auctions" (PREVIEW_MODE_BRIEF.md). Shows the
// homepage and the auctions list with SAMPLE data built into the page, so Albert
// can see the design with auctions in it before any real one exists. Nothing is
// written anywhere and no API call changes; the sample data (src/preview/
// sampleData.js) only loads when preview is on. Remembered for this browser tab
// in sessionStorage. Everyone else - logged out, buyers, /?preview=sample in their
// address bar - sees exactly the normal page.
const KEY = 'wtf_preview'
const COUNTS = [1, 3, 5, 0]
const Ctx = createContext({ active: false, isAdmin: false })

const isAdminNow = () => !!localStorage.getItem('wtf_token') && localStorage.getItem('wtf_username') === 'whatthefind'
function readState() {
  try { const s = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return s && typeof s === 'object' ? s : { on: false, count: 3 } } catch { return { on: false, count: 3 } }
}

export function PreviewProvider({ children }) {
  const location = useLocation()
  const [params] = useSearchParams()
  const [isAdmin, setIsAdmin] = useState(isAdminNow)
  const [state, setState] = useState(readState)
  const [toast, setToast] = useState('')
  const timer = useRef(null)

  useEffect(() => { setIsAdmin(isAdminNow()) }, [location.pathname])

  const save = useCallback(next => {
    setState(next)
    try { sessionStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private mode: lasts until reload */ }
  }, [])

  // /?preview=sample switches it on - for the admin only; for anyone else it does nothing.
  useEffect(() => {
    if (params.get('preview') === 'sample' && isAdminNow() && !readState().on) save({ ...readState(), on: true })
  }, [params, save])

  const note = useCallback(msg => {
    setToast(msg)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(''), 2500)
  }, [])

  const active = isAdmin && state.on
  const value = {
    isAdmin, active, count: COUNTS.includes(state.count) ? state.count : 3, counts: COUNTS,
    turnOn: () => save({ ...state, on: true }), turnOff: () => save({ ...state, on: false }),
    setCount: count => save({ ...state, count }),
    // Taps on sample cards go nowhere real.
    blockSampleClick: e => {
      if (!active) return
      const hit = e.target.closest('a[href], .watch-btn, .su button')
      if (!hit || hit.closest('.preview-bar, .preview-switch')) return
      e.preventDefault(); e.stopPropagation()
      note(hit.matches('a') ? 'Sample lot, preview only' : 'Disabled in preview')
    },
  }
  const onPreviewPage = location.pathname === '/' || location.pathname === '/auctions'
  return (
    <Ctx.Provider value={value}>
      {active && onPreviewPage && <PreviewBar value={value} />}
      {children}
      {toast && <div className="preview-toast" role="status">{toast}</div>}
    </Ctx.Provider>
  )
}

export function usePreview() {
  return useContext(Ctx)
}

function PreviewBar({ value }) {
  const label = n => (n === 0 ? 'Nothing open' : n === 1 ? '1 auction' : `${n} auctions`)
  return (
    <div className="preview-bar" role="region" aria-label="Preview">
      <p className="preview-text"><strong>Preview:</strong> sample auctions, only you can see this.</p>
      <button type="button" className="preview-off" onClick={value.turnOff}>Turn off</button>
      <div className="preview-counts" role="group" aria-label="How many open auctions">
        {value.counts.map(n => (
          <button key={n} type="button" className={`preview-count${value.count === n ? ' on' : ''}`} aria-pressed={value.count === n} onClick={() => value.setCount(n)}>
            {label(n)}
          </button>
        ))}
      </div>
    </div>
  )
}

// The admin's switch on the homepage and the auctions list (only when preview is off).
export function PreviewSwitch() {
  const p = usePreview()
  if (!p.isAdmin || p.active) return null
  return (
    <div className="preview-switch">
      <button type="button" className="btn-ghost" onClick={p.turnOn}>Preview with sample auctions</button>
      <span>Only you can see it. Nothing is saved.</span>
    </div>
  )
}
