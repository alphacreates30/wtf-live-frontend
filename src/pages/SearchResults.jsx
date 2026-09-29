import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useServerClock } from '../components/home/clock'
import LotCard from '../components/home/LotCard'
import '../components/home/home.css'

// GET /search over lot titles in live and upcoming auctions, in the same cards
// as the homepage. Full filters come later with the all-lots page.
export default function SearchResults() {
  const [params] = useSearchParams()
  const q = (params.get('q') || '').trim()
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const now = useServerClock(result?.server_now)

  useEffect(() => {
    let cancelled = false
    setResult(null)
    setError('')
    api.searchLots(q)
      .then(r => { if (!cancelled) setResult(r) })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [q])

  const lots = result?.lots || []
  return (
    <div className="page search-page home">
      <h1>{q ? <>Results for “{q}”</> : 'Search'}</h1>
      {error && <p className="error-msg">{error}</p>}
      {!result && !error && <p className="search-count">Searching…</p>}
      {result && (
        q.length < 2
          ? <p className="search-empty">Type at least two letters to search every lot.</p>
          : <>
              <p className="search-count" role="status">{lots.length === 1 ? '1 lot' : `${lots.length} lots`}{lots.length === 48 ? ' (first 48)' : ''}</p>
              {lots.length === 0
                ? <p className="search-empty">No lots match that yet. Try a shorter word.</p>
                : <div className="search-grid">{lots.map(l => <LotCard key={l.id} lot={l} premiumPct={result.premium_pct?.[l.auction_id]} now={now} />)}</div>}
            </>
      )}
    </div>
  )
}
