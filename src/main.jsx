import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { prefetchHome } from './api'

// The homepage's data, requested before React renders (see api.getHome).
if (window.location.pathname === '/') prefetchHome()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
