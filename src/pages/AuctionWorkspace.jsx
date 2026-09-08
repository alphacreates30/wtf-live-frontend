import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api'
import ItemManager from './ItemManager'
import AuctionResults from './AuctionResults'
import './AuctionWorkspace.css'

export default function AuctionWorkspace() {
  const { id } = useParams()
  const [auction, setAuction] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setAuction(null)
    setError('')
    api.getAuction(id).then(setAuction).catch(err => setError(err.message))
  }, [id])

  if (error) {
    return (
      <div className="page auction-workspace">
        <Link to="/host" className="aw-back">← Back to Host Dashboard</Link>
        <p className="error-msg">{error}</p>
      </div>
    )
  }

  if (!auction) {
    return (
      <div className="page auction-workspace">
        <Link to="/host" className="aw-back">← Back to Host Dashboard</Link>
        <p className="ar-empty">Loading auction…</p>
      </div>
    )
  }

  const showResults = auction.mode === 'standard' && auction.status === 'ended'

  return (
    <div className="page auction-workspace">
      <Link to="/host" className="aw-back">← Back to Host Dashboard</Link>
      <div className="aw-header">
        <span className={`badge badge-${auction.status}`}>{auction.status}</span>
        <h1 className="aw-title">{auction.title}</h1>
      </div>
      <div className="card">
        {showResults
          ? <AuctionResults auctionId={auction.id} />
          : <ItemManager auctionId={auction.id} auctionStatus={auction.status} auctionMode={auction.mode} />}
      </div>
    </div>
  )
}
