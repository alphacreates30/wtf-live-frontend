import { useEffect, useRef, useState } from 'react'
import { getSocket } from '../socket'

// One socket hook per live room (audit finding 19). It joins the show's room, re-joins after every reconnect, and
// registers each handler under its own name with a stable wrapper, so unmounting removes exactly those listeners
// (socket.off(event, wrapper)), never another component's. `handlers` may change on every render: the latest one
// is always called.
//
// Returns { connected, emit(event, payload) }. emit adds the auction id, the login token and the rehearsal key.
export function useRoomSocket(auctionId, { token, rehearsal } = {}, handlers = {}) {
  const [connected, setConnected] = useState(() => getSocket().connected)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers
  const names = Object.keys(handlers).sort().join(',')

  useEffect(() => {
    if (!auctionId) return
    const socket = getSocket()
    const join = () => socket.emit('join_auction', { auctionId, ...(token ? { token } : {}), ...(rehearsal ? { rehearsal } : {}) })
    const onConnect = () => { setConnected(true); join() }
    const onDisconnect = () => setConnected(false)
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    const wrappers = names ? names.split(',').map(event => {
      const fn = (...args) => handlersRef.current[event]?.(...args)
      socket.on(event, fn)
      return [event, fn]
    }) : []
    if (socket.connected) { setConnected(true); join() }
    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      for (const [event, fn] of wrappers) socket.off(event, fn)
    }
  }, [auctionId, token, rehearsal, names])

  const emit = (event, payload = {}) => getSocket().emit(event, { auctionId, ...(token ? { token } : {}), ...(rehearsal ? { rehearsal } : {}), ...payload })
  return { connected, emit }
}

// The server's clock: show_state and every clock event carry server_now; the countdown ticks from there, so a phone
// whose clock is off still shows the right time left. Returns now (ms, server time), re-rendering every 250 ms.
export function useServerNow(serverNowIso) {
  const [offset, setOffset] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = Date.parse(serverNowIso || '')
    if (!Number.isNaN(t)) setOffset(t - Date.now())
  }, [serverNowIso])
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])
  return now + offset
}

export const fmtMoney = n => {
  const v = Number(n) || 0
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })
}
export const secondsLeft = (endsAtIso, now) => (endsAtIso ? Math.max(0, Math.ceil((Date.parse(endsAtIso) - now) / 1000)) : null)
export function fmtDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  const pad = v => String(v).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}
export const CLOCK_PRESETS = [60, 30, 15, 5]
