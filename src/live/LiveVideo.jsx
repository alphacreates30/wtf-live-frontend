import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'
import { Room, RoomEvent, Track, createLocalTracks } from 'livekit-client'
import { api } from '../api'
import './LiveVideo.css'

// The show's video (LiveKit; audit §4), for the host's phone, the host's second device and viewers. One Room per
// mounted component; every room handler is named and removed on unmount.
//   host:        publishes the camera and microphone (back camera first) with simulcast, flips with restartTrack (no
//                republish, so viewers don't flicker), mutes the microphone. `controls` (a ref) gets
//                { start, stop, flip, toggleMute }.
//   controller:  the host's second device: watches what viewers see (its own subscribe-only identity), without
//                the sound (it sits next to the phone, so playing the show back would echo).
//   viewer:      subscribes only.
// The server says which LiveKit to connect to (its LIVEKIT_URL); there is no frontend setting. On screen: a
// "reconnecting" note, a Reconnect button if the video drops, "Tap for sound" when the browser (iPhone Safari) holds
// the sound back, and, while the show is on air, a "Back in a moment" slate when the host's picture goes away.
// `onStatus` hears { phase: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error',
// publishing, muted, facing, hostVideo, message }.
const LiveVideo = forwardRef(function LiveVideo({ auctionId, rehearsal, role = 'viewer', onAir = false, className = '', onStatus, children }, controls) {
  const host = role === 'host'
  const listen = role === 'viewer'
  const videoRef = useRef(null)
  const roomRef = useRef(null)
  const tracksRef = useRef([])
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState({ phase: 'idle', publishing: false, muted: false, facing: 'environment', hostVideo: false, hadVideo: false, needsTap: false, message: '' })
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
    let leaving = false
    const anyHostVideo = () => [...room.remoteParticipants.values()].some(p => [...p.trackPublications.values()].some(pub => pub.kind === Track.Kind.Video && pub.track))
    const attachRemote = () => {
      for (const p of room.remoteParticipants.values()) {
        for (const pub of p.trackPublications.values()) {
          if (pub.track?.kind === Track.Kind.Video && videoRef.current) pub.track.attach(videoRef.current)
          if (pub.track?.kind === Track.Kind.Audio && listen) pub.track.attach()
        }
      }
      update({ hostVideo: anyHostVideo(), hadVideo: statusRef.current.hadVideo || anyHostVideo() })
    }
    const onSubscribed = track => {
      if (track.kind === Track.Kind.Video && videoRef.current) { track.attach(videoRef.current); update({ hostVideo: true, hadVideo: true }) }
      if (track.kind === Track.Kind.Audio && listen) track.attach()
    }
    const onUnsubscribed = track => { track.detach(); if (track.kind === Track.Kind.Video) update({ hostVideo: anyHostVideo() }) }
    const onParticipantGone = () => update({ hostVideo: anyHostVideo() })
    const onReconnecting = () => update({ phase: 'reconnecting' })
    const onReconnected = () => { update({ phase: 'connected' }); attachRemote() }
    const onDisconnected = () => { if (!leaving) update({ phase: 'disconnected', hostVideo: false }) }
    // iPhone Safari (and others) hold remote sound back until the viewer taps: show "Tap for sound".
    const onAudioStatus = () => update({ needsTap: listen && !room.canPlaybackAudio })
    room.on(RoomEvent.TrackSubscribed, onSubscribed)
    room.on(RoomEvent.TrackUnsubscribed, onUnsubscribed)
    room.on(RoomEvent.ParticipantDisconnected, onParticipantGone)
    room.on(RoomEvent.Reconnecting, onReconnecting)
    room.on(RoomEvent.Reconnected, onReconnected)
    room.on(RoomEvent.Disconnected, onDisconnected)
    room.on(RoomEvent.AudioPlaybackStatusChanged, onAudioStatus)

    ;(async () => {
      update({ phase: 'connecting', message: '' })
      try {
        const t = await api.getLiveToken(auctionId, rehearsal, role === 'controller' ? 'controller' : undefined)
        if (cancelled) return
        if (!t.token || !t.url) { update({ phase: 'error', message: 'Live video is not set up yet.' }); return }
        await room.connect(t.url, t.token, { autoSubscribe: true })
        if (cancelled) { leaving = true; room.disconnect(); return }
        update({ phase: 'connected', needsTap: listen && !room.canPlaybackAudio })
        attachRemote()
      } catch (err) {
        if (cancelled) return
        // Our server's refusals (they have a status) say what's wrong; LiveKit's own errors are technical.
        update({ phase: 'error', message: err.status === 503 ? 'Live video is not set up yet.' : err.status ? err.message : "The video couldn't connect." })
      }
    })()

    return () => {
      cancelled = true
      leaving = true
      room.off(RoomEvent.TrackSubscribed, onSubscribed)
      room.off(RoomEvent.TrackUnsubscribed, onUnsubscribed)
      room.off(RoomEvent.ParticipantDisconnected, onParticipantGone)
      room.off(RoomEvent.Reconnecting, onReconnecting)
      room.off(RoomEvent.Reconnected, onReconnected)
      room.off(RoomEvent.Disconnected, onDisconnected)
      room.off(RoomEvent.AudioPlaybackStatusChanged, onAudioStatus)
      for (const t of tracksRef.current) t.stop()
      tracksRef.current = []
      room.disconnect()
      roomRef.current = null
    }
  }, [auctionId, rehearsal, role, attempt])   // eslint-disable-line react-hooks/exhaustive-deps

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
        await room.localParticipant.publishTrack(t, t.kind === Track.Kind.Video ? { simulcast: true } : {})
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

  const watching = !host
  const slate = watching && onAir && status.phase === 'connected' && !status.hostVideo
  return (
    <div className={`lv ${className}`}>
      <video ref={videoRef} className={`lv-feed${host && status.facing === 'user' ? ' lv-mirror' : ''}`} autoPlay playsInline muted={host} />
      <div className="lv-over">
        {slate && (
          <div className="lv-slate" role="status">
            <img src="/brand/state-asleep.svg" alt="" width="48" height="48" />
            <p>{status.hadVideo ? 'Back in a moment' : 'The host will be on camera in a moment'}</p>
          </div>
        )}
        {watching && status.phase === 'reconnecting' && <p className="lv-note" role="status">Reconnecting the video…</p>}
        {watching && status.phase === 'error' && (
          <div className="lv-note" role="status">{status.message} <button type="button" className="lv-btn" onClick={() => setAttempt(n => n + 1)}>Try again</button></div>
        )}
        {status.phase === 'disconnected' && (
          <div className="lv-note" role="alert">Video disconnected. <button type="button" className="lv-btn" onClick={() => setAttempt(n => n + 1)}>Reconnect</button></div>
        )}
        {listen && status.needsTap && status.phase === 'connected' && (
          <button type="button" className="lv-sound" onClick={async () => { try { await roomRef.current?.startAudio() } catch { /* still blocked */ } update({ needsTap: !roomRef.current?.canPlaybackAudio }) }}>Tap for sound</button>
        )}
      </div>
      {children}
    </div>
  )
})

export default LiveVideo
