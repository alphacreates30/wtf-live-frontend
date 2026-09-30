import { Link } from 'react-router-dom'
import { endsLabel, closingChip } from './clock'

// One open auction (GET /home `open_auctions[]`): a 3-photo collage (1 large +
// 2 small), title, one-line story, lot count, end day and time, a time-left
// chip that turns red only in the final 24 hours, and "Browse lots".
// `wide` lays it out collage-left / text-right (the single-auction case).
// `extra` is a slot for the follow button.
// `priority`: the first card on the page; its lead photo is the largest paint.
export default function AuctionCard({ auction, now, wide = false, priority = false, extra = null }) {
  const photos = auction.images.map(i => i.thumb_url || i.url)
  const chip = closingChip(auction.ends_at, now)
  const lots = auction.lot_count === 1 ? '1 lot' : `${auction.lot_count} lots`
  const href = `/auction/${auction.id}`

  return (
    <article className={`ac${wide ? ' ac-wide' : ''}`} aria-labelledby={`ac-${auction.id}`}>
      <Link to={href} className={`ac-collage ac-collage-${Math.max(1, photos.length)}`} tabIndex={-1} aria-hidden="true">
        {photos.length
          ? photos.map((src, i) => (
            <span key={src} className="ac-photo">
              <img src={src} alt="" width="480" height="360" loading={i === 0 ? 'eager' : 'lazy'} fetchpriority={priority && i === 0 ? 'high' : undefined} decoding="async" />
            </span>
          ))
          : <span className="ac-photo ac-photo-empty"><img src="/logo-mark.svg" alt="" width="40" height="40" /></span>}
      </Link>
      <div className="ac-body">
        <p className="ac-live"><span className="ac-dot" aria-hidden="true" />Open now · {lots}</p>
        <h3 id={`ac-${auction.id}`} className="ac-title"><Link to={href}>{auction.title}</Link></h3>
        {auction.blurb && <p className="ac-blurb">{auction.blurb}</p>}
        <div className="ac-meta">
          <span className="ac-ends">{endsLabel(auction.ends_at, now)}</span>
          {chip && <span className={`ac-chip${chip.urgent ? ' ac-chip-urgent' : ''}`}>{chip.text}</span>}
        </div>
        <div className="ac-actions">
          <Link to={href} className="btn-primary ac-browse">Browse lots →</Link>
          {extra}
        </div>
      </div>
    </article>
  )
}
