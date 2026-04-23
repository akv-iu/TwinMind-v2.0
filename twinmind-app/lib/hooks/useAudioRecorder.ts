'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { deduplicateTail, lastWords } from '@/lib/dedup'
import {
  normalizeApiErrorCopy,
  TRANSCRIBE_FAILURE_COPY,
} from '@/lib/clientErrorCopy'

const CHUNK_MS = 6_000
const TAIL_WORD_COUNT = 10
const RETRY_DELAYS_MS = [250, 1000, 3000] as const

class NonRetryableTranscriptionError extends Error {}
class RetryExhaustedTranscriptionError extends Error {}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface TranscribeWithRetryOptions {
  fetchImpl?: typeof fetch
  wait?: (ms: number) => Promise<void>
}

interface MicTrackCallbacks {
  onMutedChange: (isMuted: boolean) => void
  onEnded: () => void
}

interface MicTrackBinding {
  detach: () => void
}

export function attachMicTrackListeners(
  track: MediaStreamTrack,
  callbacks: MicTrackCallbacks,
): MicTrackBinding {
  callbacks.onMutedChange(track.muted)

  const onMute = () => callbacks.onMutedChange(true)
  const onUnmute = () => callbacks.onMutedChange(false)
  const onEnded = () => callbacks.onEnded()

  track.addEventListener('mute', onMute)
  track.addEventListener('unmute', onUnmute)
  track.addEventListener('ended', onEnded)

  return {
    detach: () => {
      track.removeEventListener('mute', onMute)
      track.removeEventListener('unmute', onUnmute)
      track.removeEventListener('ended', onEnded)
    },
  }
}

export async function transcribeWithRetry(
  form: FormData,
  options?: TranscribeWithRetryOptions,
): Promise<string> {
  const fetchImpl = options?.fetchImpl ?? fetch
  const wait = options?.wait ?? delay
  let lastErr: Error = new Error('Transcription failed')

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const res = await fetchImpl('/api/transcribe', { method: 'POST', body: form })
      if (res.ok) {
        const data = (await res.json().catch(() => ({ text: '' }))) as {
          text?: unknown
        }
        return typeof data.text === 'string' ? data.text : ''
      }

      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        const data = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as {
          error?: unknown
        }
        const message =
          typeof data.error === 'string' && data.error.trim()
            ? data.error
            : `HTTP ${res.status}`
        throw new NonRetryableTranscriptionError(message)
      }

      lastErr = new Error(`HTTP ${res.status}`)
    } catch (err) {
      if (err instanceof NonRetryableTranscriptionError) {
        throw err
      }
      lastErr = err instanceof Error ? err : new Error('Transcription failed')
    }

    if (attempt < RETRY_DELAYS_MS.length) {
      await wait(RETRY_DELAYS_MS[attempt])
    }
  }

  throw new RetryExhaustedTranscriptionError(lastErr.message)
}

function timestampNow(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate
  }
  return ''
}

function getMicUnavailableReason(): string | null {
  if (typeof navigator === 'undefined') {
    return 'Microphone access is not available in this environment.'
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'Microphone requires HTTPS or localhost. Open the app on https://... or http://localhost.'
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'Microphone access is not available in this browser.'
  }
  return null
}

export interface UseAudioRecorderResult {
  isRecording: boolean
  isProcessing: boolean
  isMicMuted: boolean
  hasMicPermission: boolean | null
  error: string | null
  requestMicrophoneAccess: () => Promise<boolean>
  startRecording: () => Promise<void>
  stopRecording: () => void
}

