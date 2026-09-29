import { splitDuration, HOUR } from './clock'

const pad = n => String(n).padStart(2, '0')

// Days / hrs / min tiles; in the final hour it becomes min / sec, so the
// seconds only tick when they matter. Plain props: `target` (ISO) and `now`
// (ms, server time) - nothing here fetches or decides anything.
export default function CountdownTiles({ target, now, label }) {
  const ms = Date.parse(target) - now
  if (!target || Number.isNaN(ms)) return null
  const { days, hours, minutes, seconds } = splitDuration(ms)
  const tiles = ms < HOUR
    ? [[minutes, 'Min'], [seconds, 'Sec']]
    : [[days, days === 1 ? 'Day' : 'Days'], [hours, 'Hrs'], [minutes, 'Min']]
  const spoken = ms <= 0 ? 'now'
    : ms < HOUR ? `${minutes} minutes ${seconds} seconds`
    : `${days} days ${hours} hours ${minutes} minutes`

  return (
    <div className="ct">
      {label && <p className="ct-label">{label}</p>}
      {/* role=timer is polite by default: announced when read, not every second. */}
      <div className="ct-tiles" role="timer" aria-label={`${label || 'Time left'}: ${spoken}`}>
        {tiles.map(([v, unit], i) => (
          <div key={unit} className={`ct-tile${i === 0 ? ' ct-tile-lead' : ''}`} aria-hidden="true">
            <b>{pad(v)}</b>
            <span>{unit}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
