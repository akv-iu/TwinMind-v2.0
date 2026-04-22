'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { deduplicateTail, lastWords } from '@/lib/dedup'

const CHUNK_MS = 6_000
const TAIL_WORD_COUNT = 10

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

  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTranscriptTailRef = useRef<string>('')
  const inFlightCountRef = useRef<number>(0)
  const apiKeyRef = useRef<string>(apiKey)
  const shouldRecordRef = useRef<boolean>(false)
  const uploadQueueRef = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    apiKeyRef.current = apiKey
  }, [apiKey])

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

      inFlightCountRef.current += 1
      setIsProcessing(true)
      setTranscribing(true)
      try {
        const res = await fetch('/api/transcribe', { method: 'POST', body: form })
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Transcription failed' }))
          throw new Error(data.error ?? 'Transcription failed')
        }
        const { text } = (await res.json()) as { text: string }
        const cleaned = deduplicateTail(lastTranscriptTailRef.current, text ?? '')
        if (cleaned.trim()) {
          addTranscriptLine({ timestamp: timestampNow(), text: cleaned })
          lastTranscriptTailRef.current = lastWords(cleaned, TAIL_WORD_COUNT)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Transcription failed'
        setError(message)
      } finally {
        inFlightCountRef.current -= 1
        if (inFlightCountRef.current <= 0) {
          inFlightCountRef.current = 0
          setIsProcessing(false)
          setTranscribing(false)
        }
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
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const enqueueChunkUpload = useCallback(
    (blob: Blob) => {
      uploadQueueRef.current = uploadQueueRef.current.finally(async () => {
        await sendChunk(blob)
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
      setIsRecording(true)
      startRecorderCycle(stream)
    } catch (err) {
      setHasMicPermission(false)
      const message = err instanceof Error ? err.message : 'Could not access microphone.'
      setError(message)
      shouldRecordRef.current = false
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
    }
  }, [clearChunkTimer, stopStreamTracks])

  return {
    isRecording,
    isProcessing,
    hasMicPermission,
    error,
    requestMicrophoneAccess,
    startRecording,
    stopRecording,
  }
}
