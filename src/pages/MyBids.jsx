import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import './Buyer.css'

export default function MyBids() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.getMyBids()
      .then(data => { setItems(data || []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const fmt = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Group by auction
  const grouped = items.reduce((acc, item) => {
    const aId = item.auction?.id || 'unknown'
    if (!acc[aId]) acc[aId] = { auction: item.auction, items: [] }
    acc[aId].items.push(item)
    return acc
  }, {})

  if (loading) return <div className="page"><p className="buyer-note">Loading your bids…</p></div>
  if (error) return <div className="page"><p className="error-msg">{error}</p></div>
  if (!items.length) return (
    <div className="page">
      <h1 className="buyer-title">My Bids</h1>
      <p className="buyer-note">You haven't bid on any items yet. <Link to="/">Browse auctions</Link></p>
    </div>
  )

  return (
    <div className="page">
      <h1 className="buyer-title">My Bids &amp; Wins</h1>

      {Object.values(grouped).map(({ auction, items: aItems }) => {
        const wins = aItems.filter(i => i.won && i.closed)
        const totalWon = wins.reduce((s, i) => s + Number(i.current_bid || 0), 0)
        return (
          <div key={auction?.id} className="bids-group">
            <div className="bids-group-head">
              <h2 className="bids-group-title">{auction?.title || 'Auction'}</h2>
              <span className={`badge badge-${auction?.status || 'ended'}`}>{auction?.status || 'unknown'}</span>
              {auction?.id && <Link to={'/auction/' + auction.id} className="bids-view-link">View auction</Link>}
            </div>

            <table className="buyer-table">
              <thead>
                <tr>
                  <th>Lot</th>
                  <th>Title</th>
                  <th>Your Max Bid</th>
                  <th>Hammer Price</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {aItems.map(item => (
                  <tr key={item.id}>
                    <td data-label="Lot">{item.lot_number ?? '—'}</td>
                    <td data-label="Title" className="cell-title">{item.title}</td>
                    <td data-label="Your max bid">{item.max_bid ? fmt(item.max_bid) : '—'}</td>
                    <td data-label="Hammer price">{item.current_bid ? fmt(item.current_bid) : '—'}</td>
                    <td data-label="Result">
                      {!item.closed
                        ? (item.won
                            ? <span className="result-win">Leading</span>
                            : <span className="result-outbid">Outbid</span>)
                        : item.won
                          ? <span className="result-win">Won</span>
                          : <span className="result-lost">Lost</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {auction?.status === 'ended' && wins.length > 0 && (() => {
              const premiumPct = auction?.buyers_premium_pct ?? 15
              const premium = totalWon * premiumPct / 100
              return (
                <div className="totals-block">
                  <div className="totals-lines">
                    <div><span>{wins.length} item{wins.length !== 1 ? 's' : ''} won</span></div>
                    <div><span>Hammer total</span><span>{fmt(totalWon)}</span></div>
                    <div><span>Buyer's premium ({premiumPct}%)</span><span>{fmt(premium)}</span></div>
                    <div className="totals-final"><span>Total</span><span>{fmt(totalWon + premium)}</span></div>
                  </div>
                </div>
              )
            })()}
          </div>
        )
      })}
    </div>
  )
}
