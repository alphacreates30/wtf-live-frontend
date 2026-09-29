import { Link } from 'react-router-dom'
import { shortTimeLeft, money, lotHref, HOUR } from './clock'

// One lot, as a card. Plain props (the /home or /search lot shape, the
// auction's buyer's premium, and server `now`), so an app can rebuild it 1:1.
// No watch star yet: the watch list is a separate build.
export default function LotCard({ lot, premiumPct, now }) {
  const msLeft = Date.parse(lot.ends_at) - now
  const closed = msLeft <= 0
  const finalHour = !closed && msLeft < HOUR
  const lastMinute = !closed && msLeft < 60e3
  const bids = lot.bid_count || 0

  return (
    <Link to={lotHref(lot)} className="lc">
      <div className="lc-img">
        {lot.image_url
          ? <img src={lot.image_url} alt="" loading="lazy" decoding="async" width="400" height="300" />
          : (
            <div className="lc-img-empty">
              <img src="/logo-mark.svg" alt="" width="36" height="36" />
              <span>Photography to follow</span>
            </div>
          )}
        <span className="lc-chip">Lot {lot.position + 1}</span>
      </div>
      <div className="lc-body">
        <h3 className="lc-title">{lot.title}</h3>
        <div className="lc-row">
          {bids > 0 ? (
            <span className="lc-price">
              {money(lot.current_bid)}
              {/* Premium is always beside the bid (BRAND.md), never a bare price. */}
              {premiumPct != null && <span className="lc-prem">+{premiumPct}% prem.</span>}
            </span>
          ) : (
            <span className="lc-price lc-price-none">No bids yet</span>
          )}
        </div>
        <div className="lc-row lc-meta">
          <span>{bids === 0 ? 'Be the first' : bids === 1 ? '1 bid' : `${bids} bids`}</span>
          <span className={`lc-time${finalHour ? ' lc-time-urgent' : ''}`}>
            {lastMinute && <img src="/brand/state-closing.svg" alt="" width="18" height="18" className="lc-closing" />}
            {closed ? 'Closed' : shortTimeLeft(msLeft)}
          </span>
        </div>
      </div>
    </Link>
  )
}
