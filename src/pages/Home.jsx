import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../api'
import { useServerClock, fmtDateTime } from '../components/home/clock'
import AuctionCard from '../components/home/AuctionCard'
import ClosingSchedule from '../components/home/ClosingSchedule'
import Rail from '../components/home/Rail'
import LotCard from '../components/home/LotCard'
import SignupForm from '../components/home/SignupForm'
import { WatchButton, FollowButton } from '../watch/WatchButtons'
import { CONSIGN_MAILTO } from '../components/home/links'
import '../components/home/home.css'

const HOME_REFRESH_MS = 30_000

// "View all" goes to the lots' auction when a rail holds one collection,
// otherwise to the auctions list. A filtered all-lots view comes later.
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

// Several auctions can be open at once, ending on different days. The
// homepage features none over the others: one card each (1 = wide, 2-3 side
// by side, 4+ a swipe row), soonest ending first. Each auction's full story
// lives on its own page.
function OpenNow({ auctions, now }) {
  const layout = auctions.length === 1 ? 'one' : auctions.length <= 3 ? 'few' : 'many'
  return (
    <section className="open-now" aria-labelledby="open-h">
      <div className="section-head">
        <h2 id="open-h" className="section-title">Open now</h2>
        <Link to="/auctions" className="section-link">All auctions →</Link>
      </div>
      <div className={`open-now-list open-now-${layout}`}>
        {auctions.map((a, i) => <AuctionCard key={a.id} auction={a} now={now} wide={layout === 'one'} priority={i === 0} extra={<FollowButton auctionId={a.id} />} />)}
      </div>
    </section>
  )
}

function Asleep() {
  return (
    <section className="asleep" aria-labelledby="asleep-h">
      <img src="/brand/state-asleep.svg" alt="" width="64" height="64" className="asleep-mark" />
      <h1 id="asleep-h" className="asleep-title">The next collection is being catalogued.</h1>
      <p className="asleep-text">Leave your email and we'll wake you when it opens.</p>
      <div id="signup" className="asleep-form"><SignupForm /></div>
    </section>
  )
}

export default function Home() {
  const [home, setHome] = useState(null)
  const [error, setError] = useState('')
  const location = useLocation()
  const now = useServerClock(home?.server_now)

  // The page only renders what GET /home returns. Refreshed quietly so rails
  // and bids don't go stale on a phone left open; the clocks tick locally.
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
          : <div className="home-loading" aria-busy="true"><p>Loading…</p></div>}
      </div>
    )
  }

  const { open_auctions: open = [], closing_schedule: schedule = [], rails, upcoming, premium_pct: prem = {}, timezone } = home
  const cards = lots => lots.map(l => <LotCard key={l.id} lot={l} premiumPct={prem[l.auction_id]} now={now} extra={<div className="lc-watch"><WatchButton itemId={l.id} /></div>} />)

  return (
    <div className="home">
      {open.length > 0 && <h1 className="visually-hidden">What The Find: online auctions of collections</h1>}
      {open.length ? <OpenNow auctions={open} now={now} /> : <Asleep />}

      {open.length > 1 && <ClosingSchedule entries={schedule} timezone={timezone} now={now} />}

      <Rail id="ending" title="Ending soon" note={open.length > 1 ? 'every auction' : null} count={rails.ending_soon.length} viewAllHref={viewAll(rails.ending_soon)}>
        {cards(rails.ending_soon)}
      </Rail>
      <Rail id="wanted" title="Most wanted" note="most bids right now" count={rails.most_wanted.length} viewAllHref={viewAll(rails.most_wanted)}>
        {cards(rails.most_wanted)}
      </Rail>
      <Rail id="first" title="Be the first to bid" note="no bids yet" count={rails.first_bid.length} viewAllHref={viewAll(rails.first_bid)}>
        {cards(rails.first_bid)}
      </Rail>
      <Rail id="next" title="Coming next" count={upcoming.length} viewAllHref="/auctions">
        {upcoming.map(a => (
          <div key={a.id} className="lc lc-upcoming">
            <Link to={`/auction/${a.id}`} className="lc-link">
              <div className="lc-img">
                {a.thumb_url || a.image_url
                  ? <img src={a.thumb_url || a.image_url} alt="" loading="lazy" decoding="async" width="480" height="360" />
                  : <div className="lc-img-empty"><img src="/logo-mark.svg" alt="" width="32" height="32" /><span>Photography to follow</span></div>}
              </div>
              <div className="lc-body">
                <h3 className="lc-title lc-title-auction">{a.title}</h3>
                {a.blurb && <p className="lc-blurb">{a.blurb}</p>}
                <p className="lc-opens">Opens {fmtDateTime(a.starts_at)}</p>
              </div>
            </Link>
            <div className="lc-watch"><FollowButton auctionId={a.id} upcoming /></div>
          </div>
        ))}
      </Rail>

      <section id="how-it-works" className="how" aria-labelledby="how-h">
        <h2 id="how-h" className="section-title">How it works</h2>
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
        <div>
          <p className="consign-eyebrow">Consign with us</p>
          <h2 id="consign-h" className="consign-title">Got a collection with a story?</h2>
          <p className="consign-text">We photograph, catalogue and sell it, one lot at a time, to collectors who care.</p>
        </div>
        <a href={CONSIGN_MAILTO} className="consign-cta">Tell us about it →</a>
      </section>
    </div>
  )
}
