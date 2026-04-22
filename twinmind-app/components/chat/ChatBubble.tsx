'use client'

import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { formatCardType } from '@/components/suggestions/SuggestionCard'
import type { ChatMessage } from '@/lib/types'

const RESPONSE_INTERRUPTED_MARKER = '\u26A0 Response interrupted.'

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
      <strong key={`bold-${key++}`} className="font-semibold text-zinc-50">
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
    message.text.trimEnd().endsWith(RESPONSE_INTERRUPTED_MARKER)

  return (
    <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
      <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
        {label}
      </span>
      <div
        className={[
          'max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed',
          isUser
            ? 'bg-zinc-800 text-zinc-100'
            : 'bg-zinc-900 text-zinc-100 ring-1 ring-zinc-800',
        ].join(' ')}
      >
        {showSpinner ? (
          <span className="inline-flex items-center gap-2 text-xs text-zinc-500">
            <Loader2 size={12} className="animate-spin" />
            Thinking...
          </span>
        ) : (
          renderAssistantText(message.text)
        )}

        {showRetry && (
          <div className="mt-2 border-t border-zinc-800 pt-2">
            <button
              type="button"
              onClick={onRetryLast}
              className="rounded border border-zinc-700 px-2 py-1 text-xs font-semibold uppercase tracking-widest text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
