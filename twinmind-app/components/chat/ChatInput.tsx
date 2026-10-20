'use client'

import { useState, type KeyboardEvent } from 'react'
import { Send } from 'lucide-react'

export interface ChatInputProps {
  onSend: (text: string) => void
  disabled?: boolean
  placeholder?: string
}

export function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
  const [value, setValue] = useState('')

  function submit() {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const isDisabled = disabled || value.trim().length === 0

  return (
    <div className="flex shrink-0 items-end gap-2 border-t border-line bg-paper/60 p-3">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        disabled={disabled}
        placeholder={placeholder ?? 'Ask anything...'}
        aria-label="Message"
        className="min-h-11 max-h-32 min-w-0 flex-1 resize-none rounded-md border border-line bg-sheet px-3 py-3 text-[13px] text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:cursor-not-allowed disabled:bg-wash disabled:opacity-70"
      />
      <button
        type="button"
        onClick={submit}
        disabled={isDisabled}
        aria-label="Send"
        className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent text-white transition-colors hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:bg-wash disabled:text-muted"
      >
        <Send size={16} />
      </button>
    </div>
  )
}
