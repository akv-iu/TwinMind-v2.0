'use client'

import { Loader2 } from 'lucide-react'
import { formatCardType } from '@/components/suggestions/SuggestionCard'
import type { ChatMessage } from '@/lib/types'

export interface ChatBubbleProps {
  message: ChatMessage
  isStreaming?: boolean
}

export function ChatBubble({ message, isStreaming }: ChatBubbleProps) {
  const isUser = message.role === 'user'
  const label = isUser
    ? message.suggestionType
      ? `YOU \u00B7 ${formatCardType(message.suggestionType)}`
      : 'YOU'
    : 'ASSISTANT'

  const showSpinner = !isUser && isStreaming && message.text.length === 0

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
          <p className="whitespace-pre-wrap">{message.text}</p>
        )}
      </div>
    </div>
  )
}
