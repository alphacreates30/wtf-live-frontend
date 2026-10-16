import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import RequestForm from '../components/RequestForm'
import { CONTACT_EMAIL } from '../components/home/links'
import { SERVICE_OPTIONS } from '../services/content'
import './Services.css'

// /contact: the request form pre-set to "General question" (or ?service=<key>), and the email address as plain text
// for people who prefer email (SERVICES_BRIEF.md §1). ?about=<text> starts the message, e.g. "Lot 3: <title>".
export default function Contact() {
  const [params] = useSearchParams()
  const service = SERVICE_OPTIONS.some(([k]) => k === params.get('service')) ? params.get('service') : 'general'
  const about = (params.get('about') || '').slice(0, 200)

  useEffect(() => {
    const prev = document.title
    document.title = 'Contact | What The Find'
    return () => { document.title = prev }
  }, [])

  return (
    <div className="page svc">
      <header className="svc-head">
        <p className="wtf-label">Contact</p>
        <h1 className="svc-title">Get in touch.</h1>
        <p className="svc-lede">A question about a lot, an order or anything else? Send us a message and we'll be in touch within 72 hours.</p>
        <p className="svc-lede">Prefer email? Write to us at <strong className="rf-email">{CONTACT_EMAIL}</strong>.</p>
      </header>
      <div className="svc-split">
        <section className="svc-form card" aria-label="Contact form">
          <RequestForm service={service} about={about} />
        </section>
        <aside className="svc-faq">
          <h2 className="svc-h2">Selling or consigning?</h2>
          <p className="svc-note">See our <Link to="/services" className="svc-inline-link">services</Link>: sell to us, consign, estate buyouts and collection auctions.</p>
        </aside>
      </div>
    </div>
  )
}
