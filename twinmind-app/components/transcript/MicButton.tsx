'use client'

import { Mic } from 'lucide-react'

export interface MicButtonProps {
  isRecording: boolean
  disabled?: boolean
  onClick: () => void
}

export function MicButton({ isRecording, disabled, onClick }: MicButtonProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={isRecording ? 'Stop recording' : 'Start recording'}
        className={[
          'flex h-20 w-20 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400',
          'disabled:cursor-not-allowed disabled:opacity-50',
          isRecording
            ? 'bg-red-600 ring-2 ring-red-500 ring-offset-2 ring-offset-zinc-950 hover:bg-red-700 motion-safe:animate-pulse'
            : 'bg-zinc-800 hover:bg-zinc-700',
        ].join(' ')}
      >
        <Mic size={28} className="text-white" />
      </button>
      <span className="text-xs text-zinc-400">
        {isRecording ? 'Recording...' : 'Stopped. Click to resume.'}
      </span>
    </div>
  )
}
