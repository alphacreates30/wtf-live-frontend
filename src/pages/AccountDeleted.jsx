import { Link } from 'react-router-dom'

// Where a buyer lands after deleting their account (A5). They're already signed out.
export default function AccountDeleted() {
  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <h2>Your account has been deleted</h2>
      <p>
        Your name, contact details, address and saved card have been removed, and you've been signed out everywhere.
        Records of past purchases are kept for accounting and tax, as our terms explain.
      </p>
      <p>We've sent a confirmation to the email address that was on your account.</p>
      <p><Link to="/">Back to the auctions</Link></p>
    </div>
  )
}
