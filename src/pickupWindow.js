// The pickup window's default: from the auction's close to PICKUP_DAYS later, the same length the Terms of Sale
// promise ("The pickup window is 7 days from the close of the auction"). The admin can still change both.
// Values are <input type="datetime-local"> strings: local wall-clock time, no zone ("2026-10-06T20:00").
export const PICKUP_DAYS = 7

const pad = n => String(n).padStart(2, '0')
export function toLocalInput(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// closeLocal: the auction's close as a datetime-local string. Adds calendar days (not 168 hours), so a window
// across a daylight-saving change still ends at the same time of day.
export function defaultPickupWindow(closeLocal) {
  const close = closeLocal ? new Date(closeLocal) : null   // "YYYY-MM-DDTHH:mm" parses as local time
  if (!close || isNaN(close.getTime())) return null
  const end = new Date(close)
  end.setDate(end.getDate() + PICKUP_DAYS)
  return { pickup_starts_at: toLocalInput(close), pickup_ends_at: toLocalInput(end) }
}
