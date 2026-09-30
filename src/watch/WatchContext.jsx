import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'

// The buyer's own watch list, for every page's Watch / Follow buttons.
// /home, /search and the auction pages are the same for everyone (cacheable);
// this fetches GET /me/watching once per login and marks the buttons itself.
//
// Logged out: tapping Watch or Follow remembers the action, sends the buyer to
// log in (and back), and completes it once they're logged in.
const PENDING_KEY = 'wtf_pending_watch'
const Ctx = createContext(null)

export function WatchProvider({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [token, setToken] = useState(() => localStorage.getItem('wtf_token'))
  const [lots, setLots] = useState(() => new Set())
  const [auctions, setAuctions] = useState(() => new Set())
  const [available, setAvailable] = useState(true)
  const [message, setMessage] = useState('')
  const busy = useRef(new Set())

  // The token changes on login/logout, which always comes with a navigation.
  useEffect(() => { setToken(localStorage.getItem('wtf_token')) }, [location.pathname])

  const refresh = useCallback(async () => {
    if (!localStorage.getItem('wtf_token')) { setLots(new Set()); setAuctions(new Set()); return null }
    try {
      const w = await api.getWatching()
      setLots(new Set(w.ids.lots)); setAuctions(new Set(w.ids.auctions)); setAvailable(w.available !== false)
      return w
    } catch { return null }
  }, [])

  const run = useCallback(async (kind, id, on) => {
    const key = kind + id
    if (busy.current.has(key)) return
    busy.current.add(key)
    const set = kind === 'lot' ? setLots : setAuctions
    set(prev => { const n = new Set(prev); on ? n.add(id) : n.delete(id); return n })   // optimistic
    try {
      if (kind === 'lot') await (on ? api.watchLot(id) : api.unwatchLot(id))
      else await (on ? api.followAuction(id) : api.unfollowAuction(id))
    } catch (e) {
      set(prev => { const n = new Set(prev); on ? n.delete(id) : n.add(id); return n })  // undo
      setMessage(e.message)
      setTimeout(() => setMessage(''), 5000)
    } finally {
      busy.current.delete(key)
    }
  }, [])

  // On login (or page load): first finish a Watch/Follow tapped while logged
  // out, THEN load the list - in that order, or the list (fetched before the
  // new watch is saved) would overwrite it.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (token) {
        let pending
        try { pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null') } catch { pending = null }
        if (pending && (pending.kind === 'lot' || pending.kind === 'auction')) {
          try { sessionStorage.removeItem(PENDING_KEY) } catch { /* private mode */ }
          await run(pending.kind, pending.id, true)
        }
      }
      if (!cancelled) await refresh()
    })()
    return () => { cancelled = true }
  }, [token, run, refresh])

  const toggle = useCallback((kind, id) => {
    if (!localStorage.getItem('wtf_token')) {
      try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ kind, id })) } catch { /* private mode */ }
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`)
      return
    }
    const on = !(kind === 'lot' ? lots : auctions).has(id)
    run(kind, id, on)
  }, [lots, auctions, run, navigate, location.pathname, location.search])

  const value = {
    loggedIn: !!token, available,
    isWatching: id => lots.has(id), isFollowing: id => auctions.has(id),
    toggleWatch: id => toggle('lot', id), toggleFollow: id => toggle('auction', id),
    count: lots.size + auctions.size, refresh, message,
  }
  return (
    <Ctx.Provider value={value}>
      {children}
      {message && <div className="watch-toast" role="alert">{message}</div>}
    </Ctx.Provider>
  )
}

export function useWatch() {
  return useContext(Ctx)
}
