import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

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

const PAYMENT_STATUS_STYLE = {
  paid: { background: '#22c55e22', color: '#22c55e', border: '1px solid #22c55e' },
  unpaid: { background: '#ffffff11', color: 'var(--text-muted)', border: '1px solid var(--border)' },
  charging: { background: '#3b82f622', color: '#60a5fa', border: '1px solid #3b82f6' },
  failed: { background: '#ef444422', color: '#ef4444', border: '1px solid #ef4444' },
}

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

  if (loading) return <div className="page"><p style={{ color: 'var(--text-muted)' }}>Loading your orders…</p></div>
  if (error) return <div className="page"><p style={{ color: 'var(--error)' }}>{error}</p></div>
  if (!orders.length) return (
    <div className="page">
      <h1 style={{ marginBottom: '0.5rem' }}>My Orders</h1>
      <p style={{ color: 'var(--text-muted)' }}>You haven't won anything yet. <Link to="/">Browse auctions</Link></p>
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
    const shipStyle = PAYMENT_STATUS_STYLE[shipStatusKey] || PAYMENT_STATUS_STYLE.unpaid
    const shipLabel = SHIPPING_STATUS_LABEL[shipStatusKey] || shipStatusKey
    const link = trackingLink(o)
    return (
      <div key={o.id} style={{ marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px dashed var(--border)', fontSize: '0.9rem' }}>
        {showLabel && <div style={{ color: 'var(--text-muted)', marginBottom: '0.3rem' }}>{o.item_title}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)' }}>
            Postage{o.shipping_cost_cents != null ? ` — ${fmt(o.shipping_cost_cents)}` : ' — charged separately once packed'}
          </span>
          <span className="badge" style={shipStyle}>{shipLabel}</span>
        </div>
        {o.shipping_payment_status === 'failed' && o.shipping_payment_error && (
          <div style={{ fontSize: '0.8rem', color: 'var(--error)', marginTop: '0.25rem' }}>{o.shipping_payment_error}</div>
        )}
        {o.tracking_number && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Tracking:{' '}
            {link
              ? <a href={link} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
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
      <h1 style={{ marginBottom: '1.5rem' }}>My Orders</h1>

      {groups.map(group => {
        const first = group.orders[0]
        const statusKey = first.payment_status || 'unpaid'
        const style = PAYMENT_STATUS_STYLE[statusKey] || PAYMENT_STATUS_STYLE.unpaid
        const label = PAYMENT_STATUS_LABEL[statusKey] || statusKey
        const totalCents = group.orders.reduce((s, o) => s + (o.total_cents || 0), 0)

        return (
          <div key={group.key} className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                {group.invoice
                  ? <div style={{ fontWeight: 600 }}>{group.orders.length} lot{group.orders.length === 1 ? '' : 's'} won</div>
                  : <div style={{ fontWeight: 600 }}>{first.item_title}</div>}
                {first.auction_title && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{first.auction_title}</div>}
              </div>
              <span className="badge" style={style}>{label}</span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', marginTop: '0.75rem' }}>
              <tbody>
                {group.invoice ? group.orders.map(o => (
                  <tr key={o.id}>
                    <td style={{ padding: '0.2rem 0', color: 'var(--text-muted)' }}>{o.item_title}</td>
                    <td style={{ padding: '0.2rem 0', textAlign: 'right' }}>{fmt(o.hammer_cents)} + {fmt(o.premium_cents)}</td>
                  </tr>
                )) : (
                  <>
                    <tr>
                      <td style={{ padding: '0.2rem 0', color: 'var(--text-muted)' }}>Hammer price</td>
                      <td style={{ padding: '0.2rem 0', textAlign: 'right' }}>{fmt(first.hammer_cents)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '0.2rem 0', color: 'var(--text-muted)' }}>Buyer's premium</td>
                      <td style={{ padding: '0.2rem 0', textAlign: 'right' }}>{fmt(first.premium_cents)}</td>
                    </tr>
                  </>
                )}
                <tr>
                  <td style={{ padding: '0.35rem 0 0', fontWeight: 700, borderTop: '1px solid var(--border)' }}>Total</td>
                  <td style={{ padding: '0.35rem 0 0', textAlign: 'right', fontWeight: 700, borderTop: '1px solid var(--border)' }}>{fmt(totalCents)}</td>
                </tr>
              </tbody>
            </table>

            {first.fulfillment_choice && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px dashed var(--border)', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>
                  Fulfilment: <strong style={{ color: 'var(--text)' }}>{first.fulfillment_choice === 'pickup' ? 'Local pickup' : 'Shipping'}</strong>
                </span>
                {first.can_change_fulfillment && (
                  <button
                    type="button"
                    disabled={changingAuctionId === first.auction_id}
                    onClick={() => handleChangeFulfillment(first, first.fulfillment_choice === 'pickup' ? 'shipping' : 'pickup')}
                    style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline', padding: 0 }}
                  >
                    {changingAuctionId === first.auction_id ? 'Switching…' : `Switch to ${first.fulfillment_choice === 'pickup' ? 'shipping' : 'pickup'}`}
                  </button>
                )}
              </div>
            )}
            {changeError?.auctionId === first.auction_id && (
              <p style={{ fontSize: '0.8rem', color: 'var(--error)', marginTop: '0.25rem' }}>{changeError.message}</p>
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
