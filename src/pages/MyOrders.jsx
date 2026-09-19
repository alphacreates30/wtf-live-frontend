import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import './Buyer.css'

// tracking_url is Shippo's own hosted tracking page for the shipment,
// stored at label-purchase time - always prefer it. CARRIER_TRACK_URLS is
// only a fallback for orders shipped before tracking_url existed, which
// have a carrier name but no stored URL.
const CARRIER_TRACK_URLS = {
  usps: n => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`,
  ups: n => `https://www.ups.com/track?tracknum=${n}`,
  fedex: n => `https://www.fedex.com/fedextrack/?trknbr=${n}`,
  dhl: n => `https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=${n}`,
}

function trackingLink(order) {
  if (order.tracking_url) return order.tracking_url
  if (!order.tracking_carrier || !order.tracking_number) return null
  const key = String(order.tracking_carrier).toLowerCase().replace(/[^a-z]/g, '')
  const build = CARRIER_TRACK_URLS[key]
  return build ? build(encodeURIComponent(order.tracking_number)) : null
}

// Classes live in Buyer.css (.pay-paid etc.) and are all token-driven. The colour
// objects that used to sit here were hardcoded hexes, including a blue that
// appears nowhere in the palette.
const PAYMENT_STATUS_CLASS = { paid: 'pay-paid', unpaid: 'pay-unpaid', charging: 'pay-charging', failed: 'pay-failed' }

const PAYMENT_STATUS_LABEL = {
  paid: 'Paid',
  unpaid: 'Unpaid',
  charging: 'Charging…',
  failed: 'Payment Failed',
}

const SHIPPING_STATUS_LABEL = {
  paid: 'Paid',
  unpaid: 'Not yet charged',
  charging: 'Charging…',
  failed: 'Payment Failed',
}

