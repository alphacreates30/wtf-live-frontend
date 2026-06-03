import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Room,
  RoomEvent,
  Track,
  createLocalTracks,
} from 'livekit-client'
import './LiveStream.css'

export default function LiveStream({ auctionId, token, livekitUrl, isHost }) {
  const [room] = useState(() => new Room({
    adaptiveStream: true,
    dynacast: true,
    publishDefaults: {
      simulcast: false,
      videoSimulcastLayers: [],
    },
    videoCaptureDefaults: {
      resolution: { width: 1280, height: 720, frameRate: 24 },
    },
  }))
  const [isLive, setIsLive] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [participants, setParticipants] = useState(0)
  const [error, setError] = useState('')
  const [localTracks, setLocalTracks] = useState([])
  const hostVideoRef = useRef(null)
  const localPreviewRef = useRef(null)

  useEffect(() => {
    if (!token || !livekitUrl) return

    async function connect() {
      try {
        await room.connect(livekitUrl, token, {
          autoSubscribe: true,
        })
        setIsConnected(true)
        setParticipants(room.remoteParticipants.size + 1)
      } catch (err) {
        console.error('LiveKit connect error:', err)
        setError('Could not connect to stream. Please check your connection and reload.')
      }
    }

    connect()

    room.on(RoomEvent.ParticipantConnected, () => {
      setParticipants(room.remoteParticipants.size + 1)
    })
    room.on(RoomEvent.ParticipantDisconnected, () => {
      setParticipants(room.remoteParticipants.size + 1)
    })
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === Track.Kind.Video && hostVideoRef.current) {
        track.attach(hostVideoRef.current)
        setIsLive(true)
      }
    })
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.kind === Track.Kind.Video) {
        track.detach()
        setIsLive(false)
      }
    })

    return () => { room.disconnect() }
  }, [token, livekitUrl, room])

  const goLive = useCallback(async () => {
    try {
      setError('')
      // Try back camera first on mobile, fall back to any camera
      let tracks
      try {
        tracks = await createLocalTracks({
          audio: true,
          video: { facingMode: 'environment' },
        })
      } catch {
        tracks = await createLocalTracks({ audio: true, video: true })
      }
      setLocalTracks(tracks)
      for (const track of tracks) {
        await room.localParticipant.publishTrack(track)
        if (track.kind === Track.Kind.Video && localPreviewRef.current) {
          track.attach(localPreviewRef.current)
        }
      }
      setIsLive(true)
    } catch (err) {
      console.error('Go live error:', err)
      setError('Could not access camera/mic. Please allow permissions and try again.')
    }
  }, [room])

  const stopLive = useCallback(async () => {
    for (const track of localTracks) {
      await room.localParticipant.unpublishTrack(track)
      track.stop()
    }
    setLocalTracks([])
    setIsLive(false)
  }, [room, localTracks])

  useEffect(() => {
    if (!isConnected) return
    for (const [, participant] of room.remoteParticipants) {
      for (const [, publication] of participant.trackPublications) {
        if (publication.track && publication.kind === Track.Kind.Video) {
          publication.track.attach(hostVideoRef.current)
          setIsLive(true)
        }
      }
    }
  }, [isConnected, room])

  if (!isConnected && !error) {
    return <div className="livestream-loading">Connecting to stream…</div>
  }

  if (error && !isConnected) {
    return (
      <div className="livestream-loading" style={{flexDirection:'column',gap:'1rem'}}>
        <p style={{color:'#f87171',textAlign:'center'}}>{error}</p>
        <button className="btn-live" onClick={() => window.location.reload()}>Reload</button>
      </div>
    )
  }

  return (
    <div className="livestream">
      <div className="livestream-video">
        {isHost && isLive && (
          <video ref={localPreviewRef} className="livestream-feed" autoPlay muted playsInline />
        )}
        {!isHost && (
          <video ref={hostVideoRef} className="livestream-feed" autoPlay playsInline />
        )}
        {!isLive && (
          <div className="livestream-offline">
            {isHost ? 'Your camera will appear here when you go live' : 'Host is not live yet'}
          </div>
        )}
        {isLive && (
          <div className="livestream-badge">
            <span className="livestream-dot" />
            LIVE
          </div>
        )}
      </div>
      {isHost && (
        <div className="livestream-controls">
          {error && <p className="error-msg">{error}</p>}
          {!isLive ? (
            <button className="btn-live" onClick={goLive}>🔴 Go Live</button>
          ) : (
            <button className="btn-stop" onClick={stopLive}>■ End Stream</button>
          )}
        </div>
      )}
    </div>
  )
}
