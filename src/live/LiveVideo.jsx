import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'
import { Room, RoomEvent, Track, createLocalTracks } from 'livekit-client'
import { api } from '../api'

// The show's video (LiveKit), for the host's phone and for viewers. One Room per mounted component; every room
// handler is named and removed on unmount.
//   host:     publishes the camera and microphone (back camera first), flips with restartTrack (no republish, so
//             viewers don't flicker), mutes the microphone. `controls` (a ref) gets { start, stop, flip, toggleMute }.
//   viewer:   subscribes only.
// `onStatus` hears { phase: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error',
// publishing, muted, facing, message }.
const LiveVideo = forwardRef(function LiveVideo({ auctionId, rehearsal, host = false, className = '', onStatus, children }, controls) {
  const videoRef = useRef(null)
  const roomRef = useRef(null)
  const tracksRef = useRef([])
  const [status, setStatus] = useState({ phase: 'idle', publishing: false, muted: false, facing: 'environment', message: '' })
  const statusRef = useRef(status)
  const update = patch => {
    statusRef.current = { ...statusRef.current, ...patch }
    setStatus(statusRef.current)
    onStatus?.(statusRef.current)
  }

  useEffect(() => {
    let cancelled = false
    const room = new Room({ adaptiveStream: true, dynacast: true, publishDefaults: { simulcast: true },
      videoCaptureDefaults: { resolution: { width: 1280, height: 720, frameRate: 24 } } })
    roomRef.current = room
    const attachRemote = () => {
      for (const p of room.remoteParticipants.values()) {
        for (const pub of p.trackPublications.values()) {
          if (pub.track?.kind === Track.Kind.Video && videoRef.current) pub.track.attach(videoRef.current)
          if (pub.track?.kind === Track.Kind.Audio) pub.track.attach()
        }
      }
    }
    const onSubscribed = track => {
      if (track.kind === Track.Kind.Video && videoRef.current) track.attach(videoRef.current)
      if (track.kind === Track.Kind.Audio) track.attach()
    }
    const onUnsubscribed = track => track.detach()
    const onReconnecting = () => update({ phase: 'reconnecting' })
    const onReconnected = () => update({ phase: 'connected' })
    const onDisconnected = () => update({ phase: 'disconnected' })
    room.on(RoomEvent.TrackSubscribed, onSubscribed)
    room.on(RoomEvent.TrackUnsubscribed, onUnsubscribed)
    room.on(RoomEvent.Reconnecting, onReconnecting)
    room.on(RoomEvent.Reconnected, onReconnected)
    room.on(RoomEvent.Disconnected, onDisconnected)

    ;(async () => {
      update({ phase: 'connecting' })
      try {
        const t = await api.getLiveToken(auctionId, rehearsal)
        const url = t.url || import.meta.env.VITE_LIVEKIT_URL
        if (cancelled) return
        if (!t.token || !url) { update({ phase: 'error', message: 'Live video is not set up yet.' }); return }
        await room.connect(url, t.token, { autoSubscribe: true })
        if (cancelled) { room.disconnect(); return }
        update({ phase: 'connected' })
        attachRemote()
      } catch (err) {
        if (!cancelled) update({ phase: 'error', message: err.status === 503 ? 'Live video is not set up yet.' : (err.message || 'Could not connect the video.') })
      }
    })()

    return () => {
      cancelled = true
      room.off(RoomEvent.TrackSubscribed, onSubscribed)
      room.off(RoomEvent.TrackUnsubscribed, onUnsubscribed)
      room.off(RoomEvent.Reconnecting, onReconnecting)
      room.off(RoomEvent.Reconnected, onReconnected)
      room.off(RoomEvent.Disconnected, onDisconnected)
      for (const t of tracksRef.current) t.stop()
      tracksRef.current = []
      room.disconnect()
      roomRef.current = null
    }
  }, [auctionId, rehearsal])   // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(controls, () => ({
    // Start the camera and microphone (back camera first; any camera; sound only as the last resort).
    async start() {
      const room = roomRef.current
      if (!host || !room || statusRef.current.publishing) return
      if (statusRef.current.phase !== 'connected') { update({ message: 'The video is not connected, so the camera is off. The show still runs.' }); return }
      let tracks
      try {
        tracks = await createLocalTracks({ audio: { echoCancellation: true, noiseSuppression: true }, video: { facingMode: 'environment' } })
      } catch {
        try { tracks = await createLocalTracks({ audio: true, video: true }) } catch {
          try { tracks = await createLocalTracks({ audio: true, video: false }) } catch {
            update({ message: 'Allow the camera and microphone for this site, then try again.' }); return
          }
        }
      }
      tracksRef.current = tracks
      for (const t of tracks) {
        await room.localParticipant.publishTrack(t)
        if (t.kind === Track.Kind.Video && videoRef.current) t.attach(videoRef.current)
      }
      update({ publishing: true, message: '' })
    },
    async stop() {
      const room = roomRef.current
      for (const t of tracksRef.current) { try { await room?.localParticipant.unpublishTrack(t) } catch { /* gone */ } t.stop() }
      tracksRef.current = []
      update({ publishing: false })
    },
    async flip() {
      const v = tracksRef.current.find(t => t.kind === Track.Kind.Video)
      if (!v) return
      const facing = statusRef.current.facing === 'environment' ? 'user' : 'environment'
      try { await v.restartTrack({ facingMode: facing }); update({ facing }) } catch { update({ message: 'This device has one camera.' }) }
    },
    async toggleMute() {
      const a = tracksRef.current.find(t => t.kind === Track.Kind.Audio)
      if (!a) return
      if (statusRef.current.muted) await a.unmute(); else await a.mute()
      update({ muted: !statusRef.current.muted })
    },
  }), [host])

  return (
    <div className={`lv ${className}`}>
      <video ref={videoRef} className={`lv-feed${host && status.facing === 'user' ? ' lv-mirror' : ''}`} autoPlay playsInline muted={host} />
      {children}
    </div>
  )
})

export default LiveVideo
