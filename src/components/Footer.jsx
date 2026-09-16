import { Link } from 'react-router-dom'
import './Footer.css'

export default function Footer() {
  return (
    <footer className="site-footer">
      <Link to="/terms" className="footer-link">Terms of Sale</Link>
    </footer>
  )
}
