import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { pointsMoney as money } from '../points/points'
import './HostDashboard.css'
import '../points/points.css'

// Host: buyer points + promotions (G2, wtf-handoff POINTS_BRIEF.md). Settings, the total owed to buyers, promotions
// per auction, and one buyer's history with a manual +/- adjust.
const PROMO_LABEL = { percent_code: '% off code', free_shipping: 'Free shipping', bundle_free_shipping: 'Bundle bonus (3+ lots ship free)' }
const toLocalInput = d => new Date(d.getTime() - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16)
const fmt = iso => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function Settings({ onChange }) {
  const [s, setS] = useState(null)
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => { api.getPointsSettings().then(x => { setS(x); setForm({ ...x, reward_dollars: x.reward_cents / 100 }) }).catch(e => setErr(e.message)) }, [])
  if (!form) return <div className="card">{err ? <p className="error-msg">{err}</p> : <p>Loading…</p>}</div>

  async function save(e) {
    e.preventDefault(); setMsg(''); setErr('')
    try {
      const x = await api.savePointsSettings({
        enabled: form.admin_enabled, points_per_dollar: Number(form.points_per_dollar), points_per_reward: Number(form.points_per_reward),
        reward_cents: Math.round(Number(form.reward_dollars) * 100), expiry_months: Number(form.expiry_months),
      })
      setS(x); setForm({ ...x, reward_dollars: x.reward_cents / 100 }); setMsg('Saved.'); onChange?.()
    } catch (e2) { setErr(e2.message) }
  }
  const num = (k, label, step = 1) => (
    <div className="form-group"><label htmlFor={`pts-${k}`}>{label}</label>
      <input id={`pts-${k}`} type="number" min="0" step={step} value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} required /></div>
  )
  return (
    <div className="card">
      <h2 className="host-section-title">Points settings</h2>
      <p className="pts-small">
        Points are on only when <strong>POINTS_ENABLED=true</strong> is set on Railway <em>and</em> the switch below is on.
        Railway: <strong>{s.env_enabled ? 'on' : 'off'}</strong>. {s.migrated ? '' : 'The database migration (z) is not applied yet.'}
        {' '}Right now buyers {s.enabled ? <strong>see points</strong> : <strong>see nothing</strong>}.
      </p>
      <form onSubmit={save} className="host-form">
        <label className="pts-switch"><input type="checkbox" checked={!!form.admin_enabled} onChange={e => setForm({ ...form, admin_enabled: e.target.checked })} />
          <span><strong>Points on</strong><span>Earning and rewards. Promotions follow the Railway switch only.</span></span></label>
        <div className="form-row">{num('points_per_dollar', 'Points per $1 won')}{num('points_per_reward', 'Points per reward')}</div>
        <div className="form-row">{num('reward_dollars', 'Reward value ($)', 0.01)}{num('expiry_months', 'Expire after months with no win')}</div>
        {err && <p className="error-msg">{err}</p>}
        {msg && <p className="success-msg">{msg}</p>}
        <button type="submit" className="btn-primary host-submit">Save settings</button>
      </form>
    </div>
  )
}

function Summary({ tick }) {
  const [x, setX] = useState(null)
  useEffect(() => { api.getPointsSummary().then(setX).catch(() => setX(null)) }, [tick])
  if (!x) return null
  return (
    <div className="card">
      <h2 className="host-section-title">Points outstanding</h2>
      <dl className="pts-facts">
        <div><dt>Points held by buyers</dt><dd className="tabular">{x.points_outstanding} ({x.buyers} buyer{x.buyers === 1 ? '' : 's'})</dd></div>
        <div><dt>Worth at today's rate</dt><dd className="tabular">{money(x.value_cents)}</dd></div>
        <div><dt>Rewards ready to use</dt><dd className="tabular">{x.rewards_ready}</dd></div>
        <div><dt>Their value</dt><dd className="tabular">{money(x.ready_value_cents)}</dd></div>
      </dl>
      <p className="pts-small">A small promise owed to buyers. Rewards come out of the commission, never the consignor's payout.</p>
    </div>
  )
}

