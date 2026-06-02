import { Link, useNavigate, useLocation } from 'react-router-dom'
import './Navbar.css'

export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const token = localStorage.getItem('wtf_token')
  const username = localStorage.getItem('wtf_username')

  function logout() {
    localStorage.removeItem('wtf_token')
    localStorage.removeItem('wtf_username')
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
            {username === 'whatthefind' && (
              <>
                <Link to="/host" className={`navbar-link ${location.pathname === '/host' ? 'active' : ''}`}>
                  Host
                </Link>
                <Link to="/admin/buyers" className={`navbar-link ${location.pathname === '/admin/buyers' ? 'active' : ''}`}>
                  Buyers
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
