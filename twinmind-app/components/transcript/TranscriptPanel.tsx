'use client'

import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useAutoScroll } from '@/lib/hooks/useAutoScroll'
import type { TranscriptLine } from '@/lib/types'

export interface TranscriptPanelProps {
  lines: TranscriptLine[]
  isProcessing: boolean
}

export function TranscriptPanel({ lines, isProcessing }: TranscriptPanelProps) {
  const { containerRef, onScroll, scrollToBottom } = useAutoScroll()

  useEffect(() => {
    scrollToBottom()
  }, [lines.length, isProcessing, scrollToBottom])

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className="flex-1 overflow-y-auto p-4 space-y-2"
    >
      {lines.length === 0 && !isProcessing ? (
        <p className="mt-8 text-center text-sm text-zinc-500">
          Start recording to see your transcript here.
        </p>
      ) : (
        lines.map((line) => (
          <div key={line.id} className="flex gap-3 text-sm">
            <span className="shrink-0 pt-0.5 font-mono text-xs text-zinc-500">
              {line.timestamp}
            </span>
            <span className="leading-relaxed text-zinc-100">{line.text}</span>
          </div>
        ))
      )}
      {isProcessing && (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Loader2 size={12} className="animate-spin" />
          <span>Transcribing...</span>
        </div>
      )}
    </div>
  )
}