function Promotions({ auctions }) {
  const [list, setList] = useState([])
  const [err, setErr] = useState('')
  const now = new Date()
  const blank = { kind: 'percent_code', auction_id: '', code: '', percent: 20, starts_at: toLocalInput(now), ends_at: toLocalInput(new Date(now.getTime() + 7 * 864e5)) }
  const [f, setF] = useState(blank)
  const load = () => api.getPromotions().then(setList).catch(e => setErr(e.message))
  useEffect(() => { load() }, [])
  const title = id => auctions.find(a => a.id === id)?.title || 'Every auction'

  async function create(e) {
    e.preventDefault(); setErr('')
    try {
      await api.createPromotion({ kind: f.kind, auction_id: f.auction_id || null, code: f.kind === 'percent_code' ? f.code : undefined,
        percent: f.kind === 'percent_code' ? Number(f.percent) : undefined, starts_at: new Date(f.starts_at).toISOString(), ends_at: new Date(f.ends_at).toISOString() })
      setF(blank); load()
    } catch (e2) { setErr(e2.message) }
  }
  async function toggle(p) { try { await api.updatePromotion(p.id, { active: !p.active }); load() } catch (e2) { setErr(e2.message) } }
  async function remove(p) { try { await api.deletePromotion(p.id); load() } catch (e2) { setErr(e2.message) } }

  return (
    <div className="card">
      <h2 className="host-section-title">Promotions</h2>
      <form onSubmit={create} className="host-form">
        <div className="form-row">
          <div className="form-group"><label htmlFor="pr-kind">Kind</label>
            <select id="pr-kind" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>
              {Object.entries(PROMO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div className="form-group"><label htmlFor="pr-auction">Auction</label>
            <select id="pr-auction" value={f.auction_id} onChange={e => setF({ ...f, auction_id: e.target.value })}>
              <option value="">Every auction</option>
              {auctions.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select></div>
        </div>
        {f.kind === 'percent_code' && (
          <div className="form-row">
            <div className="form-group"><label htmlFor="pr-code">Code</label><input id="pr-code" value={f.code} onChange={e => setF({ ...f, code: e.target.value.toUpperCase() })} required minLength={3} maxLength={30} /></div>
            <div className="form-group"><label htmlFor="pr-pct">Percent off</label><input id="pr-pct" type="number" min="1" max="90" value={f.percent} onChange={e => setF({ ...f, percent: e.target.value })} required /></div>
          </div>
        )}
        <div className="form-row">
          <div className="form-group"><label htmlFor="pr-start">Starts</label><input id="pr-start" type="datetime-local" value={f.starts_at} onChange={e => setF({ ...f, starts_at: e.target.value })} required /></div>
          <div className="form-group"><label htmlFor="pr-end">Ends</label><input id="pr-end" type="datetime-local" value={f.ends_at} onChange={e => setF({ ...f, ends_at: e.target.value })} required /></div>
        </div>
        <p className="pts-small">A code is entered by buyers before the auction closes and doesn't stack with a points reward (the bigger saving wins). Free shipping counts lots won between the start and end.</p>
        {err && <p className="error-msg">{err}</p>}
        <button type="submit" className="btn-primary host-submit">Add promotion</button>
      </form>
      {list.length > 0 && (
        <ul className="pts-history" style={{ marginTop: 16 }}>
          {list.map(p => (
            <li key={p.id}>
              <span className="pts-hist-what"><strong>{PROMO_LABEL[p.kind]}{p.code ? `: ${p.code} (${p.percent}%)` : ''}</strong> · {title(p.auction_id)} · {fmt(p.starts_at)} to {fmt(p.ends_at)}{p.kind === 'percent_code' ? ` · ${p.uses.entered} entered, ${p.uses.applied} used` : ''}</span>
              <span>
                <button type="button" className="pts-link" onClick={() => toggle(p)}>{p.active ? 'Switch off' : 'Switch on'}</button>
                {!p.uses.applied && <button type="button" className="pts-link" onClick={() => remove(p)}>Delete</button>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function BuyerPoints({ buyers, initial, onChange }) {
  const [userId, setUserId] = useState(initial || '')
  const [p, setP] = useState(null)
  const [adj, setAdj] = useState({ points: '', note: '' })
  const [err, setErr] = useState('')
  const load = id => { setErr(''); setP(null); if (id) api.getBuyerPoints(id).then(setP).catch(e => setErr(e.message)) }
  useEffect(() => { load(userId) }, [userId])
  async function adjust(e) {
    e.preventDefault(); setErr('')
    try { await api.adjustBuyerPoints(userId, Number(adj.points), adj.note); setAdj({ points: '', note: '' }); load(userId); onChange?.() }
    catch (e2) { setErr(e2.message) }
  }
  return (
    <div className="card">
      <h2 className="host-section-title">A buyer's points</h2>
      <div className="form-group"><label htmlFor="bp-user">Buyer</label>
        <select id="bp-user" value={userId} onChange={e => setUserId(e.target.value)}>
          <option value="">Choose a buyer</option>
          {buyers.filter(b => !b.deleted).map(b => <option key={b.user_id} value={b.user_id}>{b.full_name || b.user_id}{b.email ? ` (${b.email})` : ''}</option>)}
        </select></div>
      {err && <p className="error-msg">{err}</p>}
      {p && (
        <>
          <p className="pts-balance"><span className="pts-num tabular">{p.balance}</span> points · @{p.username}{p.expires_at ? ` · expire ${new Date(p.expires_at).toLocaleDateString()}` : ''} · auto-apply {p.auto_apply ? 'on' : 'off'}</p>
          <form onSubmit={adjust} className="host-form">
            <div className="form-row">
              <div className="form-group"><label htmlFor="bp-pts">Adjust (+ or −)</label><input id="bp-pts" type="number" step="1" value={adj.points} onChange={e => setAdj({ ...adj, points: e.target.value })} required /></div>
              <div className="form-group"><label htmlFor="bp-note">Note (required)</label><input id="bp-note" value={adj.note} maxLength={300} onChange={e => setAdj({ ...adj, note: e.target.value })} required /></div>
            </div>
            <button type="submit" className="btn-primary host-submit" disabled={!adj.points || !adj.note.trim()}>Adjust points</button>
          </form>
          <ul className="pts-history" style={{ marginTop: 16 }}>
            {p.history.map((r, i) => (
              <li key={i}>
                <span className="pts-hist-what">{r.kind}{r.item_title ? `: ${r.item_title}` : ''}{r.note ? ` · ${r.note}` : ''}</span>
                <span className={`pts-hist-pts tabular${r.points < 0 ? ' neg' : ''}`}>{r.points > 0 ? '+' : ''}{r.points}</span>
                <span className="pts-hist-date">{fmt(r.created_at)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export default function HostRewards() {
  const [params] = useSearchParams()
  const [auctions, setAuctions] = useState([])
  const [buyers, setBuyers] = useState([])
  const [tick, setTick] = useState(0)
  useEffect(() => {
    api.getAuctions().then(a => setAuctions((a || []).filter(x => x.status !== 'ended'))).catch(() => {})
    api.getAdminBuyers().then(setBuyers).catch(() => {})
  }, [])
  const bump = () => setTick(t => t + 1)
  return (
    <div className="page host-page" style={{ display: 'grid', gap: 16, maxWidth: 760 }}>
      <div>
        <h1 className="host-title">Rewards</h1>
        <p className="host-sub">Buyer points ("Earn a point for every dollar you win. Every 250 points is $25 off.") and promotions.</p>
      </div>
      <Settings onChange={bump} />
      <Summary tick={tick} />
      <Promotions auctions={auctions} />
      <BuyerPoints buyers={buyers} initial={params.get('user')} onChange={bump} />
    </div>
  )
}
