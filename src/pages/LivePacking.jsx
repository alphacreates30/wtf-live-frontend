import { useEffect, useState } from 'react'
import { api } from '../api'
import './LivePacking.css'

// After a live show (brief step 2a): the winner list, and the packing list grouped by buyer, one box each (the
// phase 1b order groups; a pickup buyer gets their own entry, not a box). Lot numbers, titles, usernames and ship or
// pickup. Print it: the page prints as the list alone, one box per block.
const fmt = cents => '$' + (Number(cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const PAY = { paid: 'Paid', failed: 'Card declined', unpaid: 'Charging', charging: 'Charging' }

export default function LivePacking({ auctionId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api.getLivePacking(auctionId).then(setData).catch(e => setError(e.message)) }, [auctionId])

  if (error) return <p className="error-msg">{error}</p>
  if (!data) return <p className="ar-empty">Loading…</p>
  const boxes = data.boxes.filter(b => b.fulfillment === 'shipping'), pickups = data.boxes.filter(b => b.fulfillment === 'pickup')

  return (
    <div className="lpk">
      <div className="lpk-head">
        <div>
          <h2 className="lpk-title">{data.show.title}</h2>
          <p className="lpk-sub">{data.winners.length} lot{data.winners.length === 1 ? '' : 's'} sold · {boxes.length} box{boxes.length === 1 ? '' : 'es'} to pack{pickups.length ? ` · ${pickups.length} pickup` : ''}
            {!data.show.ended_at && ' · the show has not ended yet'}</p>
        </div>
        <button type="button" className="btn-primary lpk-print" onClick={() => window.print()}>Print</button>
      </div>

      <section aria-labelledby="lpk-boxes-h">
        <h3 id="lpk-boxes-h" className="lpk-h3">Packing list: one box per buyer</h3>
        {data.boxes.length === 0 && <p className="ar-empty">Nothing sold yet.</p>}
        <div className="lpk-boxes">
          {data.boxes.map((b, i) => (
            <article key={i} className="lpk-box">
              <header className="lpk-box-head">
                <span className="lpk-buyer">@{b.buyer}</span>
                <span className={`badge${b.fulfillment === 'pickup' ? ' badge-draft' : ''}`}>{b.fulfillment === 'pickup' ? 'Pickup' : 'Ship'}</span>
                <span className="lpk-count">{b.lots.length} lot{b.lots.length === 1 ? '' : 's'}</span>
              </header>
              <ul className="lpk-lots">
                {b.lots.map(l => (
                  <li key={l.order_id}>
                    <span className="lpk-check" aria-hidden="true" />
                    <span className="tabular lpk-num">Lot {l.lot_number}</span>
                    <span className="lpk-lot-title">{l.title}</span>
                    {l.payment_status !== 'paid' && <span className="lpk-flag">{PAY[l.payment_status] || l.payment_status}</span>}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="lpk-win-h" className="lpk-winners">
        <h3 id="lpk-win-h" className="lpk-h3">Winners</h3>
        <table className="lpk-table">
          <thead><tr><th scope="col">Lot</th><th scope="col">Title</th><th scope="col">Buyer</th><th scope="col">Price</th><th scope="col">Payment</th><th scope="col">Ship / pickup</th></tr></thead>
          <tbody>
            {data.winners.map(w => (
              <tr key={w.order_id}>
                <td className="tabular">{w.lot_number}</td>
                <td>{w.title}</td>
                <td>@{w.buyer}</td>
                <td className="tabular">{fmt(w.amount_cents)}</td>
                <td>{PAY[w.payment_status] || w.payment_status}</td>
                <td>{w.fulfillment === 'pickup' ? 'Pickup' : 'Ship'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
