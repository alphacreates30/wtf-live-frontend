import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import './Navbar.css'
import { disconnectSocket } from '../socket'

export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const token = localStorage.getItem('wtf_token')
  const username = localStorage.getItem('wtf_username')
  const [menuOpen, setMenuOpen] = useState(false)
  const toggleRef = useRef(null)
  const firstLinkRef = useRef(null)

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

  // Classic hamburger bug: a menu left open after navigating away.
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    firstLinkRef.current?.focus()

    function onKeyDown(e) {
      if (e.key === 'Escape') closeMenuAndRefocus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  return (
    <nav className="navbar">
      {/* The wordmark travels with the mark wherever there's room — see the
          risk note in BRAND.md. Mark-only is acceptable below 480px, where
          .navbar-wordmark is hidden. */}
      <Link to="/" className="navbar-logo" onClick={closeMenu}>
        <img src="/logo-mark.svg" alt="" className="navbar-mark" width="28" height="28" />
        <span className="navbar-wordmark">What The Find</span>
      </Link>
      <div className="navbar-right">
        {token ? (
          <>
            <div className="navbar-links">
              <span className="navbar-user">@{username}</span>
              {username !== 'whatthefind' && <Link to="/my-bids" className="navbar-link">My Bids</Link>}
              {username !== 'whatthefind' && <Link to="/my-orders" className="navbar-link">My Orders</Link>}
              {username === 'whatthefind' && (
                <>
                  <Link to="/host" className={`navbar-link ${location.pathname === '/host' || location.pathname.startsWith('/host/auction') ? 'active' : ''}`}>
                    Auctions
                  </Link>
                  <Link to="/host/buyers" className={`navbar-link ${location.pathname === '/host/buyers' ? 'active' : ''}`}>
                    Buyers
                  </Link>
                  <Link to="/host/orders" className={`navbar-link ${location.pathname === '/host/orders' ? 'active' : ''}`}>
                    Orders
                  </Link>
                  <Link to="/host/settings" className={`navbar-link ${location.pathname === '/host/settings' ? 'active' : ''}`}>
                    Settings
                  </Link>
                </>
              )}
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
          </>
        ) : (
          <Link to="/login">
            <button className="btn-primary navbar-btn">Log in</button>
          </Link>
        )}
      </div>

      {token && menuOpen && (
        <>
          <div className="navbar-mobile-backdrop" onClick={closeMenuAndRefocus} />
          <div className="navbar-mobile-menu" id="navbar-mobile-menu">
            <div className="navbar-mobile-user">@{username}</div>
            {username !== 'whatthefind' && (
              <Link to="/my-bids" className="navbar-mobile-link" onClick={closeMenu} ref={firstLinkRef}>My Bids</Link>
            )}
            {username !== 'whatthefind' && <Link to="/my-orders" className="navbar-mobile-link" onClick={closeMenu}>My Orders</Link>}
            {username === 'whatthefind' && (
              <>
                <Link to="/host" className={`navbar-mobile-link ${location.pathname === '/host' || location.pathname.startsWith('/host/auction') ? 'active' : ''}`} onClick={closeMenu} ref={firstLinkRef}>
                  Auctions
                </Link>
                <Link to="/host/buyers" className={`navbar-mobile-link ${location.pathname === '/host/buyers' ? 'active' : ''}`} onClick={closeMenu}>
                  Buyers
                </Link>
                <Link to="/host/orders" className={`navbar-mobile-link ${location.pathname === '/host/orders' ? 'active' : ''}`} onClick={closeMenu}>
                  Orders
                </Link>
                <Link to="/host/settings" className={`navbar-mobile-link ${location.pathname === '/host/settings' ? 'active' : ''}`} onClick={closeMenu}>
                  Settings
                </Link>
              </>
            )}
            <button className="navbar-mobile-logout" onClick={() => { closeMenu(); logout(); }}>Log out</button>
          </div>
        </>
      )}
    </nav>
  )
}
