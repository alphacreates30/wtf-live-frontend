const BASE = import.meta.env.VITE_API_URL

// Same pattern as the backend's own Resend call (server.js, AbortSignal.timeout(8000)) -
// without this, an unreachable or slow backend hangs the UI indefinitely instead of
// erroring out. AI/upload calls pass a longer timeoutMs since they're legitimately slower.
const DEFAULT_TIMEOUT_MS = 8000

function authHeaders() {
  const token = localStorage.getItem('wtf_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request(path, { timeoutMs = DEFAULT_TIMEOUT_MS, ...options } = {}) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...authHeaders(), ...options.headers },
      signal: AbortSignal.timeout(timeoutMs),
      ...options,
    })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new Error('The server is taking too long to respond. Check your connection and try again.')
    }
    throw new Error('Could not reach the server. Check your connection and try again.')
  }
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    // Non-JSON body (e.g. a platform error page during a deploy) - surface
    // something readable instead of a raw JSON parse error.
    throw new Error(`Server error (${res.status}). Try again in a moment.`)
  }
  if (!res.ok) {
    if (res.status === 401 && data?.code === 'session_revoked') {
      localStorage.removeItem('wtf_token')
      localStorage.removeItem('wtf_username')
      if (window.location.pathname !== '/login') window.location.assign('/login')
    }
    throw apiError(data, res, 'Request failed')
  }
  return data
}

// The backend sends `error` (a short sentence) and often `detail` (the specific
// reason - e.g. error: 'Payment failed', detail: 'Your card was declined.'). Dropping
// `detail` made a declined card, an expired card and insufficient funds all read
// "Payment failed", which is the whole value of the charge/retry screen thrown away
// one line before display. `detail` is sometimes an array or object (Shippo's
// `messages`), so it's normalised to a string - never "[object Object]".
export function formatDetail(detail) {
  if (detail == null || detail === '') return ''
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map(formatDetail).filter(Boolean).join('; ')
  if (typeof detail === 'object') {
    if (typeof detail.text === 'string') return detail.text
    if (typeof detail.message === 'string') return detail.message
    try { return JSON.stringify(detail) } catch { return String(detail) }
  }
  return String(detail)
}

export function apiError(data, res, fallback) {
  const detail = formatDetail(data?.detail)
  const base = data?.error ? formatDetail(data.error) : `${fallback} (${res.status})`
  // Don't repeat the reason when the sentence already contains it.
  const err = new Error(detail && !base.includes(detail) ? `${base} — ${detail}` : base)
  err.status = res.status
  err.detail = detail
  if (Array.isArray(data?.reasons)) err.reasons = data.reasons   // e.g. why an account can't be deleted yet
  return err
}

// Started as the page script loads when the URL is the homepage (main.jsx), in
// parallel with React rendering, and handed to the first api.getHome() call.
let prefetchedHome = null
export function prefetchHome() {
  if (prefetchedHome) return
  prefetchedHome = request('/home')
  prefetchedHome.catch(() => { prefetchedHome = null })   // a failed early fetch is simply retried by the page
}

