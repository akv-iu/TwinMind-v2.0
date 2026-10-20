'use client'

import { useEffect } from 'react'
import { AudioLines, Loader2 } from 'lucide-react'
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
      className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5"
    >
      {lines.length === 0 && !isProcessing ? (
        <div className="flex h-full min-h-36 flex-col items-center justify-center px-3 pb-5 text-center">
          <span className="mb-4 flex size-11 items-center justify-center rounded-full bg-wash text-moss"><AudioLines size={21} strokeWidth={1.4} aria-hidden="true" /></span>
          <h3 className="mb-2 font-[Georgia,serif] text-2xl tracking-[-0.03em] text-ink">Every word, in its place.</h3>
          <p className="max-w-[230px] text-xs leading-[1.8] text-muted">Start recording and let the transcript take care of itself. You can stay in the moment.</p>
        </div>
      ) : (
        lines.map((line) => (
          <div key={line.id} className="flex gap-3 border-b border-line/60 pb-4 text-[13px] last:border-0">
            <span className="shrink-0 pt-0.5 font-mono text-[10px] text-muted">
              {line.timestamp}
            </span>
            <span className="min-w-0 break-words leading-relaxed text-ink">{line.text}</span>
          </div>
        ))
      )}
      {isProcessing && (
        <div className="flex items-center gap-2 text-xs text-muted">
          <Loader2 size={12} className="animate-spin" />
          <span>Transcribing...</span>
        </div>
      )}
    </div>
  )
}
