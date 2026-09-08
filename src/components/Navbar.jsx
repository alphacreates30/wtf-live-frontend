import { Link, useNavigate, useLocation } from 'react-router-dom'
import './Navbar.css'
import { disconnectSocket } from '../socket'

export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const token = localStorage.getItem('wtf_token')
  const username = localStorage.getItem('wtf_username')

  function logout() {
    localStorage.removeItem('wtf_token')
        localStorage.removeItem('wtf_username')
        localStorage.removeItem('wtf_user_id')
        disconnectSocket()
        navigate('/login')
  }

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-logo">
        WhatTheFind <span>LIVE</span>
      </Link>
      <div className="navbar-right">
        {token ? (
          <>
            <span className="navbar-user">@{username}</span>
            {username !== 'whatthefind' && <Link to="/my-bids" className="navbar-link">My Bids</Link>}
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
          </>
        ) : (
          <Link to="/login">
            <button className="btn-primary navbar-btn">Log in</button>
          </Link>
        )}
      </div>
    </nav>
  )
}
