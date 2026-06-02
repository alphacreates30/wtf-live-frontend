import { useEffect, useState } from 'react'
import { api } from '../api'
import './AdminOrders.css'

const STATUS_COLORS = {
  pending: '#f59e0b',
  label_created: '#3b82f6',
  shipped: '#8b5cf6',
  delivered: '#10b981',
}

export default function AdminOrders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadOrders() }, [])

  async function loadOrders() {
    setLoading(true)
    try {
      const data = await api.getAdminOrders()
      setOrders(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
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

  async function handleGenerateLabel() {
    if (!selected.size) return
    setWorking(true); setError('')
    try {
      const res = await api.generateLabel([...selected])
      window.open(res.label_url, '_blank')
      await loadOrders()
      setSelected(new Set())
    } catch (e) { setError(e.message) }
    finally { setWorking(false) }
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
    <div className="admin-orders">
      <div className="ao-header">
        <h1>Orders</h1>
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
                <button className="btn-primary" onClick={handleGenerateLabel} disabled={working}>
                  {working ? 'Generating…' : 'Generate Label'}
                </button>
              )}
            </>
          )}
          <button className="btn-ghost" onClick={loadOrders}>Refresh</button>
        </div>
      </div>

      {error && <p className="ao-error">{error}</p>}

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
                    ${group.items.reduce((s, o) => s + parseFloat(o.final_bid), 0).toFixed(2)} total
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
                      <span className="ao-bid">${parseFloat(order.final_bid).toFixed(2)}</span>
                      <span className="ao-date">{new Date(order.created_at).toLocaleDateString()}</span>
                      {order.tracking_number && (
                        <span className="ao-tracking">Tracking: {order.tracking_number}</span>
                      )}
                    </div>
                  </div>
                  <div className="ao-order-right">
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
    </div>
  )
}
