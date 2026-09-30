import { Link } from 'react-router-dom'
import { fmtTime } from './clock'

// "Closing this week" (GET /home `closing_schedule`): grouped by day in the
// site's time zone, which is also the zone the times are shown in, so a day's
// heading and its times always agree. Hidden when only one auction is open
// (the page decides that).
export default function ClosingSchedule({ entries, timezone, now }) {
  if (!entries.length) return null
  const dayKey = ms => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))
  const today = dayKey(now), tomorrow = dayKey(now + 86400e3)
  const label = date => {
    if (date === today) return 'Today'
    if (date === tomorrow) return 'Tomorrow'
    const noon = new Date(`${date}T12:00:00Z`)
    const within = noon.getTime() - now < 6 * 86400e3
    return noon.toLocaleDateString('en-US', within ? { weekday: 'long', timeZone: 'UTC' } : { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
  }
  const groups = []
  for (const e of entries) {
    const g = groups[groups.length - 1]
    if (g && g.date === e.date) g.items.push(e); else groups.push({ date: e.date, items: [e] })
  }
  // Only mention the zone when the viewer is somewhere else.
  const viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const zoneNote = viewerZone !== timezone
    ? new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'long' }).formatToParts(new Date(now)).find(p => p.type === 'timeZoneName')?.value
    : null

  return (
    <section className="cs" aria-labelledby="cs-h">
      <div className="section-head">
        <h2 id="cs-h" className="section-title">Closing this week</h2>
        {zoneNote && <p className="section-note">Times in {zoneNote}</p>}
      </div>
      <ol className="cs-days">
        {groups.map(g => (
          <li key={g.date} className="cs-day">
            <h3 className="cs-day-label">{label(g.date)}</h3>
            <ul className="cs-items">
              {g.items.map(e => (
                <li key={e.auction_id + e.date} className="cs-item">
                  <Link to={`/auction/${e.auction_id}`} className="cs-title">{e.title}</Link>
                  <span className="cs-times">
                    {e.first_close === e.last_close
                      ? `Closes ${fmtTime(e.first_close, timezone)}`
                      : `Lots close from ${fmtTime(e.first_close, timezone)} · Last lot ${fmtTime(e.last_close, timezone)}`}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  )
}
