import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import './AdminBuyers.css'

const STATUS_LABELS = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', blocked: 'Blocked' }

function StatusBadge({ status, paymentStatus }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
      <span className={`badge ab-status ab-status-${status}`}>
        {STATUS_LABELS[status] || status}
      </span>
      {paymentStatus === 'failed' && (
        <span className="badge ab-payfail">
          ⚠ Payment failed
        </span>
      )}
    </span>
  )
}

// Fallback for a buyer who has lost access to their email: set a random
// temporary password and read it to them. Shown once - it isn't stored
// anywhere but as a hash. No 0/O/1/l/I, so it survives being read aloud.
const TEMP_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
function tempPassword(len = 10) {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes, b => TEMP_ALPHABET[b % TEMP_ALPHABET.length]).join('')
}

function TempPasswordButton({ buyer }) {
  const [shown, setShown] = useState(null)
  const [busy, setBusy] = useState(false)

  async function reset() {
    if (!confirm(`Set a temporary password for ${buyer.full_name}? Their current password will stop working.`)) return
    const pw = tempPassword()
    setBusy(true)
    try {
      await api.adminSetPassword(buyer.user_id, pw)
      setShown(pw)
    } catch (e) {
      alert('Failed: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  if (shown) {
    return (
      <span style={{ fontSize: '0.8rem', display: 'inline-flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
        Temporary password: <code style={{ fontSize: '0.95rem', padding: '2px 6px', border: '1px solid var(--border)', borderRadius: '4px', userSelect: 'all' }}>{shown}</code>
        <span style={{ color: 'var(--text-muted)' }}>Give it to the buyer now; it won't be shown again.</span>
        <button className="btn-ghost" style={{ padding: '2px 8px', fontSize: '0.75rem' }} onClick={() => setShown(null)}>Done</button>
      </span>
    )
  }
  return (
    <button className="btn-ghost" style={{ padding: '4px 12px', fontSize: '0.8rem' }} disabled={busy} onClick={reset}>
      {busy ? '…' : '🔑 Temporary password'}
    </button>
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
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Buyer Management</h1>
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
            className={`ab-filter${filter === f ? ' ab-filter-on' : ''}`}
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
          {filtered.map(buyer => buyer.deleted ? (
            // Deleted by the buyer (A5): no personal data left, and nothing to act on - it can't be undone.
            <div key={buyer.user_id} className="card" style={{ padding: '1rem 1.25rem', opacity: 0.7 }}>
              <div style={{ fontWeight: 600 }}>Deleted account</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Joined {new Date(buyer.created_at).toLocaleDateString()} · personal details removed at the buyer's request
              </div>
            </div>
          ) : (
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
                    {buyer.card_verified_at && <span className="ab-ok"> · Card verified ✓</span>}
                    {buyer.card_verify_error && (
                      <span className="ab-bad"> · Card verify failed: {buyer.card_verify_error}</span>
                    )}
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
                      className="ab-block"
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
                  <TempPasswordButton buyer={buyer} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
