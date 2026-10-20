'use client'

import { Mic, Square } from 'lucide-react'

export interface MicButtonProps {
  isRecording: boolean
  disabled?: boolean
  onClick: () => void
}

export function MicButton({ isRecording, disabled, onClick }: MicButtonProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={isRecording}
        aria-label={isRecording ? 'Stop recording' : 'Start recording'}
        className={[
          'flex size-16 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-4 focus-visible:ring-offset-sheet',
          'disabled:cursor-not-allowed disabled:bg-wash disabled:text-muted',
          isRecording ? 'ring-4 ring-accent/15' : '',
        ].join(' ')}
      >
        {isRecording ? <Square size={20} fill="currentColor" aria-hidden="true" /> : <Mic size={25} strokeWidth={1.7} aria-hidden="true" />}
      </button>
      <span className="text-xs font-medium text-muted">
        {isRecording ? 'Recording. Stay with the conversation.' : 'Ready when you are.'}
      </span>
    </div>
  )
}
