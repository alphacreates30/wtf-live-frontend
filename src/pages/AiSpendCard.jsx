import { useState, useEffect } from 'react'
import { api } from '../api'

// What AI cataloguing has cost, from the backend's ai_usage log. Admin-only on
// the server; anyone else gets a 403 and the card simply doesn't render.

const fmtCost = n => {
  if (n > 0 && n < 0.01) return '<$0.01'
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Same YYYY-MM-DD the server buckets by (it's told the browser's time zone).
const localDay = d => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

export default function AiSpendCard() {
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading')   // loading | ready | hidden | unset | error
  const [message, setMessage] = useState('')

  async function load() {
    setState('loading')
    try {
      setData(await api.getAiUsage())
      setState('ready')
    } catch (err) {
      if (err.status === 401 || err.status === 403) setState('hidden')
      else if (err.status === 503) { setState('unset'); setMessage(err.message) }
      else { setState('error'); setMessage(err.message) }
    }
  }

  useEffect(() => { load() }, [])

  if (state === 'hidden') return null

  const today = localDay(new Date())
  const month = today.slice(0, 7)
  const days = data?.by_day || {}
  const sum = pred => Object.entries(days).filter(([d]) => pred(d)).reduce((s, [, v]) => s + v.cost, 0)
  const todayCost = sum(d => d === today)
  const monthCost = sum(d => d.startsWith(month))

  return (
    <div className="card host-ai-spend">
      <div className="host-ai-head">
        <h2 className="host-section-title" style={{ marginBottom: 0 }}>AI spend</h2>
        {state !== 'loading' && <button className="host-ai-refresh" onClick={load}>Refresh</button>}
      </div>

      {state === 'loading' && <p className="host-ai-note">Loading…</p>}
      {state === 'unset' && <p className="host-ai-note">{message}</p>}
      {state === 'error' && <p className="host-ai-note">Couldn't load AI spend. {message}</p>}

      {state === 'ready' && (
        <>
          <div className="host-ai-figures">
            <div><span>Today</span><strong>{fmtCost(todayCost)}</strong></div>
            <div><span>This month</span><strong>{fmtCost(monthCost)}</strong></div>
            <div><span>All time</span><strong>{fmtCost(data.total.cost)}</strong></div>
          </div>
          <p className="host-ai-note">
            {data.total.calls.toLocaleString()} AI call{data.total.calls !== 1 ? 's' : ''} recorded.
            {data.total.unpriced_calls > 0 && ` ${data.total.unpriced_calls} used a model with no price on file and count as $0.`}
            {' '}Calls made before tracking was switched on aren't included.
          </p>
          {data.by_auction.length > 0 && (
            <details className="host-ai-auctions">
              <summary>By auction</summary>
              <ul>
                {data.by_auction.map(a => (
                  <li key={a.auction_id || 'none'}>
                    <span className="host-ai-name">
                      {a.auction_id == null ? 'No auction recorded' : a.deleted ? 'Deleted auction' : a.title}
                    </span>
                    <span className="host-ai-calls">{a.calls} call{a.calls !== 1 ? 's' : ''}</span>
                    <strong>{fmtCost(a.cost)}</strong>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}
