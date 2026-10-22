import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { marked } from 'marked'
import { api } from '../api'
import { HOW_STEPS } from '../content/howItWorks'
import liveMarkdown from '../content/LIVE_SHOWS_HOW_IT_WORKS.md?raw'
import { usePointsConfig, pointsSentence } from '../points/points'
import '../components/home/home.css'
import './Terms.css'

// How it works: the four steps of a timed auction, and "Live shows" (wtf-handoff LIVE_SHOWS_HOW_IT_WORKS.md Part A),
// which the live room's "How live shows work" link opens (/how-it-works#live-shows). The live section shows only while
// live shows are switched on (GET /config live_enabled).
const liveHtml = marked.parse(liveMarkdown.replace(/^### Live shows/m, '## Live shows'))

export default function HowItWorks() {
  const pointsCfg = usePointsConfig()
  const location = useLocation()
  const [liveOn, setLiveOn] = useState(null)
  useEffect(() => { api.getConfig().then(c => setLiveOn(!!c.live_enabled)).catch(() => setLiveOn(false)) }, [])
  useEffect(() => {
    if (liveOn === null || !location.hash) return
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [liveOn, location.hash])

  return (
    <div className="page terms-page">
      <section className="how" aria-labelledby="how-h">
        <h1 id="how-h" className="section-title">How it works</h1>
        <ol className="how-steps how-steps-page">
          {HOW_STEPS.map(([title, text], i) => (
            <li key={title} className="how-step">
              <span className="how-num" aria-hidden="true">{i + 1}</span>
              <h2 className="how-step-title">{title}</h2>
              <p>{text}</p>
            </li>
          ))}
        </ol>
        {pointsCfg?.enabled && <p className="how-points">{pointsSentence(pointsCfg)}</p>}
      </section>
      {liveOn && <section id="live-shows" className="terms-content how-live" dangerouslySetInnerHTML={{ __html: liveHtml }} />}
    </div>
  )
}
