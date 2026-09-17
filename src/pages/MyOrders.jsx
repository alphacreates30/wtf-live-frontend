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

  useEffect(() => {
    api.getMyOrders()
      .then(data => { setOrders(data || []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const fmt = cents => '$' + (Number(cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  if (loading) return <div className="page"><p style={{ color: 'var(--text-muted)' }}>Loading your orders…</p></div>
  if (error) return <div className="page"><p style={{ color: 'var(--error)' }}>{error}</p></div>
  if (!orders.length) return (
    <div className="page">
      <h1 style={{ marginBottom: '0.5rem' }}>My Orders</h1>
      <p style={{ color: 'var(--text-muted)' }}>You haven't won anything yet. <Link to="/">Browse auctions</Link></p>
    </div>
  )

  return (
    <div className="page">
      <h1 style={{ marginBottom: '1.5rem' }}>My Orders</h1>

      {orders.map(order => {
        const statusKey = order.payment_status || 'unpaid'
        const style = PAYMENT_STATUS_STYLE[statusKey] || PAYMENT_STATUS_STYLE.unpaid
        const label = PAYMENT_STATUS_LABEL[statusKey] || statusKey
        const link = trackingLink(order)

        return (
          <div key={order.id} className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{order.item_title}</div>
                {order.auction_title && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{order.auction_title}</div>}
              </div>
              <span className="badge" style={style}>{label}</span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', marginTop: '0.75rem' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '0.2rem 0', color: 'var(--text-muted)' }}>Hammer price</td>
                  <td style={{ padding: '0.2rem 0', textAlign: 'right' }}>{fmt(order.hammer_cents)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '0.2rem 0', color: 'var(--text-muted)' }}>Buyer's premium</td>
                  <td style={{ padding: '0.2rem 0', textAlign: 'right' }}>{fmt(order.premium_cents)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '0.35rem 0 0', fontWeight: 700, borderTop: '1px solid var(--border)' }}>Total</td>
                  <td style={{ padding: '0.35rem 0 0', textAlign: 'right', fontWeight: 700, borderTop: '1px solid var(--border)' }}>{fmt(order.total_cents)}</td>
                </tr>
              </tbody>
            </table>

            {order.fulfillment_choice === 'shipping' && (() => {
              const shipStatusKey = order.shipping_payment_status || 'unpaid'
              const shipStyle = PAYMENT_STATUS_STYLE[shipStatusKey] || PAYMENT_STATUS_STYLE.unpaid
              const shipLabel = SHIPPING_STATUS_LABEL[shipStatusKey] || shipStatusKey
              return (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px dashed var(--border)', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>
                    Postage{order.shipping_cost_cents != null ? ` — ${fmt(order.shipping_cost_cents)}` : ' — charged separately once packed'}
                  </span>
                  <span className="badge" style={shipStyle}>{shipLabel}</span>
                </div>
              )
            })()}
            {order.fulfillment_choice === 'shipping' && order.shipping_payment_status === 'failed' && order.shipping_payment_error && (
              <div style={{ fontSize: '0.8rem', color: 'var(--error)', marginTop: '0.25rem' }}>{order.shipping_payment_error}</div>
            )}

            {order.tracking_number && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Tracking:{' '}
                {link
                  ? <a href={link} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                      {order.tracking_number}{order.tracking_carrier ? ` (${order.tracking_carrier.toUpperCase()})` : ''}
                    </a>
                  : <span>{order.tracking_number}{order.tracking_carrier ? ` (${order.tracking_carrier})` : ''}</span>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
