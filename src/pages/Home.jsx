import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../api'
import { useServerClock, fmtDateTime } from '../components/home/clock'
import AuctionHero from '../components/home/AuctionHero'
import Rail from '../components/home/Rail'
import LotCard from '../components/home/LotCard'
import '../components/home/home.css'

// Where consign enquiries go until the consign page exists (the Terms' contact address).
const CONSIGN_MAILTO = 'mailto:whatthefind.co@gmail.com?subject=' + encodeURIComponent('A collection with a story')
const HOME_REFRESH_MS = 30_000

// "View all" goes to the lots' auction when a rail holds one collection (the
// usual case), otherwise to the auctions list. A filtered view comes later.
function viewAll(lots) {
  const ids = [...new Set(lots.map(l => l.auction_id))]
  return ids.length === 1 ? `/auction/${ids[0]}` : '/auctions'
}

const STEPS = [
  ['Set your max', 'We bid for you, only as high as needed.'],
  // "two minutes" = the backend's SOFT_CLOSE_MINUTES (server.js). Change both together.
  ['Watch the clock', 'A late bid adds two minutes. No sniping.'],
  ['Win & pay', 'One invoice per auction, charged automatically.'],
  ['Ship or pick up', 'Packed with care, tracked to your door.'],
]

export default function Home() {
  const [home, setHome] = useState(null)
  const [error, setError] = useState('')
  const location = useLocation()
  const now = useServerClock(home?.server_now)

  // The page only renders what GET /home returns. Refreshed quietly so rails
  // and bids don't go stale on a phone left open; the countdowns tick locally.
  useEffect(() => {
    let cancelled = false
    const load = () => api.getHome()
      .then(d => { if (!cancelled) { setHome(d); setError('') } })
      .catch(e => { if (!cancelled) setError(e.message) })
    load()
    const t = setInterval(load, HOME_REFRESH_MS)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  // /#how-it-works (header link) and /#signup (footer) land on their section.
  useEffect(() => {
    if (!home || !location.hash) return
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [home, location.hash])

  if (!home) {
    return (
      <div className="home">
        {error
          ? <div className="page"><p className="error-msg">{error}</p></div>
          : <div className="hero hero-loading" aria-busy="true"><p className="hero-eyebrow">Loading…</p></div>}
      </div>
    )
  }

  const { featured, rails, upcoming, premium_pct: prem = {} } = home
  const cards = lots => lots.map(l => <LotCard key={l.id} lot={l} premiumPct={prem[l.auction_id]} now={now} />)
  const comingNext = upcoming.filter(a => a.id !== featured?.id)

  return (
    <div className="home">
      <AuctionHero featured={featured} now={now} />

      <div className="home-rails">
        <Rail id="ending" title="Ending soon" count={rails.ending_soon.length} viewAllHref={viewAll(rails.ending_soon)}>
          {cards(rails.ending_soon)}
        </Rail>
        <Rail id="wanted" title="Most wanted" note="most bids right now" count={rails.most_wanted.length} viewAllHref={viewAll(rails.most_wanted)}>
          {cards(rails.most_wanted)}
        </Rail>
        <Rail id="first" title="Be the first to bid" note="no bids yet" count={rails.first_bid.length} viewAllHref={viewAll(rails.first_bid)}>
          {cards(rails.first_bid)}
        </Rail>
        <Rail id="next" title="Coming next" count={comingNext.length} viewAllHref="/auctions">
          {comingNext.map(a => (
            <Link key={a.id} to={`/auction/${a.id}`} className="lc lc-auction">
              <div className="lc-img">
                {a.image_url
                  ? <img src={a.image_url} alt="" loading="lazy" decoding="async" width="400" height="300" />
                  : <div className="lc-img-empty"><img src="/logo-mark.svg" alt="" width="36" height="36" /><span>Photography to follow</span></div>}
              </div>
              <div className="lc-body">
                <h3 className="lc-title">{a.title}</h3>
                <div className="lc-row lc-meta"><span>Opens {fmtDateTime(a.starts_at)}</span></div>
              </div>
            </Link>
          ))}
        </Rail>
      </div>

      <section id="how-it-works" className="how" aria-labelledby="how-h">
        <h2 id="how-h" className="how-title">How it works</h2>
        <ol className="how-steps">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="how-step">
              <span className="how-num" aria-hidden="true">{i + 1}</span>
              <h3 className="how-step-title">{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="consign" aria-labelledby="consign-h">
        <p className="consign-eyebrow">Consign with us</p>
        <h2 id="consign-h" className="consign-title">Got a collection with a story?</h2>
        <p className="consign-text">We photograph, catalogue and sell it, one lot at a time, to collectors who care.</p>
        <a href={CONSIGN_MAILTO} className="consign-cta">Tell us about it →</a>
      </section>
    </div>
  )
}
