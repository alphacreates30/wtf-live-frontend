import { useEffect, useState } from 'react'
import { api } from '../api'
import './LivePacking.css'

// After a live show (brief step 2a): the winner list, and the packing list grouped by buyer (the phase 1b order
// groups) with each buyer's lot count, so the host can split a big haul into more than one box while packing (as few
// boxes as possible; each box is labelled from Orders). Pickup buyers are listed apart, "to collect". Lot numbers,
// titles, usernames. Print it: the page prints as the list alone, one buyer per block.
const fmt = cents => '$' + (Number(cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const PAY = { paid: 'Paid', failed: 'Card declined', unpaid: 'Charging', charging: 'Charging' }
const lotsWord = n => `${n} lot${n === 1 ? '' : 's'}`

function BuyerBlock({ b }) {
  const pickup = b.fulfillment === 'pickup'
  const left = b.still_to_ship ?? b.lots.length
  return (
    <article className="lpk-box">
      <header className="lpk-box-head">
        <span className="lpk-buyer">@{b.buyer}</span>
        <span className={`badge${pickup ? ' badge-draft' : ''}`}>{pickup ? 'Pickup' : 'Ship'}</span>
        <span className="lpk-count">{lotsWord(b.lots.length)}</span>
      </header>
      {!pickup && left > 0 && left < b.lots.length && <p className="lpk-left">{lotsWord(left)} still to ship</p>}
      {!pickup && left === 0 && <p className="lpk-left lpk-left-done">All shipped</p>}
      <ul className="lpk-lots">
        {b.lots.map(l => (
          <li key={l.order_id}>
            <span className="lpk-check" aria-hidden="true" />
            <span className="tabular lpk-num">Lot {l.lot_number}</span>
            <span className="lpk-lot-title">{l.title}</span>
            {l.payment_status !== 'paid' && <span className="lpk-flag">{PAY[l.payment_status] || l.payment_status}</span>}
            {!pickup && l.label_made && <span className="lpk-boxed">In a box</span>}
          </li>
        ))}
      </ul>
    </article>
  )
}

export default function LivePacking({ auctionId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api.getLivePacking(auctionId).then(setData).catch(e => setError(e.message)) }, [auctionId])

  if (error) return <p className="error-msg">{error}</p>
  if (!data) return <p className="ar-empty">Loading…</p>
  const ship = data.boxes.filter(b => b.fulfillment === 'shipping'), pickups = data.boxes.filter(b => b.fulfillment === 'pickup')
  const shipLots = ship.reduce((n, b) => n + b.lots.length, 0)

  return (
    <div className="lpk">
      <div className="lpk-head">
        <div>
          <h2 className="lpk-title">{data.show.title}</h2>
          <p className="lpk-sub">{lotsWord(data.winners.length)} sold · {ship.length} buyer{ship.length === 1 ? '' : 's'} to ship ({lotsWord(shipLots)}){pickups.length ? ` · ${pickups.length} to collect` : ''}
            {!data.show.ended_at && ' · the show has not ended yet'}</p>
        </div>
        <button type="button" className="btn-primary lpk-print" onClick={() => window.print()}>Print</button>
      </div>

      <section aria-labelledby="lpk-boxes-h">
        <h3 id="lpk-boxes-h" className="lpk-h3">Packing list by buyer</h3>
        <p className="lpk-note">Pack each buyer's lots into as few boxes as possible. A big or awkward haul can go in more than one box: in Orders, tick the lots for one box, make its label, then do the rest.</p>
        {data.boxes.length === 0 && <p className="ar-empty">Nothing sold yet.</p>}
        {data.boxes.length > 0 && ship.length === 0 && <p className="ar-empty">Nothing to ship.</p>}
        <div className="lpk-boxes">
          {ship.map(b => <BuyerBlock key={b.group_id || b.buyer} b={b} />)}
        </div>
      </section>

      {pickups.length > 0 && (
        <section aria-labelledby="lpk-collect-h">
          <h3 id="lpk-collect-h" className="lpk-h3">To collect (pickup)</h3>
          <div className="lpk-boxes">
            {pickups.map(b => <BuyerBlock key={'p:' + b.buyer} b={b} />)}
          </div>
        </section>
      )}

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
