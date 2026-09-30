import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useWatch } from '../watch/WatchContext'
import { shortTimeLeft, money, fmtDateTime, lotHref, HOUR, DAY } from '../components/home/clock'
import '../watch/watch.css'

const STATUS = { winning: "You're winning", outbid: 'Outbid', no_bid: 'No bid yet', won: 'Won', lost: 'Not won', closed: 'Closed' }

// GET /me/watching, grouped: Closing soon (next 24 hours) · Open · Upcoming
// auctions · Closed (won / not won). Live prices and time left; one tap to remove.
export default function Watching() {
  const w = useWatch()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())

  const load = () => api.getWatching().then(setData).catch(e => setError(e.message))
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t) }, [])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  if (error) return <div className="page"><p className="error-msg">{error}</p></div>
  if (!data) return <div className="page"><p className="watching-intro">Loading…</p></div>

  // Removing a row hides it straight away (the button also updates the header count).
  const lots = data.lots.filter(l => w.isWatching(l.id))
  const auctions = data.auctions.filter(a => w.isFollowing(a.id))
  const isOpen = l => l.status === 'open' && l.auction_phase === 'live' && Date.parse(l.ends_at) > now
  const closingSoon = lots.filter(l => isOpen(l) && Date.parse(l.ends_at) - now < DAY).sort((a, b) => Date.parse(a.ends_at) - Date.parse(b.ends_at))
  const open = lots.filter(l => isOpen(l) && Date.parse(l.ends_at) - now >= DAY).sort((a, b) => Date.parse(a.ends_at) - Date.parse(b.ends_at))
  const upcomingLots = lots.filter(l => l.auction_phase === 'upcoming')
  const closed = lots.filter(l => !isOpen(l) && l.auction_phase !== 'upcoming')
  const openAuctions = auctions.filter(a => a.phase === 'live')
  const upcomingAuctions = auctions.filter(a => a.phase === 'upcoming')
  const endedAuctions = auctions.filter(a => a.phase !== 'live' && a.phase !== 'upcoming')
  const nothing = !lots.length && !auctions.length

  return (
    <div className="page watching-page">
      <h1>Watching</h1>
      <p className="watching-intro">
        Lots you watch and auctions you follow. We'll email you an hour before a watched lot closes, when a followed
        auction opens, and the day before it closes. <Link to="/notifications">Choose which reminders you get</Link>.
      </p>
      {data.available === false && <p className="error-msg">Watching isn't switched on yet. Please check back soon.</p>}
      {nothing && data.available !== false && (
        <p className="watching-empty">Nothing yet. Tap <strong>Watch</strong> on any lot, or <strong>Follow</strong> on an auction, and it shows up here.</p>
      )}

      <Group title="Closing soon" items={closingSoon.map(l => <LotRow key={l.id} lot={l} now={now} w={w} />)} />
      <Group title="Open" items={[...openAuctions.map(a => <AuctionRow key={a.id} a={a} w={w} />), ...open.map(l => <LotRow key={l.id} lot={l} now={now} w={w} />)]} />
      <Group title="Upcoming auctions" items={[...upcomingAuctions.map(a => <AuctionRow key={a.id} a={a} w={w} />), ...upcomingLots.map(l => <LotRow key={l.id} lot={l} now={now} w={w} />)]} />
      <Group title="Closed" items={[...closed.map(l => <LotRow key={l.id} lot={l} now={now} w={w} />), ...endedAuctions.map(a => <AuctionRow key={a.id} a={a} w={w} />)]} />
    </div>
  )
}

function Group({ title, items }) {
  if (!items.length) return null
  return (
    <section className="watching-group" aria-label={title}>
      <h2>{title}</h2>
      <ul className="watching-list">{items}</ul>
    </section>
  )
}

function LotRow({ lot, now, w }) {
  const msLeft = Date.parse(lot.ends_at) - now
  const open = lot.status === 'open' && lot.auction_phase === 'live' && msLeft > 0
  const photo = lot.thumb_url || lot.image_url
  return (
    <li className="wl-row">
      <Link to={lotHref(lot)} className="wl-img" tabIndex={-1} aria-hidden="true">
        {photo ? <img src={photo} alt="" loading="lazy" width="120" height="90" /> : null}
      </Link>
      <div className="wl-main">
        <span className="wl-auction">{lot.auction_title} · Lot {lot.position + 1}</span>
        <Link to={lotHref(lot)} className="wl-title">{lot.title}</Link>
        <div className="wl-meta">
          {lot.bid_count > 0
            ? <span><span className="wl-price">{money(lot.current_bid)}</span>{lot.buyers_premium_pct != null && ` +${lot.buyers_premium_pct}% premium`}</span>
            : <span>No bids yet</span>}
          {open && <span className={msLeft < HOUR ? 'wl-urgent' : ''}>{shortTimeLeft(msLeft)} left</span>}
          {lot.auction_phase === 'upcoming' && <span>Auction not open yet</span>}
          <span className={`wl-status wl-status-${lot.my_status}`}>{STATUS[lot.my_status]}</span>
        </div>
      </div>
      <div className="wl-actions">
        {open && <Link to={lotHref(lot)} className="btn-bid">Bid</Link>}
        <button type="button" className="btn-ghost" onClick={() => w.toggleWatch(lot.id)}>Remove</button>
      </div>
    </li>
  )
}

function AuctionRow({ a, w }) {
  const photo = a.thumb_url || a.image_url
  return (
    <li className="wl-row">
      <Link to={`/auction/${a.id}`} className="wl-img" tabIndex={-1} aria-hidden="true">
        {photo ? <img src={photo} alt="" loading="lazy" width="120" height="90" /> : null}
      </Link>
      <div className="wl-main">
        <span className="wl-auction">Auction you follow · {a.lot_count} lots</span>
        <Link to={`/auction/${a.id}`} className="wl-title">{a.title}</Link>
        <div className="wl-meta">
          {a.phase === 'upcoming' ? <span>Opens {fmtDateTime(a.starts_at)}</span> : a.phase === 'live' ? <span>Open now{a.ends_at ? ` · ends ${fmtDateTime(a.ends_at)}` : ''}</span> : <span>Ended</span>}
        </div>
      </div>
      <div className="wl-actions">
        <Link to={`/auction/${a.id}`} className="btn-primary">{a.phase === 'upcoming' ? 'Preview' : 'Browse lots'}</Link>
        <button type="button" className="btn-ghost" onClick={() => w.toggleFollow(a.id)}>{a.phase === 'upcoming' ? 'Cancel reminder' : 'Unfollow'}</button>
      </div>
    </li>
  )
}
