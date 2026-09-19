import { useEffect, useState } from 'react'
import { api } from '../api'
import PaymentControl from '../components/PaymentControl'
import './AdminOrders.css'

const STATUS_COLORS = {
  pending: '#f59e0b',
  label_created: '#3b82f6',
  shipped: '#8b5cf6',
  delivered: '#10b981',
}

export default function AdminOrders({ auctionId } = {}) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  // auction id -> title, so an invoice can say which auction it bills. Best
  // effort: the list still works without it.
  const [auctionTitles, setAuctionTitles] = useState({})
  // Shipping label flow: weigh -> quote -> confirm & charge -> buy. Null
  // when no shipping modal is open. step is 'input' (entering weight/dims)
  // or 'confirm' (quote back, awaiting the explicit charge confirmation) -
  // this is spending the buyer's money, so it's never a single button.
  const [shipModal, setShipModal] = useState(null)

  useEffect(() => {
    loadOrders()
    api.getAuctions().then(list => setAuctionTitles(Object.fromEntries((list || []).map(a => [a.id, a.title])))).catch(() => {})
  }, [])

  // silent: refresh in place with no "Loading…" flash - used after a charge
  // attempt so the new status shows without a full reload.
  async function loadOrders({ silent = false } = {}) {
    if (!silent) setLoading(true)
    try {
      const data = await api.getAdminOrders()
      setOrders(auctionId ? data.filter(o => o.auction_id === auctionId) : data)
    } catch (e) {
      setError(e.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectGroup(groupId) {
    const ids = orders.filter(o => o.group_id === groupId).map(o => o.id)
    setSelected(new Set(ids))
  }

  function openShipModal() {
    if (!selected.size) return
    setShipModal({
      orderIds: [...selected],
      step: 'input',
      weight_oz: '', length_in: '', width_in: '', height_in: '',
      quote: null,
      error: '',
      working: false,
    })
  }

  function closeShipModal() {
    setShipModal(null)
  }

  async function handleGetQuote() {
    const { orderIds, weight_oz, length_in, width_in, height_in } = shipModal
    const dims = { weight_oz: parseFloat(weight_oz), length_in: parseFloat(length_in), width_in: parseFloat(width_in), height_in: parseFloat(height_in) }
    if (Object.values(dims).some(n => !(n > 0))) {
      setShipModal(m => ({ ...m, error: 'Enter a weight and all three dimensions, each greater than 0.' }))
      return
    }
    setShipModal(m => ({ ...m, working: true, error: '' }))
    try {
      const quote = await api.getShippingQuote(orderIds, dims)
      setShipModal(m => ({ ...m, working: false, step: 'confirm', quote }))
    } catch (e) {
      setShipModal(m => ({ ...m, working: false, error: e.message }))
    }
  }

  async function handleConfirmChargeAndBuy() {
    const { orderIds, quote } = shipModal
    setShipModal(m => ({ ...m, working: true, error: '' }))
    try {
      const res = await api.chargeAndBuyLabel(orderIds, quote.rate_id, quote.amount_cents)
      window.open(res.label_url, '_blank')
      closeShipModal()
      await loadOrders()
      setSelected(new Set())
    } catch (e) {
      setShipModal(m => ({ ...m, working: false, error: e.message }))
    }
  }

  async function handleGroup() {
    if (selected.size < 2) return
    setWorking(true); setError('')
    try {
      await api.groupOrders([...selected])
      await loadOrders()
      setSelected(new Set())
    } catch (e) { setError(e.message) }
    finally { setWorking(false) }
  }

  async function handleUngroup(id) {
    setWorking(true); setError('')
    try {
      await api.ungroupOrder(id)
      await loadOrders()
    } catch (e) { setError(e.message) }
    finally { setWorking(false) }
  }

  async function handleStatus(id, status) {
    try {
      await api.updateOrderStatus(id, status)
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o))
    } catch (e) { setError(e.message) }
  }

  // A standard auction bills ONE invoice per buyer per auction, so the admin's
  // unit of action is the invoice, not the lot. Group the orders by invoice;
  // live-auction orders have no invoice and stay per-order (rendered inline below).
  const hammerOf = o => o.hammer_cents ?? Math.round(parseFloat(o.final_bid || 0) * 100)
  const invoices = []
  const invoiceIndex = new Map()
  for (const o of orders) {
    if (!o.invoice_id) continue
    if (!invoiceIndex.has(o.invoice_id)) {
      const inv = { id: o.invoice_id, buyer: o.buyer_username, auction_id: o.auction_id, status: o.payment_status, error: o.payment_error, paymentIntentId: o.payment_intent_id || null, chargingSince: o.charging_since || null, lots: [] }
      invoiceIndex.set(o.invoice_id, inv)
      invoices.push(inv)
    }
    const inv = invoiceIndex.get(o.invoice_id)
    inv.lots.push({ id: o.id, title: o.item_title, hammer_cents: hammerOf(o), premium_cents: o.premium_cents ?? Math.max(0, (o.total_cents || 0) - hammerOf(o)) })
  }
  const silentReload = () => loadOrders({ silent: true })

  // Group orders visually: group_id groups together, null = standalone
  const groups = []
  const seen = new Set()
  for (const o of orders) {
    if (o.group_id && !seen.has(o.group_id)) {
      seen.add(o.group_id)
      groups.push({ key: o.group_id, items: orders.filter(x => x.group_id === o.group_id), grouped: true })
    } else if (!o.group_id) {
      groups.push({ key: o.id, items: [o], grouped: false })
    }
  }

  const pendingSelected = [...selected].every(id => {
    const o = orders.find(x => x.id === id)
    return o && o.status === 'pending'
  })

  return (
    <div className={auctionId ? '' : 'admin-orders'}>
      <div className="ao-header">
        {!auctionId && <h1>Orders</h1>}
        <div className="ao-actions">
          {selected.size > 0 && (
            <>
              <span className="ao-selected-count">{selected.size} selected</span>
              {selected.size >= 2 && (
                <button className="btn-secondary" onClick={handleGroup} disabled={working}>
                  Bundle Together
                </button>
              )}
              {pendingSelected && (
                <button className="btn-primary" onClick={openShipModal} disabled={working}>
                  Generate Label
                </button>
              )}
            </>
          )}
          <button className="btn-ghost" onClick={loadOrders}>Refresh</button>
        </div>
      </div>

      {error && <p className="ao-error">{error}</p>}

      {invoices.length > 0 && (
        <section className="ao-payments" aria-label="Invoices">
          <h2 className="ao-payments-title">Invoices</h2>
          <div className="ao-payments-list">
            {invoices.map(inv => (
              <div key={inv.id} className="card ao-invoice">
                <PaymentControl
                  kind="invoice"
                  id={inv.id}
                  buyer={inv.buyer}
                  auctionTitle={auctionTitles[inv.auction_id]}
                  lots={inv.lots}
                  status={inv.status}
                  error={inv.error}
                  paymentIntentId={inv.paymentIntentId}
                  chargingSince={inv.chargingSince}
                  onDone={silentReload}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <p className="ao-loading">Loading orders…</p>
      ) : groups.length === 0 ? (
        <div className="ao-empty">
          <div style={{ fontSize: '3rem' }}>📦</div>
          <p>No orders yet. Orders appear automatically when auctions end.</p>
        </div>
      ) : (
        <div className="ao-list">
          {groups.map(group => (
            <div key={group.key} className={`ao-group ${group.grouped ? 'ao-bundled' : ''}`}>
              {group.grouped && (
                <div className="ao-bundle-header">
                  <span>📦 Bundle — {group.items.length} items · {group.items[0].ship_name}</span>
                  <span className="ao-bundle-total">
                    {/* total_cents (hammer + premium) is what's actually charged - final_bid alone
                        undercounts a bundle's real total by the premium on every item in it. */}
                    ${(group.items.reduce((s, o) => s + (o.total_cents ?? Math.round(parseFloat(o.final_bid) * 100)), 0) / 100).toFixed(2)} total
                  </span>
                </div>
              )}
              {group.items.map(order => (
                <div key={order.id} className={`ao-order ${selected.has(order.id) ? 'ao-order-selected' : ''}`}>
                  <div className="ao-check">
                    <input
                      type="checkbox"
                      checked={selected.has(order.id)}
                      onChange={() => toggleSelect(order.id)}
                    />
                  </div>
                  <div className="ao-order-info">
                    <div className="ao-item-title">{order.item_title}</div>
                    <div className="ao-buyer">
                      <strong>{order.ship_name || order.buyer_username}</strong>
                      {order.ship_address1 && (
                        <span className="ao-address">
                          {order.ship_address1}{order.ship_address2 ? ', ' + order.ship_address2 : ''}, {order.ship_city}, {order.ship_state} {order.ship_zip}
                        </span>
                      )}
                    </div>
                    <div className="ao-meta">
                      <span className="ao-bid">
                        ${parseFloat(order.final_bid).toFixed(2)}
                        {order.premium_cents != null && ` + $${(order.premium_cents / 100).toFixed(2)} premium`}
                      </span>
                      <span className="ao-date">{new Date(order.created_at).toLocaleDateString()}</span>
                      {order.tracking_number && (
                        <span className="ao-tracking">Tracking: {order.tracking_number}</span>
                      )}
                    </div>
                  </div>
                  <div className="ao-order-right">
                    {order.invoice_id ? (
                      // Payment for a standard-auction lot is handled once, per invoice, in the
                      // Invoices section above - not repeated (and not chargeable) per lot.
                      <div className="ao-payment">
                        <span className="ao-status" style={{ opacity: 0.6 }}>
                          billed on an invoice - see Invoices
                        </span>
                      </div>
                    ) : order.payment_status && (
                      // Live-auction order: no invoice, so it is charged per order.
                      <div className="ao-payment">
                        <PaymentControl
                          kind="order"
                          id={order.id}
                          compact
                          buyer={order.buyer_username}
                          lots={[{ id: order.id, title: order.item_title, hammer_cents: hammerOf(order), premium_cents: order.premium_cents ?? Math.max(0, (order.total_cents || 0) - hammerOf(order)) }]}
                          status={order.payment_status}
                          error={order.payment_error}
                          paymentIntentId={order.payment_intent_id || null}
                          chargingSince={order.charging_since || null}
                          onDone={silentReload}
                        />
                      </div>
                    )}
                    <span className="ao-status" style={{ background: STATUS_COLORS[order.status] + '22', color: STATUS_COLORS[order.status], border: '1px solid ' + STATUS_COLORS[order.status] }}>
                      {order.status.replace('_', ' ')}
                    </span>
                    <div className="ao-order-btns">
                      {order.label_url && (
                        <a href={order.label_url} target="_blank" rel="noreferrer" className="btn-sm">
                          Print Label
                        </a>
                      )}
                      {order.group_id && (
                        <button className="btn-sm btn-ghost-sm" onClick={() => handleUngroup(order.id)} disabled={working}>
                          Ungroup
                        </button>
                      )}
                      <select
                        value={order.status}
                        onChange={e => handleStatus(order.id, e.target.value)}
                        className="ao-status-select"
                      >
                        <option value="pending">pending</option>
                        <option value="label_created">label created</option>
                        <option value="shipped">shipped</option>
                        <option value="delivered">delivered</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              {group.grouped && (
                <div className="ao-bundle-footer">
                  <button className="btn-sm" onClick={() => selectGroup(group.key)}>Select all in bundle</button>
                  {group.items[0].label_url && (
                    <a href={group.items[0].label_url} target="_blank" rel="noreferrer" className="btn-sm">
                      Print Bundle Label
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {shipModal && (
        <div className="ao-ship-backdrop" onClick={shipModal.working ? undefined : closeShipModal}>
          <div className="ao-ship-modal card" onClick={e => e.stopPropagation()}>
            <h2 className="ao-ship-title">Ship {shipModal.orderIds.length > 1 ? `${shipModal.orderIds.length} items` : 'item'}</h2>

            {shipModal.step === 'input' && (
              <>
                <p className="ao-ship-sub">Enter the real parcel weight and dimensions at packing time — postage is charged at exact cost, no fallback.</p>
                <div className="ao-ship-fields">
                  <label>
                    Weight (oz)
                    <input type="number" min="0" step="any" value={shipModal.weight_oz}
                      onChange={e => setShipModal(m => ({ ...m, weight_oz: e.target.value }))} />
                  </label>
                  <label>
                    Length (in)
                    <input type="number" min="0" step="any" value={shipModal.length_in}
                      onChange={e => setShipModal(m => ({ ...m, length_in: e.target.value }))} />
                  </label>
                  <label>
                    Width (in)
                    <input type="number" min="0" step="any" value={shipModal.width_in}
                      onChange={e => setShipModal(m => ({ ...m, width_in: e.target.value }))} />
                  </label>
                  <label>
                    Height (in)
                    <input type="number" min="0" step="any" value={shipModal.height_in}
                      onChange={e => setShipModal(m => ({ ...m, height_in: e.target.value }))} />
                  </label>
                </div>
                {shipModal.error && <p className="ao-error">{shipModal.error}</p>}
                <div className="ao-ship-actions">
                  <button className="btn-ghost" onClick={closeShipModal} disabled={shipModal.working}>Cancel</button>
                  <button className="btn-primary" onClick={handleGetQuote} disabled={shipModal.working}>
                    {shipModal.working ? 'Getting quote…' : 'Get Quote'}
                  </button>
                </div>
              </>
            )}

            {shipModal.step === 'confirm' && shipModal.quote && (
              <>
                <div className="ao-ship-quote">
                  <div className="ao-ship-quote-row">
                    <span>Carrier</span>
                    <strong>{shipModal.quote.provider}{shipModal.quote.servicelevel ? ` — ${shipModal.quote.servicelevel}` : ''}</strong>
                  </div>
                  <div className="ao-ship-quote-row ao-ship-quote-total">
                    <span>Postage to charge the buyer</span>
                    <strong>${(shipModal.quote.amount_cents / 100).toFixed(2)}</strong>
                  </div>
                </div>
                <p className="ao-ship-sub">
                  Confirming will charge the buyer's card on file <strong>${(shipModal.quote.amount_cents / 100).toFixed(2)}</strong> for postage, and only on a successful charge, buy this label.
                </p>
                {shipModal.error && <p className="ao-error">{shipModal.error}</p>}
                <div className="ao-ship-actions">
                  <button className="btn-ghost" onClick={() => setShipModal(m => ({ ...m, step: 'input', quote: null }))} disabled={shipModal.working}>
                    Back
                  </button>
                  <button className="btn-primary" onClick={handleConfirmChargeAndBuy} disabled={shipModal.working}>
                    {shipModal.working ? 'Charging…' : `Charge $${(shipModal.quote.amount_cents / 100).toFixed(2)} and buy label`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
