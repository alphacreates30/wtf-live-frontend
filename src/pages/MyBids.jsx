import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

export default function MyBids() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.getMyBids()
      .then(data => { setItems(data || []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const fmt = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Group by auction
  const grouped = items.reduce((acc, item) => {
    const aId = item.auction?.id || 'unknown'
    if (!acc[aId]) acc[aId] = { auction: item.auction, items: [] }
    acc[aId].items.push(item)
    return acc
  }, {})

  if (loading) return <div className="page"><p style={{ color: 'var(--text-muted)' }}>Loading your bids…</p></div>
  if (error) return <div className="page"><p style={{ color: 'var(--error)' }}>{error}</p></div>
  if (!items.length) return (
    <div className="page">
      <h1 style={{ marginBottom: '0.5rem' }}>My Bids</h1>
      <p style={{ color: 'var(--text-muted)' }}>You haven't bid on any items yet. <Link to="/">Browse auctions</Link></p>
    </div>
  )

  return (
    <div className="page">
      <h1 style={{ marginBottom: '1.5rem' }}>My Bids &amp; Wins</h1>

      {Object.values(grouped).map(({ auction, items: aItems }) => {
        const wins = aItems.filter(i => i.won && i.closed)
        const totalWon = wins.reduce((s, i) => s + Number(i.current_bid || 0), 0)
        return (
          <div key={auction?.id} style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
              <h2 style={{ margin: 0 }}>{auction?.title || 'Auction'}</h2>
              <span style={{
                padding: '0.2rem 0.6rem', borderRadius: 99, fontSize: '0.75rem', fontWeight: 600,
                background: auction?.status === 'ended' ? 'var(--surface)' : 'var(--accent)',
                color: auction?.status === 'ended' ? 'var(--text-muted)' : '#fff'
              }}>{auction?.status || 'unknown'}</span>
              {auction?.id && <Link to={'/auction/' + auction.id} style={{ fontSize: '0.85rem', color: 'var(--accent)' }}>View Auction</Link>}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '0.4rem 0.75rem', color: 'var(--text-muted)' }}>Lot</th>
                  <th style={{ padding: '0.4rem 0.75rem', color: 'var(--text-muted)' }}>Title</th>
                  <th style={{ padding: '0.4rem 0.75rem', color: 'var(--text-muted)' }}>Your Max Bid</th>
                  <th style={{ padding: '0.4rem 0.75rem', color: 'var(--text-muted)' }}>Final Price</th>
                  <th style={{ padding: '0.4rem 0.75rem', color: 'var(--text-muted)' }}>Result</th>
                </tr>
              </thead>
              <tbody>
                {aItems.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{item.lot_number ?? '—'}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{item.title}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{item.max_bid ? fmt(item.max_bid) : '—'}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{item.current_bid ? fmt(item.current_bid) : '—'}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      {!item.closed
                        ? (item.won
                            ? <span style={{ color: '#22c55e', fontWeight: 700 }}>Leading</span>
                            : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Outbid</span>)
                        : item.won
                          ? <span style={{ color: '#22c55e', fontWeight: 700 }}>Won</span>
                          : <span style={{ color: 'var(--text-muted)' }}>Lost</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {auction?.status === 'ended' && wins.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                <span>{wins.length} item{wins.length !== 1 ? 's' : ''} won &mdash; Total: <strong style={{ color: 'var(--text)' }}>{fmt(totalWon)}</strong></span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
