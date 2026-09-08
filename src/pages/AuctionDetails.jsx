import './HostDashboard.css'

// Title/description/category are read-only here for now - there's no
// PATCH /auction/:id endpoint yet, and this phase is frontend-only.
// Pickup and buyer's premium are disabled placeholders per the UX brief;
// they get wired up (backend + UI) separately.
export default function AuctionDetails({ auction }) {
  return (
    <div className="host-form" style={{ maxWidth: '560px' }}>
      <div className="form-group">
        <label>Title</label>
        <input value={auction.title || ''} disabled />
      </div>
      <div className="form-group">
        <label>Description</label>
        <textarea value={auction.description || ''} disabled rows={3} />
      </div>
      <div className="form-group">
        <label>Category</label>
        <input value={auction.category || ''} disabled placeholder="None set" />
      </div>
      <div className="form-group">
        <label>Pickup Location <span className="aw-soon-tag">Coming soon</span></label>
        <input disabled placeholder="Not configured yet" />
      </div>
      <div className="form-group">
        <label>Pickup Instructions <span className="aw-soon-tag">Coming soon</span></label>
        <textarea disabled rows={2} placeholder="Not configured yet" />
      </div>
      <div className="form-group">
        <label>Buyer's Premium (%) <span className="aw-soon-tag">Coming soon</span></label>
        <input value={auction.buyers_premium_pct ?? 15} disabled />
      </div>
    </div>
  )
}
