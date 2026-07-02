ximport { useState, useEffect } from 'react'
import { api } from '../api'

export default function AuctionResults({ auctionId }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getStandardStatus(auctionId)
      .then(data => { setItems(data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [auctionId])

  if (loading) return <p style={{ color: 'var(--text-muted)', padding: '1rem' }}>Loading results…</p>
  if (!items.length) return <p style={{ color: 'var(--text-muted)', padding: '1rem' }}>No items found.</p>

  const soldItems = items.filter(it => it.highest_bidder)
  const totalGross = soldItems.reduce((sum, it) => sum + Number(it.current_bid || 0), 0)

  const fmt = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div style={{ marginTop: '1rem' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Lot</th>
            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Title</th>
            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Winner</th>
            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Final Bid</th>
            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Bids</th>
          </tr>
        </thead>
        <tbody>
          {items.map(it => (
            <tr key={it.id} style={{ borderBottom: '1px solid var(--border)', opacity: it.highest_bidder ? 1 : 0.5 }}>
              <td style={{ padding: '0.5rem 0.75rem' }}>{it.lot_number ?? '—'}</td>
              <td style={{ padding: '0.5rem 0.75rem' }}>{it.title}</td>
              <td style={{ padding: '0.5rem 0.75rem' }}>
                {it.highest_bidder
                  ? <strong>{it.highest_bidder}</strong>
                  : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Unsold</span>}
              </td>
              <td style={{ padding: '0.5rem 0.75rem' }}>{it.current_bid ? fmt(it.current_bid) : '—'}</td>
              <td style={{ padding: '0.5rem 0.75rem' }}>{it.bid_count ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', padding: '0.75rem', background: 'var(--surface)', borderRadius: 8 }}>
        <span style={{ color: 'var(--text-muted)' }}>{soldItems.length} of {items.length} lots sold</span>
        <strong style={{ fontSize: '1.1rem' }}>Total Gross: {fmt(totalGross)}</strong>
      </div>
    </div>
  )
}
