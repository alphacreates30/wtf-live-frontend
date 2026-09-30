import { Link } from 'react-router-dom'
import { shortTimeLeft, money, lotHref, HOUR } from './clock'
import PhotoPlaceholder from '../PhotoPlaceholder'

// One lot, as a card. Plain props (the /home or /search lot shape, the
// auction's buyer's premium, and server `now`), so an app can rebuild it 1:1.
// `extra` is a slot under the card body (the watch button goes there).
export default function LotCard({ lot, premiumPct, now, extra = null }) {
  // The small WebP when there is one (F1a); otherwise the full photo.
  const photo = lot.thumb_url || lot.image_url
  const msLeft = Date.parse(lot.ends_at) - now
  const closed = msLeft <= 0
  const finalHour = !closed && msLeft < HOUR
  const lastMinute = !closed && msLeft < 60e3
  const bids = lot.bid_count || 0

  return (
    <div className="lc">
      <Link to={lotHref(lot)} className="lc-link">
        <div className="lc-img">
          {photo
            ? <img src={photo} alt="" loading="lazy" decoding="async" width="480" height="360" />
            : <PhotoPlaceholder label={lot.placeholder_label || 'Photo coming soon'} seed={lot.id} />}
        </div>
        <div className="lc-body">
          {lot.auction_title && <p className="lc-auction">{lot.auction_title}</p>}
          <p className="lc-lot">Lot {lot.position + 1}</p>
          <h3 className="lc-title">{lot.title}</h3>
          <p className="lc-price">
            {bids > 0 ? (
              <>
                <span className="lc-amount">{money(lot.current_bid)}</span>
                {/* Premium is always beside the bid (BRAND.md), never a bare price. */}
                {premiumPct != null && <span className="lc-prem">+{premiumPct}% premium</span>}
              </>
            ) : <span className="lc-none">No bids yet</span>}
          </p>
          <div className="lc-meta">
            <span>{bids === 0 ? 'Be the first' : bids === 1 ? '1 bid' : `${bids} bids`}</span>
            <span className={`lc-time${finalHour ? ' lc-time-urgent' : ''}`}>
              {lastMinute && <img src="/brand/state-closing.svg" alt="" width="18" height="18" className="lc-closing" />}
              {closed ? 'Closed' : shortTimeLeft(msLeft)}
            </span>
          </div>
        </div>
      </Link>
      {extra}
    </div>
  )
}
