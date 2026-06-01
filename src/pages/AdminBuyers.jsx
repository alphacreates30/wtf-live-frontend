import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

const STATUS_COLORS = {
  pending:  { bg: '#2a2000', color: '#f5c842', label: 'Pending' },
  approved: { bg: '#002a10', color: '#42f580', label: 'Approved' },
  rejected: { bg: '#2a0000', color: '#f54242', label: 'Rejected' },
  blocked:  { bg: '#1a001a', color: '#cc44ff', label: 'Blocked' },
}

function StatusBadge({ status, paymentStatus }) {
  const s = STATUS_COLORS[status] || { bg: '#222', color: '#aaa', label: status }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
      <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 }}>
        {s.label}
      </span>
      {paymentStatus === 'failed' && (
        <span style={{ background: '#2a1000', color: '#ff8c00', padding: '2px 8px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600 }}>
          ⚠ Payment failed
        </span>
      )}
    </span>
  )
}

export default function AdminBuyers() {
  const navigate = useNavigate()
  const [buyers, setBuyers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [actionLoading, setActionLoading] = useState(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const data = await api.getAdminBuyers()
      setBuyers(data)
    } catch (e) {
      alert('Failed to load buyers: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function setStatus(userId, status) {
    setActionLoading(userId + status)
    try {
      const updated = await api.updateBuyerStatus(userId, status)
      setBuyers(prev => prev.map(b => b.user_id === userId ? { ...b, ...updated } : b))
    } catch (e) {
      alert('Failed: ' + e.message)
    } finally {
      setActionLoading(null)
    }
  }

  const filtered = filter === 'all' ? buyers : buyers.filter(b => b.status === filter)
  const counts = buyers.reduce((acc, b) => { acc[b.status] = (acc[b.status] || 0) + 1; return acc }, {})

  return (
    <div className="page" style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>Buyer Management</h2>
          <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
            {buyers.length} total · {counts.pending || 0} pending · {counts.approved || 0} approved
          </p>
        </div>
        <button className="btn-ghost" onClick={load}>↺ Refresh</button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {['all', 'pending', 'approved', 'rejected', 'blocked'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '4px 12px', borderRadius: '999px', border: '1px solid var(--border, #333)',
              background: filter === f ? 'var(--accent, #7c3aed)' : 'transparent',
              color: filter === f ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500,
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== 'all' && counts[f] ? ` (${counts[f]})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
          No buyers in this category.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map(buyer => (
            <div key={buyer.user_id} className="card" style={{ padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '0.2rem' }}>{buyer.full_name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {buyer.email && <span>{buyer.email} · </span>}
                    {buyer.phone} · {buyer.city}, {buyer.state} {buyer.zip}
                  </div>
                  <div style={{ marginTop: '0.4rem' }}>
                    <StatusBadge status={buyer.status} paymentStatus={buyer.payment_status} />
                    {buyer.reviewed_by && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                        by @{buyer.reviewed_by}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Submitted {new Date(buyer.created_at).toLocaleDateString()}
                    {buyer.stripe_payment_method_id && ' · Card on file ✓'}
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  {buyer.status !== 'approved' && buyer.status !== 'blocked' && (
                    <button
                      className="btn-green"
                      style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                      disabled={actionLoading === buyer.user_id + 'approved'}
                      onClick={() => setStatus(buyer.user_id, 'approved')}
                    >
                      {actionLoading === buyer.user_id + 'approved' ? '…' : '✓ Approve'}
                    </button>
                  )}
                  {buyer.status === 'pending' && (
                    <button
                      className="btn-danger"
                      style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                      disabled={actionLoading === buyer.user_id + 'rejected'}
                      onClick={() => setStatus(buyer.user_id, 'rejected')}
                    >
                      {actionLoading === buyer.user_id + 'rejected' ? '…' : '✗ Reject'}
                    </button>
                  )}
                  {buyer.status === 'approved' && (
                    <button
                      style={{ padding: '4px 12px', fontSize: '0.8rem', background: '#1a001a', color: '#cc44ff', border: '1px solid #cc44ff', borderRadius: '4px', cursor: 'pointer' }}
                      disabled={actionLoading === buyer.user_id + 'blocked'}
                      onClick={() => { if (confirm(`Block ${buyer.full_name}?`)) setStatus(buyer.user_id, 'blocked') }}
                    >
                      {actionLoading === buyer.user_id + 'blocked' ? '…' : '🚫 Block'}
                    </button>
                  )}
                  {buyer.status === 'blocked' && (
                    <button
                      className="btn-ghost"
                      style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                      disabled={actionLoading === buyer.user_id + 'approved'}
                      onClick={() => setStatus(buyer.user_id, 'approved')}
                    >
                      {actionLoading === buyer.user_id + 'approved' ? '…' : '↩ Unblock'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
