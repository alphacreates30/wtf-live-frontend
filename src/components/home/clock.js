import { useState, useEffect } from 'react'

// Countdowns run on the SERVER's clock, not the phone's: the API sends
// server_now, we remember how far the device clock is off, and tick from there.
// A phone set five minutes fast would otherwise show a lot closing early.
export function useServerClock(serverNowIso) {
  const [offset, setOffset] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!serverNowIso) return
    const server = Date.parse(serverNowIso)
    if (!Number.isNaN(server)) setOffset(server - Date.now())
  }, [serverNowIso])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  return now + offset
}

export const HOUR = 3600e3

export function splitDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  }
}

// Same wording as the auction room's lot cards (StandardAuctionRoom timeLeftLabel).
export function shortTimeLeft(ms) {
  if (ms <= 0) return 'Closed'
  const { days, hours, minutes, seconds } = splitDuration(ms)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function money(n) {
  const v = Number(n) || 0
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })
}

export function fmtDateTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Where a lot links to: its auction, with the lot opened.
export const lotHref = lot => `/auction/${lot.auction_id}?lot=${lot.id}`
