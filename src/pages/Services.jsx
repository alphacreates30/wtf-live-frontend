import { useEffect } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import RequestForm from '../components/RequestForm'
import { SERVICES, SERVICE_BY_SLUG } from '../services/content'
import './Services.css'

// /services (the overview: four cards) and /services/:slug (one service: headline, short copy, "How it works",
// a short FAQ, and the request form pre-set to it). SERVICES_BRIEF.md §2; copy in services/content.js.
export default function Services() {
  const { slug } = useParams()
  const service = slug ? SERVICE_BY_SLUG[slug] : null

  useEffect(() => {
    const prev = document.title
    document.title = `${service ? service.title : 'Services'} | What The Find`
    return () => { document.title = prev }
  }, [service])

  if (slug && !service) return <Navigate to="/services" replace />
  return service ? <ServicePage s={service} /> : <Overview />
}

function Overview() {
  return (
    <div className="page svc">
      <header className="svc-head">
        <p className="wtf-label">Services</p>
        <h1 className="svc-title">Every collection has a story.</h1>
        <p className="svc-lede">Selling one piece or a whole estate, tell us about it and we'll take it from there.</p>
      </header>
      <ul className="svc-cards">
        {SERVICES.map(s => (
          <li key={s.slug} className="svc-card card">
            <ServiceIcon slug={s.slug} />
            <h2 className="svc-card-title">{s.title}</h2>
            <p className="svc-card-line">{s.line}</p>
            <Link to={`/services/${s.slug}`} className="svc-card-link" aria-label={`Learn more: ${s.title}`}>Learn more →</Link>
          </li>
        ))}
      </ul>
      <p className="svc-note">A question about something else? <Link to="/contact" className="svc-inline-link">Contact us</Link>.</p>
    </div>
  )
}

function ServicePage({ s }) {
  return (
    <div className="page svc">
      <nav className="svc-crumbs" aria-label="Breadcrumb">
        <Link to="/services">Services</Link> <span aria-hidden="true">/</span> <span aria-current="page">{s.title}</span>
      </nav>
      <header className="svc-head">
        <p className="wtf-label">{s.title}</p>
        <h1 className="svc-title">{s.headline}</h1>
        {s.paragraphs.map((p, i) => <p key={i} className="svc-lede">{p}</p>)}
      </header>

      <section className="svc-steps" aria-labelledby="svc-steps-h">
        <h2 id="svc-steps-h" className="svc-h2">How it works</h2>
        <ol className="svc-step-list">
          {s.steps.map((step, i) => (
            <li key={i} className="svc-step">
              <span className="svc-step-n" aria-hidden="true">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="svc-split">
        <section className="svc-form card" aria-labelledby="svc-form-h">
          <h2 id="svc-form-h" className="svc-h2">Tell us about it</h2>
          <RequestForm service={s.key} />
        </section>
        <section className="svc-faq" aria-labelledby="svc-faq-h">
          <h2 id="svc-faq-h" className="svc-h2">Questions</h2>
          <dl>
            {s.faq.map(([q, a]) => (
              <div key={q} className="svc-faq-item">
                <dt>{q}</dt>
                <dd>{a}</dd>
              </div>
            ))}
          </dl>
          <p className="svc-note">See <Link to="/services" className="svc-inline-link">all services</Link>.</p>
        </section>
      </div>
    </div>
  )
}

// Line icons, ink, 1.6 stroke (no fills): a tag, a hand-off box, a house, a stack of frames.
export function ServiceIcon({ slug }) {
  const paths = {
    sell: <><path d="M3 12V4h8l10 10-8 8L3 12z" /><circle cx="7.5" cy="8.5" r="1.5" /></>,
    consign: <><path d="M3 8l9-5 9 5v9l-9 5-9-5V8z" /><path d="M3 8l9 5 9-5M12 13v9" /></>,
    estates: <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>,
    'collection-auctions': <><rect x="3" y="7" width="13" height="13" rx="1" /><path d="M7 3h13a1 1 0 0 1 1 1v13" /><path d="M6 17l3-4 3 3 2-2 2 3" /></>,
  }
  return (
    <svg className="svc-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true" focusable="false">
      {paths[slug]}
    </svg>
  )
}
