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
  const data = await res.json()
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

  // Admin
  getAdminBuyers: () => request('/admin/buyers'),
  updateBuyerStatus: (userId, status) =>
    request(`/admin/buyers/${userId}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
}
