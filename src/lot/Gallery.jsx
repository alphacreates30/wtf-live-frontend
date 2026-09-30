import { useRef, useState, useEffect, useCallback } from 'react'
import PhotoPlaceholder from '../components/PhotoPlaceholder'

// A lot's photos, full size (the lot page is the one place that shows the full photo; F1a). Phones swipe
// (scroll-snap); wider screens also get arrows and a thumbnail strip. Tapping a photo opens it full screen:
// click to zoom there on desktop, pinch on phones. No photo: the placeholder tile.
export default function Gallery({ photos, title, placeholderLabel, seed }) {
  const trackRef = useRef(null)
  const [active, setActive] = useState(0)
  const [zoomed, setZoomed] = useState(null)   // index open full screen, or null
  const n = photos.length

  useEffect(() => { setActive(0); if (trackRef.current) trackRef.current.scrollLeft = 0 }, [photos[0]?.url])

  const onScroll = useCallback(() => {
    const el = trackRef.current
    if (el && el.clientWidth) setActive(Math.round(el.scrollLeft / el.clientWidth))
  }, [])

  function go(i) {
    const el = trackRef.current
    if (!el) return
    const to = Math.max(0, Math.min(n - 1, i))
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ left: to * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' })
    setActive(to)
  }

  if (!n) {
    return (
      <div className="lp-gallery">
        <div className="lp-stage lp-stage-empty"><PhotoPlaceholder label={placeholderLabel || 'Photo coming soon'} seed={seed} size="lg" /></div>
      </div>
    )
  }

  return (
    <div className="lp-gallery" aria-roledescription="carousel" aria-label={`Photos of ${title}`}>
      <div className="lp-stage">
        <div className="lp-track" ref={trackRef} onScroll={onScroll} tabIndex={-1}>
          {photos.map((p, i) => (
            <button type="button" key={p.url + i} className="lp-slide" onClick={() => setZoomed(i)}
              aria-label={`Photo ${i + 1} of ${n}: open full screen`}>
              <img
                src={p.url}
                srcSet={p.thumb_url ? `${p.thumb_url} 480w, ${p.url} 2400w` : undefined}
                sizes="(min-width: 960px) 600px, 100vw"
                alt={i === 0 ? title : ''}
                width="1200" height="900"
                loading={i === 0 ? 'eager' : 'lazy'}
                fetchpriority={i === 0 ? 'high' : undefined}
                decoding="async"
              />
            </button>
          ))}
        </div>
        {n > 1 && <>
          <button type="button" className="lp-arrow lp-arrow-prev" onClick={() => go(active - 1)} disabled={active === 0} aria-label="Previous photo">‹</button>
          <button type="button" className="lp-arrow lp-arrow-next" onClick={() => go(active + 1)} disabled={active === n - 1} aria-label="Next photo">›</button>
          <span className="lp-count tabular" aria-live="polite">{active + 1} / {n}</span>
        </>}
      </div>
      {n > 1 && (
        <div className="lp-thumbs" role="group" aria-label="Choose a photo">
          {photos.map((p, i) => (
            <button type="button" key={p.url + i} className={`lp-thumb${i === active ? ' on' : ''}`} aria-pressed={i === active}
              aria-label={`Show photo ${i + 1}`} onClick={() => go(i)}>
              <img src={p.thumb_url || p.url} alt="" loading="lazy" decoding="async" width="80" height="60" />
            </button>
          ))}
        </div>
      )}
      {zoomed != null && <Lightbox photos={photos} start={zoomed} title={title} onClose={i => { setZoomed(null); go(i) }} />}
    </div>
  )
}

function Lightbox({ photos, start, title, onClose }) {
  const [i, setI] = useState(start)
  const [zoom, setZoom] = useState(null)       // { x, y } in % when zoomed in (desktop click)
  const closeRef = useRef(null)
  const n = photos.length
  // The page re-renders every second (its countdown), handing a new onClose each time: keep the latest in a ref
  // so the effect below runs once and never steals focus back mid-use.
  const latest = useRef({ onClose, i })
  latest.current = { onClose, i }

  useEffect(() => {
    closeRef.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const key = e => {
      if (e.key === 'Escape') latest.current.onClose(latest.current.i)
      if (e.key === 'ArrowLeft') { setI(v => Math.max(0, v - 1)); setZoom(null) }
      if (e.key === 'ArrowRight') { setI(v => Math.min(n - 1, v + 1)); setZoom(null) }
    }
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev }
  }, [n])

  function toggleZoom(e) {
    // Touch screens pinch instead (the browser's own zoom); a tap there does nothing.
    if (e.nativeEvent.pointerType === 'touch') return
    if (zoom) { setZoom(null); return }
    const r = e.currentTarget.getBoundingClientRect()
    setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 })
  }

  return (
    <div className="lp-lightbox" role="dialog" aria-modal="true" aria-label={`${title}: photo ${i + 1} of ${n}`}>
      <button type="button" ref={closeRef} className="lp-lb-close" onClick={() => onClose(i)} aria-label="Close photo">✕</button>
      <div className="lp-lb-stage">
        <img
          src={photos[i].url}
          alt={title}
          className={zoom ? 'zoomed' : ''}
          style={zoom ? { transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
          onClick={toggleZoom}
        />
      </div>
      {n > 1 && <>
        <button type="button" className="lp-arrow lp-arrow-prev lp-lb-arrow" onClick={() => { setI(i - 1); setZoom(null) }} disabled={i === 0} aria-label="Previous photo">‹</button>
        <button type="button" className="lp-arrow lp-arrow-next lp-lb-arrow" onClick={() => { setI(i + 1); setZoom(null) }} disabled={i === n - 1} aria-label="Next photo">›</button>
      </>}
      <p className="lp-lb-hint">{n > 1 ? `${i + 1} / ${n} · ` : ''}<span className="lp-lb-hint-desk">Click to zoom</span><span className="lp-lb-hint-touch">Pinch to zoom</span></p>
    </div>
  )
}
