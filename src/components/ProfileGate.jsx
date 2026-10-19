import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { api } from '../api'

const ADMIN_USERNAME = 'whatthefind'

// A logged-in buyer needs an approved profile to get into these pages: no profile goes to /profile-setup; pending,
// rejected and blocked accounts see why. Logged out: the page itself decides. (Moved out of App.jsx for phase 5 §0:
// a live show's room is not behind it, so an account that isn't approved yet can watch.)
export default function ProfileGate({ children }) {
  const token = localStorage.getItem('wtf_token')
  const username = localStorage.getItem('wtf_username')
  const [profileStatus, setProfileStatus] = useState('loading')

  useEffect(() => {
    if (!token || username === ADMIN_USERNAME) {
      setProfileStatus('ok')
      return
    }
    api.getMyProfile()
      .then(profile => {
        setProfileStatus(profile?.status || 'no_profile')
      })
      .catch(() => setProfileStatus('no_profile'))
  }, [token, username])

  if (!token) return children

  if (profileStatus === 'loading') {
    return <div className="page"><p className="buyer-note">Checking profile...</p></div>
  }

  if (profileStatus === 'no_profile') {
    return <Navigate to="/profile-setup" replace />
  }

  if (profileStatus === 'pending') {
    return (
      <div className="page status-screen">
        <span className="status-tag status-tag-pending">Pending</span>
        <h2>Pending Approval</h2>
        <p>
          Your profile is under review. You'll be able to access auctions once approved by the WhatTheFind team.
        </p>
      </div>
    )
  }

  if (profileStatus === 'rejected') {
    return (
      <div className="page status-screen">
        <span className="status-tag status-tag-rejected">Not approved</span>
        <h2>Application Not Approved</h2>
        <p>
          Your buyer application was not approved. Please contact WhatTheFind for more information.
        </p>
      </div>
    )
  }

  if (profileStatus === 'blocked') {
    return (
      <div className="page status-screen">
        <span className="status-tag status-tag-blocked">Suspended</span>
        <h2>Account Suspended</h2>
        <p>Your account has been suspended. Please contact WhatTheFind.</p>
      </div>
    )
  }

  return children
}
