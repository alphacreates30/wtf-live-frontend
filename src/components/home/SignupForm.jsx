import { useState, useId } from 'react'
import { api } from '../../api'
import './home.css'

// "Wake me when it opens." Stores the address only (POST /signup); the server
// answers the same way for a new or repeat address. `website` is a honeypot:
// hidden from people, tempting to bots.
export default function SignupForm({ tone = 'light', compact = false }) {
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [state, setState] = useState({ status: 'idle', message: '' })
  const fieldId = useId()

  async function submit(e) {
    e.preventDefault()
    setState({ status: 'sending', message: '' })
    try {
      const res = await api.signup(email.trim(), website)
      setState({ status: 'done', message: res.message })
    } catch (err) {
      setState({ status: 'error', message: err.message })
    }
  }

  if (state.status === 'done') {
    return <p className={`su-done su-${tone}`} role="status">{state.message}</p>
  }

  return (
    <form className={`su su-${tone}${compact ? ' su-compact' : ''}`} onSubmit={submit} noValidate>
      <label htmlFor={fieldId} className="su-label">Your email</label>
      <div className="su-row">
        <input
          id={fieldId}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <button type="submit" className="btn-primary" disabled={state.status === 'sending'}>
          {state.status === 'sending' ? 'Sending…' : 'Wake me'}
        </button>
      </div>
      <div className="su-hp" aria-hidden="true">
        <label>Website <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label>
      </div>
      {state.status === 'error' && <p className="error-msg" role="alert">{state.message}</p>}
    </form>
  )
}
