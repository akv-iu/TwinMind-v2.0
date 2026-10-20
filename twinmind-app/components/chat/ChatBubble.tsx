'use client'

import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { formatCardType } from '@/components/suggestions/SuggestionCard'
import type { ChatMessage } from '@/lib/types'

export interface ChatBubbleProps {
  message: ChatMessage
  isStreaming?: boolean
  onRetryLast?: () => void
}

function renderBoldMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const boldPattern = /\*\*(.+?)\*\*/g
  let cursor = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = boldPattern.exec(text)) !== null) {
    const [fullMatch, boldText] = match
    const start = match.index
    const end = start + fullMatch.length

    if (start > cursor) {
      nodes.push(text.slice(cursor, start))
    }
    nodes.push(
      <strong key={`bold-${key++}`} className="font-semibold text-ink">
        {boldText}
      </strong>,
    )
    cursor = end
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor))
  }

  return nodes
}

function renderAssistantText(text: string): ReactNode {
  const lines = text.split('\n')
  if (lines.length <= 1) {
    return <p className="whitespace-pre-wrap">{renderBoldMarkdown(text)}</p>
  }
  return (
    <div className="space-y-1">
      {lines.map((line, index) => (
        <p key={index} className="whitespace-pre-wrap">
          {renderBoldMarkdown(line)}
        </p>
      ))}
    </div>
  )
}

export function ChatBubble({ message, isStreaming, onRetryLast }: ChatBubbleProps) {
  const isUser = message.role === 'user'
  const label = isUser
    ? message.suggestionType
      ? `YOU \u00B7 ${formatCardType(message.suggestionType)}`
      : 'YOU'
    : 'ASSISTANT'

  const showSpinner =
    !isUser && isStreaming && !message.isFinalized && message.text.length === 0
  const showRetry =
    !isUser &&
    Boolean(onRetryLast) &&
    message.isFinalized === true &&
    message.isFailed === true

  return (
    <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
      <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
        {label}
      </span>
      <div
        className={[
          'max-w-[95%] break-words rounded-lg border px-4 py-3 text-[13px] leading-[1.8]',
          isUser
            ? 'border-accent/15 bg-accent-soft text-ink'
            : 'border-line bg-paper text-ink',
          message.isFailed ? 'border-amber-600/40' : '',
        ].join(' ')}
      >
        {showSpinner ? (
          <span className="inline-flex items-center gap-2 text-xs text-muted">
            <Loader2 size={12} className="animate-spin" />
            Thinking...
          </span>
        ) : (
          renderAssistantText(message.text)
        )}

        {showRetry && (
          <div className="mt-2 border-t border-line pt-2">
            <button
              type="button"
              onClick={onRetryLast}
              className="rounded border border-line px-2 py-1 text-xs font-semibold uppercase tracking-widest text-ink transition-colors hover:bg-wash hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
