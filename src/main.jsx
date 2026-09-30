import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { prefetchHome, prefetchLot } from './api'

// The homepage's (and a lot page's) data, requested before React renders (see api.getHome / getLotByNumber).
if (window.location.pathname === '/') prefetchHome()
const lotPath = window.location.pathname.match(/^\/a\/([a-z0-9-]{1,120})\/lot\/(\d{1,6})$/)
if (lotPath && !lotPath[1].startsWith('sample-')) prefetchLot(lotPath[1], lotPath[2])

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
