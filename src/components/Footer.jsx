import { Link } from 'react-router-dom'
import './Footer.css'

export default function Footer() {
  return (
    <footer className="site-footer">
      <Link to="/" className="footer-brand">
        <img src="/logo-mark.svg" alt="" className="footer-mark" width="22" height="22" />
        <span>What The Find</span>
      </Link>
      <Link to="/terms" className="footer-link">Terms of Sale</Link>
    </footer>
  )
}
