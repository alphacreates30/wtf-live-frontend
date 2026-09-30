import { useState } from 'react'
import { Link } from 'react-router-dom'
import SignupForm from './home/SignupForm'
import { CONTACT_MAILTO, CONSIGN_MAILTO } from './home/links'
import './Footer.css'


// Only pages that exist are linked. The TODO slots below get their links when
// those pages are built - never a link to nothing.
export default function Footer() {
  const [signupOpen, setSignupOpen] = useState(false)
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand-col">
          <Link to="/" className="footer-brand">
            <img src="/favicon.svg" alt="" className="footer-mark" width="24" height="24" />
            <span>What The Find</span>
          </Link>
          <p className="footer-tagline">Every collection has a story worth telling.</p>
          {signupOpen
            ? <div className="footer-signup"><SignupForm tone="dark" compact /></div>
            : (
              <button type="button" className="footer-signup-link" onClick={() => setSignupOpen(true)} aria-expanded="false">
                Get the next drop by email →
              </button>
            )}
        </div>

        <nav className="footer-col" aria-labelledby="footer-buy">
          <h2 id="footer-buy" className="footer-col-title">Buy</h2>
          <Link to="/auctions" className="footer-link">Live auctions</Link>
          <Link to="/#how-it-works" className="footer-link">How bidding works</Link>
          {/* TODO(Results): past results page, when built. */}
        </nav>

        <nav className="footer-col" aria-labelledby="footer-help">
          <h2 id="footer-help" className="footer-col-title">Help</h2>
          <Link to="/terms" className="footer-link">Terms of sale</Link>
          <a href={CONTACT_MAILTO} className="footer-link">Contact</a>
          <a href={CONSIGN_MAILTO} className="footer-link">Consign a collection</a>
          {/* TODO(Consign): link the consign page instead of email when it's built. */}
          {/* TODO(FAQ), TODO(Privacy: A4 privacy policy), TODO(About): link each when its page exists. */}
        </nav>
      </div>
    </footer>
  )
}
