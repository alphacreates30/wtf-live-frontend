import { io } from 'socket.io-client'

const BASE = import.meta.env.VITE_API_URL

let socket = null

export function getSocket() {
  if (!socket) {
    socket = io(BASE, { transports: ['websocket'] })
  }
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
