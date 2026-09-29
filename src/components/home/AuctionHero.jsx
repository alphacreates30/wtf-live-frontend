import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import CountdownTiles from './CountdownTiles'
import SignupForm from './SignupForm'

// The featured collection (GET /home `featured`), in one of three states:
// live, opening soon, or nothing (the Glint asleep + email sign-up).
// Plain props; the page decides nothing here beyond which state to draw.
export default function AuctionHero({ featured, now }) {
  if (!featured) {
    return (
      <section className="hero hero-asleep" aria-labelledby="hero-h">
        <div className="hero-text">
          <img src="/brand/state-asleep.svg" alt="" width="72" height="72" className="hero-asleep-mark" />
          <h1 id="hero-h" className="hero-title hero-title-asleep">The next collection is being catalogued.</h1>
          <p className="hero-desc">Leave your email and we'll wake you when it opens.</p>
          <div id="signup"><SignupForm tone="dark" /></div>
        </div>
      </section>
    )
  }

  const live = featured.status === 'live'
  const lots = featured.lot_count === 1 ? '1 lot' : `${featured.lot_count} lots`

  return (
    <section className="hero" aria-labelledby="hero-h">
      {featured.images.length > 0 && <Collage images={featured.images} title={featured.title} />}
      <div className="hero-text">
        <p className="hero-eyebrow">
          {live ? <><span className="hero-dot" aria-hidden="true">●</span> Live now · {lots}</> : <>Opening soon · {lots}</>}
        </p>
        <h1 id="hero-h" className="hero-title">{featured.title}</h1>
        {featured.description && <p className="hero-desc hero-desc-clamp">{featured.description}</p>}
        {live
          ? featured.ends_at && <CountdownTiles target={featured.ends_at} now={now} label="Ends in" />
          : featured.starts_at && <CountdownTiles target={featured.starts_at} now={now} label="Opens in" />}
        <div className="hero-actions">
          <Link to={`/auction/${featured.id}`} className="btn-primary hero-cta">{live ? 'Bid now' : 'Preview lots'}</Link>
        </div>
      </div>
    </section>
  )
}

// Desktop: one tall photo and up to four small ones. Phone: a swipeable 4:3
// strip with dots. Never advances by itself.
function Collage({ images, title }) {
  const stripRef = useRef(null)
  const [active, setActive] = useState(0)

  function onScroll() {
    const el = stripRef.current
    if (el) setActive(Math.round(el.scrollLeft / el.clientWidth))
  }

  return (
    <div className="hero-media">
      <div className={`hero-collage hero-collage-${Math.min(images.length, 5)}`} ref={stripRef} onScroll={onScroll}>
        {images.map((src, i) => (
          <div key={src} className="hero-photo">
            <img
              src={src}
              alt={i === 0 ? `From ${title}` : ''}
              width="800" height="600"
              loading={i === 0 ? 'eager' : 'lazy'}
              fetchpriority={i === 0 ? 'high' : undefined}
              decoding="async"
            />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <div className="hero-dots" aria-hidden="true">
          {images.map((src, i) => <span key={src} className={i === active ? 'on' : ''} />)}
        </div>
      )}
    </div>
  )
}
