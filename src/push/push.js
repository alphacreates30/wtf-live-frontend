import { api } from '../api'

// Phone alerts by web push (live phase 6). The browser is asked for permission only from a tap (turnOn), never on
// page load. The server's public key comes from GET /config (null = phone alerts are off: nothing is shown).
let keyPromise = null
export const pushKey = () => (keyPromise ||= api.getConfig().then(c => c.push_public_key || null).catch(() => null))
export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const isIos = () => typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
export const isStandalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true)
// iPhone and iPad only allow phone alerts for a site added to the Home Screen and opened from there.
export const needsHomeScreen = () => isIos() && !isStandalone() && !pushSupported()

function keyBytes(b64) {
  const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(s), c => c.charCodeAt(0))
}
const sameKey = (a, b) => !!a && a.byteLength === b.byteLength && new Uint8Array(a).every((x, i) => x === b[i])

export async function currentSubscription() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration('/')
  return reg ? reg.pushManager.getSubscription() : null
}

// From a tap only. Throws an Error with a message to show.
export async function turnOn() {
  const key = await pushKey()
  if (!key || !pushSupported()) throw new Error('Phone alerts are not available on this browser.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(permission === 'denied' ? 'Notifications are blocked for this site. Allow them in your browser settings, then try again.' : 'Phone alerts were not turned on.')
  }
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  await navigator.serviceWorker.ready
  const want = keyBytes(key)
  let sub = await reg.pushManager.getSubscription()
  if (sub && !sameKey(sub.options?.applicationServerKey, want)) { await sub.unsubscribe(); sub = null }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: want })
  await api.subscribePush(sub.toJSON())
}

export async function turnOff() {
  const sub = await currentSubscription()
  if (!sub) return
  await api.unsubscribePush(sub.endpoint).catch(() => {})
  await sub.unsubscribe()
}
