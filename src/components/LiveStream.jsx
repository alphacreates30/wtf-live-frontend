import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Room,
  RoomEvent,
  Track,
  createLocalTracks,
  LocalVideoTrack,
  LocalAudioTrack,
} from 'livekit-client'
import './LiveStream.css'

export default function LiveStream({ auctionId, token, livekitUrl, isHost }) {
  const [room] = useState(() => new Room({
    adaptiveStream: true,
    dynacast: true,
  }))
  const [isLive, setIsLive] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [participants, setParticipants] = useState(0)
  const [error, setError] = useState('')
  const [localTracks, setLocalTracks] = useState([])
  const hostVideoRef = useRef(null)
  const localPreviewRef = useRef(null)

  // Connect to LiveKit room
  useEffect(() => {
    if (!token || !livekitUrl) return

    async function connect() {
      try {
        await room.connect(livekitUrl, token)
        setIsConnected(true)
        setParticipants(room.remoteParticipants.size + 1)
      } catch (err) {
        console.error('LiveKit connect error:', err)
        setError('Could not connect to stream')
      }
    }

    connect()

    room.on(RoomEvent.ParticipantConnected, () => {
      setParticipants(room.remoteParticipants.size + 1)
    })
    room.on(RoomEvent.ParticipantDisconnected, () => {
      setParticipants(room.remoteParticipants.size + 1)
    })

    // When a remote track is published (host goes live)
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === Track.Kind.Video && hostVideoRef.current) {
        track.attach(hostVideoRef.current)
      }
    })
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.kind === Track.Kind.Video) {
        track.detach()
        setIsLive(false)
      }
    })

    return () => {
      room.disconnect()
    }
  }, [token, livekitUrl, room])

  // Host: go live
  const goLive = useCallback(async () => {
    try {
      setError('')
      const tracks = await createLocalTracks({ audio: true, video: true })
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
      setError('Could not access camera/mic. Please allow permissions.')
    }
  }, [room])

  // Host: stop stream
  const stopLive = useCallback(async () => {
    for (const track of localTracks) {
      await room.localParticipant.unpublishTrack(track)
      track.stop()
    }
    setLocalTracks([])
    setIsLive(false)
  }, [room, localTracks])

  // Check if host is already streaming when joining
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

  return (
    <div className="livestream">
      {/* Video display */}
      <div className="livestream-video">
        {/* Host local preview */}
        {isHost && isLive && (
          <video
            ref={localPreviewRef}
            className="livestream-feed"
            autoPlay
            muted
            playsInline
          />
        )}
        {/* Viewer remote feed */}
        {!isHost && (
          <video
            ref={hostVideoRef}
            className="livestream-feed"
            autoPlay
            playsInline
          />
        )}
        {/* Offline placeholder */}
        {!isLive && (
          <div className="livestream-offline">
            {isHost ? 'Your camera will appear here when you go live' : 'Host is not live yet'}
          </div>
        )}

        {/* Live badge */}
        {isLive && (
          <div className="livestream-badge">
            <span className="livestream-dot" />
            LIVE
          </div>
        )}
      </div>

      {/* Host controls */}
      {isHost && (
        <div className="livestream-controls">
          {error && <p className="error-msg">{error}</p>}
          {!isLive ? (
            <button className="btn-live" onClick={goLive}>
              🔴 Go Live
            </button>
          ) : (
            <button className="btn-stop" onClick={stopLive}>
              ■ End Stream
            </button>
          )}
        </div>
      )}
    </div>
  )
}
