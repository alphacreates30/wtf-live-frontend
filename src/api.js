const BASE = import.meta.env.VITE_API_URL

function authHeaders() {
  const token = localStorage.getItem('wtf_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...options.headers },
    ...options,
  })
  const text = await res.text()
      const data = text ? JSON.parse(text) : {}
      if (!res.ok) throw new Error(data.error || 'Request failed')
      return data
}

export const api = {
  register: (username, password) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) }),

  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  getAuctions: (status) =>
    request(`/auctions${status ? `?status=${status}` : ''}`),

  getAuction: (id) => request(`/auction/${id}`),

  createAuction: (data) =>
    request('/auction', { method: 'POST', body: JSON.stringify(data) }),

  getBids: (id) => request(`/auction/${id}/bids`),
  getChat: (id) => request(`/auction/${id}/chat`),

  // Profile
  getMyProfile: () => request('/profile'),
  saveProfile: (data) =>
    request('/profile', { method: 'POST', body: JSON.stringify(data) }),
  getProfile: (userId) => request(`/profile/${userId}`),

  // Stripe
  createSetupIntent: () => request('/create-setup-intent', { method: 'POST' }),
  savePaymentMethod: (payment_method_id, customer_id) =>
    request('/save-payment-method', { method: 'POST', body: JSON.stringify({ payment_method_id, customer_id }) }),

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
  updateBuyerStatus: (userId, status) =>
    request(`/admin/buyers/${userId}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteAuction: (id) => request(`/auction/${id}`, { method: 'DELETE' }),
  getAdminOrders: () => request('/admin/orders'),
  generateLabel: (order_ids) =>
    request('/admin/orders/label', { method: 'POST', body: JSON.stringify({ order_ids }) }),
  groupOrders: (order_ids) =>
    request('/admin/orders/group', { method: 'POST', body: JSON.stringify({ order_ids }) }),
  ungroupOrder: (id) =>
    request(`/admin/orders/${id}/ungroup`, { method: 'POST' }),
  updateOrderStatus: (id, status) =>
    request(`/admin/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  // AI bulk lot creation
  analyzeLot: (images, condition) =>
    request('/ai/analyze-lot', { method: 'POST', body: JSON.stringify({ images, condition }) }),
  regenerateDescription: (title, condition) =>
    request('/ai/regenerate-description', { method: 'POST', body: JSON.stringify({ title, condition }) }),
  bulkCreateItems: (auctionId, lots) =>
    request(`/auction/${auctionId}/items/bulk`, { method: 'POST', body: JSON.stringify({ lots }) }),

  uploadImage: async (blob, mimeType) => {
    const token = localStorage.getItem('wtf_token')
    const res = await fetch(`${BASE}/upload-image`, {
      method: 'POST',
      headers: { 'Content-Type': mimeType || 'image/jpeg', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: blob,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Upload failed')
    return data
  },
}
