'use client'

import { useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { ColumnHeader } from '@/components/layout/ColumnHeader'
import { MicButton } from './MicButton'
import { TranscriptPanel } from './TranscriptPanel'
import { useAudioRecorder } from '@/lib/hooks/useAudioRecorder'
import { useStore } from '@/store'
import { exportSession } from '@/lib/export'

function StatusBadge({ isRecording }: { isRecording: boolean }) {
  if (isRecording) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded border border-red-500/30 bg-red-500/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-widest text-red-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
        RECORDING
      </span>
    )
  }
  return (
    <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs font-semibold uppercase tracking-widest text-zinc-400">
      IDLE
    </span>
  )
}

export function TranscriptColumn() {
  const {
    isRecording,
    isProcessing,
    isMicMuted,
    hasMicPermission,
    error,
    requestMicrophoneAccess,
    startRecording,
    startRecordingWithSystemAudio,
    stopRecording,
  } = useAudioRecorder()

  const [audioMode, setAudioMode] = useState<'mic' | 'virtual'>('mic')

  const isMac =
    typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac')
  const supportsSystemAudio =
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function'
  const transcriptLines = useStore((s) => s.transcriptLines)
  const batches = useStore((s) => s.batches)
  const chatMessages = useStore((s) => s.chatMessages)
  const summary = useStore((s) => s.summary)
  const meetingKind = useStore((s) => s.meetingKind)
  const suggestIntentPrompts = useStore((s) => s.suggestIntentPrompts)
  const chatPrompt = useStore((s) => s.chatPrompt)
  const suggestContextChars = useStore((s) => s.suggestContextChars)
  const chatContextChars = useStore((s) => s.chatContextChars)
  const apiKey = useStore((s) => s.groqApiKey)
  const promptedRef = useRef(false)

  const isExportDisabled =
    transcriptLines.length === 0 && batches.length === 0 && chatMessages.length === 0
  const noKey = !apiKey.trim()

  useEffect(() => {
    if (noKey || promptedRef.current) return
    promptedRef.current = true
    void requestMicrophoneAccess()
  }, [noKey, requestMicrophoneAccess])

  function handleMicClick() {
    if (isRecording) stopRecording()
    else if (audioMode === 'virtual') void startRecordingWithSystemAudio()
    else void startRecording()
  }

  function handleExport() {
    exportSession(transcriptLines, batches, chatMessages, {
      summary,
      meetingKind: meetingKind ?? null,
      settingsSnapshot: {
        suggestIntentPrompts,
        chatPrompt,
        suggestContextChars,
        chatContextChars,
      },
    })
  }

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <ColumnHeader
        number={1}
        title="MIC & TRANSCRIPT"
        badge={<StatusBadge isRecording={isRecording} />}
      />
      <div className="flex flex-col items-center gap-3 border-b border-zinc-800 px-4 py-6">
        <MicButton
          isRecording={isRecording}
          disabled={noKey}
          onClick={handleMicClick}
        />
        {noKey && (
          <p className="px-2 text-center text-xs text-zinc-500">
            Add your Groq API key in Settings to start.
          </p>
        )}
        {error && !noKey && (
          <p className="px-2 text-center text-xs text-red-400">{error}</p>
        )}
        {isMicMuted && isRecording && !noKey && (
          <p className="px-2 text-center text-xs text-amber-400">
            Mic appears muted. Check your device or unmute.
          </p>
        )}
        {!noKey && hasMicPermission === false && !error && (
          <p className="px-2 text-center text-xs text-zinc-500">
            Allow microphone access in your browser, then click the mic button.
          </p>
        )}
        {!noKey && (
          <div className="flex w-full overflow-hidden rounded-lg border border-zinc-700">
            <button
              type="button"
              disabled={isRecording}
              onClick={() => setAudioMode('mic')}
              className={[
                'flex-1 py-1.5 text-xs font-semibold uppercase tracking-widest transition-colors',
                'disabled:cursor-not-allowed',
                audioMode === 'mic'
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300',
              ].join(' ')}
            >
              Mic Only
            </button>
            {supportsSystemAudio ? (
              <button
                type="button"
                disabled={isRecording}
                onClick={() => setAudioMode('virtual')}
                className={[
                  'flex-1 py-1.5 text-xs font-semibold uppercase tracking-widest transition-colors',
                  'disabled:cursor-not-allowed',
                  audioMode === 'virtual'
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300',
                ].join(' ')}
              >
                Virtual Meeting
              </button>
            ) : (
              <span
                title="Not supported in this browser"
                className="flex-1 cursor-not-allowed py-1.5 text-center text-xs uppercase tracking-widest text-zinc-600"
              >
                Virtual Meeting
              </span>
            )}
          </div>
        )}
        {audioMode === 'virtual' && isMac && !noKey && (
          <p className="px-2 text-center text-xs text-amber-400">
            On Mac, captures browser tab audio only. For Teams or Zoom, use the browser version.
          </p>
        )}
      </div>
      <div className="px-4 pb-3 pt-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={isExportDisabled}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download size={12} />
          Export Session
        </button>
      </div>
      <TranscriptPanel lines={transcriptLines} isProcessing={isProcessing} />
    </div>
  )
}
