import { useRef, useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'

// A titled horizontal row. Phones swipe (scroll-snap, a third card peeking);
// wider screens also get arrow buttons. Renders nothing when empty - a rail is
// never shown empty. Children are the cards.
export default function Rail({ id, title, note, viewAllHref, count, children }) {
  const trackRef = useRef(null)
  const [edge, setEdge] = useState({ start: true, end: false, scrolls: false })

  const measure = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    setEdge({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2, scrolls: el.scrollWidth > el.clientWidth + 2 })
  }, [])

  useEffect(() => {
    measure()
    const raf = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', measure) }
  }, [measure, count])

  if (!count) return null

  function step(dir) {
    const el = trackRef.current
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: reduce ? 'auto' : 'smooth' })
  }

  return (
    <section className="rail" aria-labelledby={`${id}-h`}>
      <div className="rail-head">
        <h2 id={`${id}-h`} className="rail-title">
          {title}
          {note && <span className="rail-note">{note}</span>}
        </h2>
        <div className="rail-tools">
          {viewAllHref && <Link to={viewAllHref} className="rail-all">View all →</Link>}
          {edge.scrolls && <>
            <button type="button" className="rail-arrow" aria-label={`Scroll ${title} back`} onClick={() => step(-1)} disabled={edge.start}>‹</button>
            <button type="button" className="rail-arrow" aria-label={`Scroll ${title} forward`} onClick={() => step(1)} disabled={edge.end}>›</button>
          </>}
        </div>
      </div>
      <div className="rail-track" ref={trackRef} onScroll={measure}>
        {children}
      </div>
    </section>
  )
}
