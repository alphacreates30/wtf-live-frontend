import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import './Navbar.css'
import { disconnectSocket } from '../socket'
import { CONSIGN_MAILTO } from './home/links'
import { useWatch } from '../watch/WatchContext'

// Buyers and visitors: mark + wordmark · search · Auctions · How it works · Consign ·
// Log in / account menu. Phones: mark + wordmark · search icon (opens a
// full-width bar) · menu. The admin's nav is its own (host links), unchanged.
export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const token = localStorage.getItem('wtf_token')
  const username = localStorage.getItem('wtf_username')
  const isAdmin = username === 'whatthefind'
  const watch = useWatch()
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const toggleRef = useRef(null)
  const firstLinkRef = useRef(null)
  const accountRef = useRef(null)
  const searchToggleRef = useRef(null)
  const searchInputRef = useRef(null)

  function logout() {
    localStorage.removeItem('wtf_token')
        localStorage.removeItem('wtf_username')
        localStorage.removeItem('wtf_user_id')
        disconnectSocket()
        navigate('/login')
  }

  function closeMenu() {
    setMenuOpen(false)
  }

  // Escape returns focus to the toggle - the user's keyboard focus was
  // inside the menu, and the toggle is the sensible place to land back on.
  function closeMenuAndRefocus() {
    setMenuOpen(false)
    toggleRef.current?.focus()
  }

  function submitSearch(e) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setSearchOpen(false)
    navigate(`/search?q=${encodeURIComponent(q)}`)
  }

  // Classic hamburger bug: a menu left open after navigating away.
  useEffect(() => {
    setMenuOpen(false)
    setAccountOpen(false)
    setSearchOpen(false)
  }, [location.pathname])

  // The search box shows what was searched for, and empties elsewhere.
  useEffect(() => {
    setQuery(location.pathname === '/search' ? (params.get('q') || '') : '')
  }, [location.pathname, params])

  useEffect(() => {
    if (!menuOpen) return
    firstLinkRef.current?.focus()

    function onKeyDown(e) {
      if (e.key === 'Escape') closeMenuAndRefocus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  useEffect(() => {
    if (!accountOpen) return
    function onDown(e) { if (!accountRef.current?.contains(e.target)) setAccountOpen(false) }
    function onKey(e) { if (e.key === 'Escape') { setAccountOpen(false); accountRef.current?.querySelector('button')?.focus() } }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [accountOpen])

  useEffect(() => {
    if (!searchOpen) return
    searchInputRef.current?.focus()
    function onKey(e) { if (e.key === 'Escape') { setSearchOpen(false); searchToggleRef.current?.focus() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [searchOpen])

  const searchField = (id, ref, extraClass = '') => (
    <form role="search" className={`navbar-search ${extraClass}`} onSubmit={submitSearch}>
      <label htmlFor={id} className="navbar-sr">Search every lot</label>
      <input
        id={id}
        ref={ref}
        type="search"
        enterKeyHint="search"
        placeholder="Search every lot…"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      <button type="submit" className="navbar-search-go" aria-label="Search"><SearchIcon /></button>
    </form>
  )

  if (isAdmin) return <AdminNav {...{ location, menuOpen, setMenuOpen, closeMenu, closeMenuAndRefocus, toggleRef, firstLinkRef, username, logout }} />

  return (
    <nav className="navbar navbar--public">
      {/* The wordmark travels with the mark, phones included (BRAND.md): the
          eyes are new, so the name has to show. Below 480px it scales down
          (Navbar.css) rather than hiding; it fits down to 300px. */}
      <Link to="/" className="navbar-logo" onClick={closeMenu}>
        <img src="/favicon.svg" alt="" className="navbar-mark" width="28" height="28" />
        <span className="navbar-wordmark">What The Find</span>
      </Link>

      {searchField('navbar-search-desktop', null, 'navbar-search-desktop')}

      <div className="navbar-right">
        <div className="navbar-links">
          <Link to="/auctions" className={`navbar-link ${location.pathname === '/auctions' ? 'active' : ''}`}>Auctions</Link>
          <Link to="/#how-it-works" className="navbar-link">How it works</Link>
          <a href={CONSIGN_MAILTO} className="navbar-link navbar-link-consign">Consign</a>
          {token && (
            <Link to="/watching" className={`navbar-link ${location.pathname === '/watching' ? 'active' : ''}`}>
              Watching{watch?.count ? <span className="navbar-count">{watch.count}</span> : null}
            </Link>
          )}
          {token ? (
            <div className="navbar-account" ref={accountRef}>
              <button
                type="button"
                className="navbar-account-btn"
                aria-expanded={accountOpen}
                aria-controls="navbar-account-menu"
                onClick={() => setAccountOpen(o => !o)}
              >
                @{username} <span aria-hidden="true">▾</span>
              </button>
              {accountOpen && (
                <div className="navbar-account-menu" id="navbar-account-menu">
                  <Link to="/my-bids" className="navbar-mobile-link">My Bids</Link>
                  <Link to="/my-orders" className="navbar-mobile-link">My Orders</Link>
                  <Link to="/profile-setup" className="navbar-mobile-link">Account</Link>
                  <Link to="/notifications" className="navbar-mobile-link">Email reminders</Link>
                  <button className="navbar-mobile-logout" onClick={() => { setAccountOpen(false); logout() }}>Log out</button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/login" className="btn-primary navbar-btn navbar-login">Log in</Link>
          )}
        </div>

        <button
          type="button"
          className="navbar-icon-btn navbar-search-toggle"
          aria-expanded={searchOpen}
          aria-controls="navbar-search-bar"
          aria-label={searchOpen ? 'Close search' : 'Search'}
          onClick={() => { setSearchOpen(o => !o); setMenuOpen(false) }}
          ref={searchToggleRef}
        >
          <SearchIcon />
        </button>
        <button
          type="button"
          className="navbar-hamburger"
          aria-expanded={menuOpen}
          aria-controls="navbar-mobile-menu"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => { setMenuOpen(o => !o); setSearchOpen(false) }}
          ref={toggleRef}
        >
          <span className="navbar-hamburger-bar" />
          <span className="navbar-hamburger-bar" />
          <span className="navbar-hamburger-bar" />
        </button>
      </div>

      {searchOpen && (
        <div className="navbar-search-bar" id="navbar-search-bar">
          {searchField('navbar-search-mobile', searchInputRef)}
        </div>
      )}

      {menuOpen && (
        <>
          <div className="navbar-mobile-backdrop" onClick={closeMenuAndRefocus} />
          <div className="navbar-mobile-menu" id="navbar-mobile-menu">
            <Link to="/auctions" className="navbar-mobile-link" onClick={closeMenu} ref={firstLinkRef}>Auctions</Link>
            <Link to="/#how-it-works" className="navbar-mobile-link" onClick={closeMenu}>How it works</Link>
            <a href={CONSIGN_MAILTO} className="navbar-mobile-link" onClick={closeMenu}>Consign a collection</a>
            {token ? (
              <>
                <div className="navbar-mobile-user">@{username}</div>
                <Link to="/watching" className="navbar-mobile-link" onClick={closeMenu}>Watching{watch?.count ? ` (${watch.count})` : ''}</Link>
                <Link to="/my-bids" className="navbar-mobile-link" onClick={closeMenu}>My Bids</Link>
                <Link to="/my-orders" className="navbar-mobile-link" onClick={closeMenu}>My Orders</Link>
                <Link to="/profile-setup" className="navbar-mobile-link" onClick={closeMenu}>Account</Link>
                <Link to="/notifications" className="navbar-mobile-link" onClick={closeMenu}>Email reminders</Link>
                <button className="navbar-mobile-logout" onClick={() => { closeMenu(); logout(); }}>Log out</button>
              </>
            ) : (
              <Link to="/login" className="navbar-mobile-link navbar-mobile-login" onClick={closeMenu}>Log in</Link>
            )}
          </div>
        </>
      )}
    </nav>
  )
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <line x1="15.5" y1="15.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" />
    </svg>
  )
}

// The admin's nav: host links, unchanged by the homepage refresh.
function AdminNav({ location, menuOpen, setMenuOpen, closeMenu, closeMenuAndRefocus, toggleRef, firstLinkRef, username, logout }) {
  const hostActive = location.pathname === '/host' || location.pathname.startsWith('/host/auction')
  return (
    <nav className="navbar navbar--admin">
      <Link to="/" className="navbar-logo" onClick={closeMenu}>
        <img src="/favicon.svg" alt="" className="navbar-mark" width="28" height="28" />
        <span className="navbar-wordmark">What The Find</span>
      </Link>
      <div className="navbar-right">
        <div className="navbar-links">
          <span className="navbar-user">@{username}</span>
          <Link to="/host" className={`navbar-link ${hostActive ? 'active' : ''}`}>Auctions</Link>
          <Link to="/host/buyers" className={`navbar-link ${location.pathname === '/host/buyers' ? 'active' : ''}`}>Buyers</Link>
          <Link to="/host/orders" className={`navbar-link ${location.pathname === '/host/orders' ? 'active' : ''}`}>Orders</Link>
          <Link to="/host/settings" className={`navbar-link ${location.pathname === '/host/settings' ? 'active' : ''}`}>Settings</Link>
          <button className="btn-ghost navbar-btn" onClick={logout}>Log out</button>
        </div>

        <button
          type="button"
          className="navbar-hamburger"
          aria-expanded={menuOpen}
          aria-controls="navbar-mobile-menu"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen(o => !o)}
          ref={toggleRef}
        >
          <span className="navbar-hamburger-bar" />
          <span className="navbar-hamburger-bar" />
          <span className="navbar-hamburger-bar" />
        </button>
      </div>

      {menuOpen && (
        <>
          <div className="navbar-mobile-backdrop" onClick={closeMenuAndRefocus} />
          <div className="navbar-mobile-menu" id="navbar-mobile-menu">
            <div className="navbar-mobile-user">@{username}</div>
            <Link to="/host" className={`navbar-mobile-link ${hostActive ? 'active' : ''}`} onClick={closeMenu} ref={firstLinkRef}>Auctions</Link>
            <Link to="/host/buyers" className={`navbar-mobile-link ${location.pathname === '/host/buyers' ? 'active' : ''}`} onClick={closeMenu}>Buyers</Link>
            <Link to="/host/orders" className={`navbar-mobile-link ${location.pathname === '/host/orders' ? 'active' : ''}`} onClick={closeMenu}>Orders</Link>
            <Link to="/host/settings" className={`navbar-mobile-link ${location.pathname === '/host/settings' ? 'active' : ''}`} onClick={closeMenu}>Settings</Link>
            <button className="navbar-mobile-logout" onClick={() => { closeMenu(); logout(); }}>Log out</button>
          </div>
        </>
      )}
    </nav>
  )
}
