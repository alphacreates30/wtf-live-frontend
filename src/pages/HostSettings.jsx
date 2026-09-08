import { useState } from 'react'
import './HostDashboard.css'

export default function HostSettings() {
  const username = localStorage.getItem('wtf_username')
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')
  const [pwLoading, setPwLoading] = useState(false)

  async function handlePasswordChange(e) {
    e.preventDefault()
    setPwError('')
    setPwSuccess('')
    if (pwForm.new_password !== pwForm.confirm_password) { setPwError('New passwords do not match'); return }
    setPwLoading(true)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('wtf_token')}` },
        body: JSON.stringify({ current_password: pwForm.current_password, new_password: pwForm.new_password })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to change password')
      setPwSuccess('Password updated!')
      setPwForm({ current_password: '', new_password: '', confirm_password: '' })
    } catch (err) {
      setPwError(err.message)
    } finally {
      setPwLoading(false)
    }
  }

  return (
    <div className="page host-page">
      <h1 className="host-title">Settings</h1>
      <p className="host-sub">Logged in as <strong>@{username}</strong></p>
      <div className="card" style={{ maxWidth: '480px' }}>
        <h2 className="host-section-title">Change Password</h2>
        <form onSubmit={handlePasswordChange} className="host-form">
          <div className="form-group"><label>Current Password</label><input type="password" value={pwForm.current_password} onChange={e=>setPwForm(p=>({...p,current_password:e.target.value}))} required /></div>
          <div className="form-group"><label>New Password</label><input type="password" value={pwForm.new_password} onChange={e=>setPwForm(p=>({...p,new_password:e.target.value}))} required minLength={6} /></div>
          <div className="form-group"><label>Confirm New Password</label><input type="password" value={pwForm.confirm_password} onChange={e=>setPwForm(p=>({...p,confirm_password:e.target.value}))} required /></div>
          {pwError && <p className="error-msg">{pwError}</p>}
          {pwSuccess && <p className="success-msg">{pwSuccess}</p>}
          <button type="submit" className="btn-primary host-submit" disabled={pwLoading}>{pwLoading?'Updating...':'Update Password'}</button>
        </form>
      </div>
    </div>
  )
}
