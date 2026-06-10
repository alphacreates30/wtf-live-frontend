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
  const [facingMode, setFacingMode] = useState('environment')
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
        setError('Connection failed: ' + (err.message || err.toString()))
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
      if (track.kind === Track.Kind.Audio) {
        track.attach()
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
          audio: { echoCancellation: true, noiseSuppression: true },
          video: { facingMode: 'environment' },
        })
      } catch {
        try {
          tracks = await createLocalTracks({ audio: true, video: true })
        } catch {
          tracks = await createLocalTracks({ audio: true, video: false })
        }
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

  const flipCamera = useCallback(async () => {
    const newFacing = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(newFacing)
    const videoTrack = localTracks.find(t => t.kind === Track.Kind.Video)
    if (!videoTrack) return
    try {
      await room.localParticipant.unpublishTrack(videoTrack)
      videoTrack.stop()
      const newTracks = await createLocalTracks({ video: { facingMode: newFacing } })
      const newVideo = newTracks.find(t => t.kind === Track.Kind.Video)
      if (newVideo) {
        await room.localParticipant.publishTrack(newVideo)
        if (localPreviewRef.current) newVideo.attach(localPreviewRef.current)
        setLocalTracks(prev => [...prev.filter(t => t.kind !== Track.Kind.Video), newVideo])
      }
    } catch (err) {
      setError('Camera flip failed: ' + (err.message || err))
    }
  }, [facingMode, localTracks, room])

  useEffect(() => {
    if (!isConnected) return
    for (const [, participant] of room.remoteParticipants) {
      for (const [, publication] of participant.trackPublications) {
        if (publication.track && publication.kind === Track.Kind.Video) {
          publication.track.attach(hostVideoRef.current)
          setIsLive(true)
        }
        if (publication.track && publication.kind === Track.Kind.Audio) {
          publication.track.attach()
        }
      }
    }
  }, [isConnected, room])

  if (!isConnected && !error) {
    return <div className="livestream-loading">Connecting to stream</div>
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
        {isHost && (
          <video ref={localPreviewRef} className="livestream-feed" autoPlay muted playsInline style={{ display: isLive ? 'block' : 'none' }} />
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
            <button className="btn-live" onClick={goLive}>Go Live</button>
          ) : (
            <>
              <button className="btn-stop" onClick={stopLive}>End Stream</button>
              <button className="btn-ghost" onClick={flipCamera} style={{marginLeft:'0.5rem'}}>Flip Camera</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