export function useAudioRecorder(): UseAudioRecorderResult {
  const apiKey = useStore((s) => s.groqApiKey)
  const addTranscriptLine = useStore((s) => s.addTranscriptLine)
  const setTranscribing = useStore((s) => s.setTranscribing)
  const setRecording = useStore((s) => s.setRecording)

  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isMicMuted, setIsMicMuted] = useState(false)
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTranscriptTailRef = useRef<string>('')
  const apiKeyRef = useRef<string>(apiKey)
  const shouldRecordRef = useRef<boolean>(false)
  const uploadQueueRef = useRef<Promise<void>>(Promise.resolve())
  const micTrackBindingRef = useRef<MicTrackBinding | null>(null)

  useEffect(() => {
    apiKeyRef.current = apiKey
  }, [apiKey])

  useEffect(() => {
    setRecording(isRecording)
  }, [isRecording, setRecording])

  useEffect(() => {
    if (
      apiKey.trim() &&
      error === 'Add your Groq API key in Settings to start.'
    ) {
      setError(null)
    }
  }, [apiKey, error])

  const sendChunk = useCallback(
    async (assembled: Blob) => {
      setIsProcessing(true)
      setTranscribing(true)
      try {
        const key = apiKeyRef.current.trim()
        if (!key) {
          setError('Add your Groq API key in Settings to start.')
          return
        }

        const file = new File([assembled], 'chunk.webm', {
          type: assembled.type || 'audio/webm',
        })
        const form = new FormData()
        form.append('audio', file)
        form.append('apiKey', key)

        const text = await transcribeWithRetry(form)
        const cleaned = deduplicateTail(lastTranscriptTailRef.current, text ?? '')
        if (cleaned.trim()) {
          addTranscriptLine({ timestamp: timestampNow(), text: cleaned })
          lastTranscriptTailRef.current = lastWords(cleaned, TAIL_WORD_COUNT)
        }
      } catch (err) {
        const fallbackMessage =
          err instanceof RetryExhaustedTranscriptionError
            ? TRANSCRIBE_FAILURE_COPY
            : err instanceof Error
              ? err.message
              : 'Transcription failed'
        const normalized = normalizeApiErrorCopy(fallbackMessage)
        setError(normalized ?? fallbackMessage)
      } finally {
        setIsProcessing(false)
        setTranscribing(false)
      }
    },
    [addTranscriptLine, setTranscribing],
  )

  const clearChunkTimer = useCallback(() => {
    if (chunkTimerRef.current) {
      clearTimeout(chunkTimerRef.current)
      chunkTimerRef.current = null
    }
  }, [])

  const stopStreamTracks = useCallback(() => {
    micTrackBindingRef.current?.detach()
    micTrackBindingRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const enqueueChunkUpload = useCallback(
    (blob: Blob) => {
      uploadQueueRef.current = uploadQueueRef.current
        .catch(() => {
          // flush any stale rejection so the serial queue continues
        })
        .then(async () => {
          try {
            await sendChunk(blob)
          } catch {
            // sendChunk already handles failures; this is a final safety net
          }
        })
    },
    [sendChunk],
  )

  const requestMicrophoneAccess = useCallback(async (): Promise<boolean> => {
    const unavailableReason = getMicUnavailableReason()
    if (unavailableReason) {
      setHasMicPermission(false)
      setError(unavailableReason)
      return false
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
      setHasMicPermission(true)
      if (error?.toLowerCase().includes('microphone')) setError(null)
      return true
    } catch (err) {
      setHasMicPermission(false)
      const message = err instanceof Error ? err.message : 'Could not access microphone.'
      setError(message)
      return false
    }
  }, [error])

  const startRecorderCycle = useCallback(
    (stream: MediaStream) => {
      if (!shouldRecordRef.current) return
      if (!stream.active) {
        setError('Microphone stream ended. Please start recording again.')
        setIsRecording(false)
        shouldRecordRef.current = false
        stopStreamTracks()
        return
      }

      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      let cycleBlob: Blob | null = null

      recorder.ondataavailable = (event: BlobEvent) => {
        if (!event.data || event.data.size === 0) return
        cycleBlob = cycleBlob
          ? new Blob([cycleBlob, event.data], {
              type: event.data.type || mimeType || 'audio/webm',
            })
          : event.data
      }

      recorder.onerror = () => setError('Recording error. Try restarting the mic.')

      recorder.onstop = () => {
        mediaRecorderRef.current = null
        clearChunkTimer()

        if (cycleBlob && cycleBlob.size > 0) {
          enqueueChunkUpload(cycleBlob)
        }

        if (!shouldRecordRef.current) {
          stopStreamTracks()
          return
        }
        if (streamRef.current !== stream) return
        startRecorderCycle(stream)
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      chunkTimerRef.current = setTimeout(() => {
        if (recorder.state !== 'inactive') {
          try {
            recorder.stop()
          } catch {
            // ignore
          }
        }
      }, CHUNK_MS)
    },
    [clearChunkTimer, enqueueChunkUpload, stopStreamTracks],
  )

  const startRecording = useCallback(async () => {
    if (isRecording) return
    setError(null)
    if (!apiKeyRef.current.trim()) {
      setError('Add your Groq API key in Settings to start.')
      return
    }
    const unavailableReason = getMicUnavailableReason()
    if (unavailableReason) {
      setError(unavailableReason)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      shouldRecordRef.current = true
      setHasMicPermission(true)
      lastTranscriptTailRef.current = ''
      setIsMicMuted(false)
      setIsRecording(true)

      const track = stream.getAudioTracks()[0]
      if (track) {
        micTrackBindingRef.current?.detach()
        micTrackBindingRef.current = attachMicTrackListeners(track, {
          onMutedChange: (nextMuted) => setIsMicMuted(nextMuted),
          onEnded: () => {
            if (!shouldRecordRef.current) return
            setError('Microphone disconnected. Restart recording.')
            shouldRecordRef.current = false
            clearChunkTimer()
            const recorder = mediaRecorderRef.current
            if (recorder && recorder.state !== 'inactive') {
              try {
                recorder.stop()
              } catch {
                stopStreamTracks()
              }
            } else {
              stopStreamTracks()
            }
            mediaRecorderRef.current = null
            setIsRecording(false)
          },
        })
      }

      startRecorderCycle(stream)
    } catch (err) {
      setHasMicPermission(false)
      const message = err instanceof Error ? err.message : 'Could not access microphone.'
      setError(message)
      shouldRecordRef.current = false
      setIsMicMuted(false)
      clearChunkTimer()
      stopStreamTracks()
    }
  }, [clearChunkTimer, isRecording, startRecorderCycle, stopStreamTracks])

  const stopRecording = useCallback(() => {
    shouldRecordRef.current = false
    clearChunkTimer()
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch {
        // ignore
      }
    } else {
      stopStreamTracks()
    }
    mediaRecorderRef.current = null
    setIsMicMuted(false)
    setIsRecording(false)
  }, [clearChunkTimer, stopStreamTracks])

  useEffect(() => {
    return () => {
      shouldRecordRef.current = false
      clearChunkTimer()
      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop()
        } catch {
          // ignore
        }
      }
      stopStreamTracks()
      setRecording(false)
    }
  }, [clearChunkTimer, setRecording, stopStreamTracks])

  return {
    isRecording,
    isProcessing,
    isMicMuted,
    hasMicPermission,
    error,
    requestMicrophoneAccess,
    startRecording,
    stopRecording,
  }
}