export const api = {
  register: (username, password, email) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify({ username, password, email }) }),
  getMe: () => request('/auth/me'),
  setEmail: (email, current_password) =>
    request('/auth/email', { method: 'POST', body: JSON.stringify({ email, current_password }) }),
  // identifier: a username or an email. The server answers the same either way.
  forgotPassword: (identifier) =>
    request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ identifier }) }),
  resetPassword: (token, new_password) =>
    request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, new_password }) }),
  adminSetPassword: (userId, new_password) =>
    request(`/admin/users/${userId}/password`, { method: 'POST', body: JSON.stringify({ new_password }) }),

  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  getAuctions: (status) =>
    request(`/auctions${status ? `?status=${status}` : ''}`),

  getAuction: (id) => request(`/auction/${id}`),
  // Homepage (API.md): public, the same calls a future app makes.
  // The homepage's first /home is started by main.jsx before React renders
  // (prefetchHome), so the first photos start loading sooner; use it once.
  getHome: () => {
    const early = prefetchedHome
    prefetchedHome = null
    return early || request('/home')
  },
  searchLots: (q) => request(`/search?q=${encodeURIComponent(q)}`),
  signup: (email, website = '') => request('/signup', { method: 'POST', body: JSON.stringify({ email, website }) }),
  // Watch list and reminders (API.md). Only ever the logged-in buyer's own.
  watchLot: (itemId) => request(`/watch/${itemId}`, { method: 'POST' }),
  unwatchLot: (itemId) => request(`/watch/${itemId}`, { method: 'DELETE' }),
  followAuction: (auctionId) => request(`/follow/${auctionId}`, { method: 'POST' }),
  unfollowAuction: (auctionId) => request(`/follow/${auctionId}`, { method: 'DELETE' }),
  getWatching: () => request('/me/watching'),
  getNotificationPrefs: () => request('/me/notification-prefs'),
  setNotificationPrefs: (prefs) => request('/me/notification-prefs', { method: 'PUT', body: JSON.stringify(prefs) }),
  unsubscribeInfo: (token) => request(`/unsubscribe?token=${encodeURIComponent(token)}`),
  unsubscribe: (token) => request(`/unsubscribe?token=${encodeURIComponent(token)}`, { method: 'POST' }),
  getWatchCounts: (auctionId) => request(`/admin/watch-counts?auction_id=${auctionId}`),
  updateAuction: (id, data) =>
    request(`/auction/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  createAuction: (data) =>
    request('/auction', { method: 'POST', body: JSON.stringify(data) }),
  publishAuction: (id) =>
    request(`/auction/${id}/publish`, { method: 'POST' }),

  getTermsAcceptance: (auctionId) => request(`/auction/${auctionId}/terms-acceptance`),
  acceptTerms: (auctionId, fulfillment_choice) =>
    request(`/auction/${auctionId}/terms-acceptance`, { method: 'POST', body: JSON.stringify(fulfillment_choice ? { fulfillment_choice } : {}) }),
  updateFulfillmentChoice: (auctionId, fulfillment_choice) =>
    request(`/auction/${auctionId}/fulfillment-choice`, { method: 'PATCH', body: JSON.stringify({ fulfillment_choice }) }),

  getBids: (id) => request(`/auction/${id}/bids`),
  getChat: (id) => request(`/auction/${id}/chat`),

  // Profile
  getMyProfile: () => request('/profile'),
  saveProfile: (data) =>
    request('/profile', { method: 'POST', body: JSON.stringify(data) }),
  getProfile: (userId) => request(`/profile/${userId}`),

  // Stripe
  createSetupIntent: () => request('/create-setup-intent', { method: 'POST' }),
  savePaymentMethod: (payment_method_id) =>
    request('/save-payment-method', { method: 'POST', body: JSON.stringify({ payment_method_id }) }),

  // Auction Items
  getAuctionItems: (auctionId) => request(`/auction/${auctionId}/items`),
  createAuctionItem: (auctionId, data) =>
    request(`/auction/${auctionId}/items`, { method: 'POST', body: JSON.stringify(data) }),
  updateAuctionItem: (auctionId, itemId, data) =>
    request(`/auction/${auctionId}/items/${itemId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAuctionItem: (auctionId, itemId) =>
    request(`/auction/${auctionId}/items/${itemId}`, { method: 'DELETE' }),

  // Pre-bids
  placePrebid: (auctionId, itemId, max_amount) =>
    request(`/auction/${auctionId}/items/${itemId}/prebid`, { method: 'POST', body: JSON.stringify({ max_amount }) }),
  getMyPrebid: (auctionId, itemId) =>
    request(`/auction/${auctionId}/items/${itemId}/prebid`),
  cancelPrebid: (auctionId, itemId) =>
    request(`/auction/${auctionId}/items/${itemId}/prebid`, { method: 'DELETE' }),

    // Standard auction proxy bidding
    placeStandardBid: (auctionId, itemId, max_amount) =>
          request(`/auction/${auctionId}/items/${itemId}/bid`, { method: 'POST', body: JSON.stringify({ max_amount }) }),
    getStandardStatus: (auctionId) => request(`/auction/${auctionId}/items/standard-status`),
  


    // Item Images
    getItemImages: (auctionId, itemId) => request(`/auction/${auctionId}/items/${itemId}/images`),
    addItemImage: (auctionId, itemId, url, position) =>
          request(`/auction/${auctionId}/items/${itemId}/images`, { method: 'POST', body: JSON.stringify({ url, position }) }),
    deleteItemImage: (imageId) => request(`/item-image/${imageId}`, { method: 'DELETE' }),
  // Admin
  getAdminBuyers: () => request('/admin/buyers'),
  getMyBids: () => request('/my-bids'),
  getMyOrders: () => request('/my-orders'),
  updateBuyerStatus: (userId, status) =>
    request(`/admin/buyers/${userId}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteAuction: (id) => request(`/auction/${id}`, { method: 'DELETE' }),
  // { auction_id, q, limit, offset } -> { orders, total, matched }
  getAdminOrders: (params = {}) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') qs.set(k, v)
    const s = qs.toString()
    return request(`/admin/orders${s ? `?${s}` : ''}`)
  },
  getAdminAuctionsSummary: () => request('/admin/auctions/summary'),
  chargeOrder: (order_id) =>
    request('/charge-winner', { method: 'POST', body: JSON.stringify({ order_id }) }),
  // Standard-auction orders are billed on one invoice per buyer per auction -
  // charge/retry that instead of an individual order. Same endpoint as
  // chargeOrder; the backend routes on which field is present.
  chargeInvoice: (invoice_id) =>
    request('/charge-winner', { method: 'POST', body: JSON.stringify({ invoice_id }) }),
  getShippingQuote: (order_ids, { weight_oz, length_in, width_in, height_in }) =>
    request('/admin/orders/shipping-quote', { method: 'POST', body: JSON.stringify({ order_ids, weight_oz, length_in, width_in, height_in }) }),
  chargeAndBuyLabel: (order_ids, rate_id, amount_cents) =>
    request('/admin/orders/label', { method: 'POST', body: JSON.stringify({ order_ids, rate_id, amount_cents }) }),
  groupOrders: (order_ids) =>
    request('/admin/orders/group', { method: 'POST', body: JSON.stringify({ order_ids }) }),
  ungroupOrder: (id) =>
    request(`/admin/orders/${id}/ungroup`, { method: 'POST' }),
  updateOrderStatus: (id, status) =>
    request(`/admin/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  // AI bulk lot creation - longer timeout than the default, this is genuine
  // vision-model processing, not a plain CRUD call.
  // auction_id only attributes the call's cost in the AI spend log.
  analyzeLot: (images, condition, auction_id) =>
    request('/ai/analyze-lot', { method: 'POST', body: JSON.stringify({ images, condition, auction_id }), timeoutMs: 45000 }),
  regenerateDescription: (title, condition, auction_id) =>
    request('/ai/regenerate-description', { method: 'POST', body: JSON.stringify({ title, condition, auction_id }), timeoutMs: 20000 }),
  // Totals by day are bucketed in the browser's time zone, so "today" is the host's today.
  getAiUsage: () =>
    request(`/admin/ai-usage?tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')}`),
  bulkCreateItems: (auctionId, lots) =>
    request(`/auction/${auctionId}/items/bulk`, { method: 'POST', body: JSON.stringify({ lots }) }),

  deleteAccount: (password, confirm) =>
    request('/account/delete', { method: 'POST', body: JSON.stringify({ password, confirm }) }),

  uploadImage: async (blob, mimeType) => {
    const token = localStorage.getItem('wtf_token')
    let res
    try {
      res = await fetch(`${BASE}/upload-image`, {
        method: 'POST',
        headers: { 'Content-Type': mimeType || 'image/jpeg', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: blob,
        signal: AbortSignal.timeout(30000),
      })
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        throw new Error('The upload is taking too long. Check your connection and try again.')
      }
      throw new Error('Could not reach the server. Check your connection and try again.')
    }
    const data = await res.json()
    if (!res.ok) throw apiError(data, res, 'Upload failed')
    return data
  },
}