export default function MyOrders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [changingAuctionId, setChangingAuctionId] = useState(null)
  const [changeError, setChangeError] = useState(null)

  function loadOrders() {
    return api.getMyOrders().then(data => setOrders(data || []))
  }

  useEffect(() => {
    loadOrders()
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // The backend mirrors a change onto every one of this buyer's still-
  // pending, not-yet-charged orders from that auction (not just the one
  // clicked) - reloading rather than patching local state keeps this view
  // consistent with exactly what the server actually changed.
  async function handleChangeFulfillment(order, newChoice) {
    setChangingAuctionId(order.auction_id)
    setChangeError(null)
    try {
      await api.updateFulfillmentChoice(order.auction_id, newChoice)
      await loadOrders()
    } catch (e) {
      setChangeError({ auctionId: order.auction_id, message: e.message })
    } finally {
      setChangingAuctionId(null)
    }
  }

  const fmt = cents => '$' + (Number(cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })



  if (loading) return <div className="page"><p className="buyer-note">Loading your orders…</p></div>
  if (error) return <div className="page"><p className="error-msg">{error}</p></div>
  if (!orders.length) return (
    <div className="page">
      <h1 className="buyer-title">My Orders</h1>
      <p className="buyer-note">You haven't won anything yet. <Link to="/">Browse auctions</Link></p>
    </div>
  )

  // Standard-auction lots are billed together on one invoice per buyer per
  // auction - group them into one card with one total/status. Live orders
  // (no invoice_id) keep their own card exactly as before.
  const groups = []
  const seenInvoices = new Set()
  for (const order of orders) {
    if (order.invoice_id) {
      if (seenInvoices.has(order.invoice_id)) continue
      seenInvoices.add(order.invoice_id)
      groups.push({ key: order.invoice_id, invoice: true, orders: orders.filter(o => o.invoice_id === order.invoice_id) })
    } else {
      groups.push({ key: order.id, invoice: false, orders: [order] })
    }
  }

  function renderShippingBlock(o, showLabel) {
    if (o.fulfillment_choice !== 'shipping') return null
    const shipStatusKey = o.shipping_payment_status || 'unpaid'
    const shipClass = PAYMENT_STATUS_CLASS[shipStatusKey] || PAYMENT_STATUS_CLASS.unpaid
    const shipLabel = SHIPPING_STATUS_LABEL[shipStatusKey] || shipStatusKey
    const link = trackingLink(o)
    return (
      <div key={o.id} className="order-block">
        {showLabel && <div className="order-ship-lot">{o.item_title}</div>}
        <div className="order-line">
          <span className="muted">
            Postage{o.shipping_cost_cents != null ? ` — ${fmt(o.shipping_cost_cents)}` : ' — charged separately once packed'}
          </span>
          <span className={`badge pay-badge ${shipClass}`}>{shipLabel}</span>
        </div>
        {o.shipping_payment_status === 'failed' && o.shipping_payment_error && (
          <p className="error-msg inline-error">{o.shipping_payment_error}</p>
        )}
        {o.tracking_number && (
          <div className="order-tracking">
            Tracking:{' '}
            {link
              ? <a href={link} target="_blank" rel="noreferrer">
                  {o.tracking_number}{o.tracking_carrier ? ` (${o.tracking_carrier.toUpperCase()})` : ''}
                </a>
              : <span>{o.tracking_number}{o.tracking_carrier ? ` (${o.tracking_carrier})` : ''}</span>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="page">
      <h1 className="buyer-title">My Orders</h1>

      {groups.map(group => {
        const first = group.orders[0]
        const statusKey = first.payment_status || 'unpaid'
        const statusClass = PAYMENT_STATUS_CLASS[statusKey] || PAYMENT_STATUS_CLASS.unpaid
        const label = PAYMENT_STATUS_LABEL[statusKey] || statusKey
        const totalCents = group.orders.reduce((s, o) => s + (o.total_cents || 0), 0)

        return (
          <div key={group.key} className="card order-card">
            <div className="order-head">
              <div>
                {group.invoice
                  ? <div className="order-name">{group.orders.length} lot{group.orders.length === 1 ? '' : 's'} won</div>
                  : <div className="order-name">{first.item_title}</div>}
                {first.auction_title && <div className="order-sub">{first.auction_title}</div>}
              </div>
              <span className={`badge pay-badge ${statusClass}`}>{label}</span>
            </div>

            <table className="order-table">
              <tbody>
                {group.invoice ? group.orders.map(o => (
                  <tr key={o.id}>
                    <td>{o.item_title}</td>
                    <td>{fmt(o.hammer_cents)} + {fmt(o.premium_cents)}</td>
                  </tr>
                )) : (
                  <>
                    <tr>
                      <td>Hammer price</td>
                      <td>{fmt(first.hammer_cents)}</td>
                    </tr>
                    <tr>
                      <td>Buyer's premium</td>
                      <td>{fmt(first.premium_cents)}</td>
                    </tr>
                  </>
                )}
                <tr className="order-total">
                  <td>Total</td>
                  <td>{fmt(totalCents)}</td>
                </tr>
              </tbody>
            </table>

            {first.fulfillment_choice && (
              <div className="order-block order-line">
                <span className="muted">
                  Fulfilment: <strong>{first.fulfillment_choice === 'pickup' ? 'Local pickup' : 'Shipping'}</strong>
                </span>
                {first.can_change_fulfillment && (
                  <button
                    type="button"
                    className="link-btn"
                    disabled={changingAuctionId === first.auction_id}
                    onClick={() => handleChangeFulfillment(first, first.fulfillment_choice === 'pickup' ? 'shipping' : 'pickup')}
                  >
                    {changingAuctionId === first.auction_id ? 'Switching…' : `Switch to ${first.fulfillment_choice === 'pickup' ? 'shipping' : 'pickup'}`}
                  </button>
                )}
              </div>
            )}
            {changeError?.auctionId === first.auction_id && (
              <p className="error-msg inline-error">{changeError.message}</p>
            )}

            {/* Shipping/tracking stays per lot - a bundle can be split across
                different shipments, so it can't be rolled up like payment. */}
            {group.orders.map(o => renderShippingBlock(o, group.invoice))}
          </div>
        )
      })}
    </div>
  )
}
