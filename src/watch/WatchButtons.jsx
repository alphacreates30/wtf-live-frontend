import { useWatch } from './WatchContext'
import './watch.css'

// "Watch" (outline eye) / "Watching" (filled) on a lot. `compact` = icon only,
// for small cards; the accessible name always says what it does.
export function WatchButton({ itemId, compact = false, className = '' }) {
  const w = useWatch()
  if (!w) return null
  const on = w.isWatching(itemId)
  return (
    <button
      type="button"
      className={`watch-btn${on ? ' watch-on' : ''}${compact ? ' watch-compact' : ''} ${className}`}
      aria-pressed={on}
      aria-label={on ? 'Watching this lot: tap to stop watching' : 'Watch this lot'}
      onClick={e => { e.preventDefault(); e.stopPropagation(); w.toggleWatch(itemId) }}
    >
      <EyeIcon filled={on} />
      {!compact && <span>{on ? 'Watching' : 'Watch'}</span>}
    </button>
  )
}

// "Follow" an open auction; "Remind me" before it opens.
export function FollowButton({ auctionId, upcoming = false, className = '' }) {
  const w = useWatch()
  if (!w) return null
  const on = w.isFollowing(auctionId)
  const label = upcoming ? (on ? 'Reminder set' : 'Remind me') : (on ? 'Following' : 'Follow')
  return (
    <button
      type="button"
      className={`watch-btn follow-btn${on ? ' watch-on' : ''} ${className}`}
      aria-pressed={on}
      onClick={e => { e.preventDefault(); e.stopPropagation(); w.toggleFollow(auctionId) }}
    >
      <BellIcon filled={on} />
      <span>{label}</span>
    </button>
  )
}

function EyeIcon({ filled }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12Z" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3.2" fill={filled ? 'var(--surface)' : 'none'} stroke={filled ? 'var(--surface)' : 'currentColor'} strokeWidth="1.8" />
    </svg>
  )
}

function BellIcon({ filled }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 9.5a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4s2-1.5 2-6.5Z" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10 19.5a2.2 2.2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
