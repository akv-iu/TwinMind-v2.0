'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { ColumnHeader } from '@/components/layout/ColumnHeader'
import { ChatBubble } from './ChatBubble'
import { ChatInput } from './ChatInput'
import { useAutoScroll } from '@/lib/hooks/useAutoScroll'
import { useStore } from '@/store'
import type { CardType, ChatMessage, SuggestionCard } from '@/lib/types'

export interface ChatColumnHandle {
  sendCardAsMessage: (card: SuggestionCard) => void
}

export const ChatColumn = forwardRef<ChatColumnHandle>(function ChatColumn(_props, ref) {
  const chatMessages = useStore((s) => s.chatMessages)
  const transcriptLines = useStore((s) => s.transcriptLines)
  const apiKey = useStore((s) => s.groqApiKey)
  const chatPrompt = useStore((s) => s.chatPrompt)
  const chatContextChars = useStore((s) => s.chatContextChars)
  const addUserMessage = useStore((s) => s.addUserMessage)
  const beginAssistantMessage = useStore((s) => s.beginAssistantMessage)
  const appendToLastMessage = useStore((s) => s.appendToLastMessage)
  const finaliseLastMessage = useStore((s) => s.finaliseLastMessage)

  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isStreamingRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  const { containerRef, onScroll, scrollToBottom } = useAutoScroll()

  useEffect(() => {
    scrollToBottom()
  }, [chatMessages, isStreaming, scrollToBottom])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const fireChat = useCallback(
    async (messagesForRequest: ChatMessage[]) => {
      if (isStreamingRef.current) return
      if (!apiKey.trim()) return
      isStreamingRef.current = true
      setIsStreaming(true)
      setError(null)

      const allText = transcriptLines.map((l) => l.text).join(' ')
      const transcript = allText.slice(-chatContextChars)
      const controller = new AbortController()
      abortRef.current = controller

      beginAssistantMessage()

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript,
            messages: messagesForRequest,
            prompt: chatPrompt,
            apiKey,
          }),
          signal: controller.signal,
        })

        if (!res.ok || !res.body) {
          const data = await res
            .json()
            .catch(() => ({ error: 'Chat request failed' }))
          throw new Error(data.error ?? 'Chat request failed')
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          let separatorIndex = buffer.indexOf('\n\n')
          while (separatorIndex !== -1) {
            const event = buffer.slice(0, separatorIndex)
            buffer = buffer.slice(separatorIndex + 2)
            separatorIndex = buffer.indexOf('\n\n')

            for (const line of event.split('\n')) {
              if (!line.startsWith('data:')) continue
              const payload = line.slice(5).trim()
              if (payload === '[DONE]') {
                finaliseLastMessage()
                continue
              }
              try {
                const parsed = JSON.parse(payload) as { delta?: string }
                if (parsed.delta) appendToLastMessage(parsed.delta)
              } catch {
                // ignore malformed event lines
              }
            }
          }
        }
        finaliseLastMessage()
      } catch (e) {
        if ((e as { name?: string }).name === 'AbortError') return
        appendToLastMessage(' [Response interrupted]')
        setError('Chat request failed.')
      } finally {
        isStreamingRef.current = false
        setIsStreaming(false)
        abortRef.current = null
      }
    },
    [
      apiKey,
      chatPrompt,
      chatContextChars,
      transcriptLines,
      beginAssistantMessage,
      appendToLastMessage,
      finaliseLastMessage,
    ],
  )

  const sendUserText = useCallback(
    (text: string, suggestionType: CardType | null) => {
      const trimmed = text.trim()
      if (!trimmed) return
      if (isStreamingRef.current) return
      if (!apiKey.trim()) return
      addUserMessage({ suggestionType, text: trimmed })
      const snapshot = useStore.getState().chatMessages
      void fireChat(snapshot)
    },
    [addUserMessage, apiKey, fireChat],
  )

  useImperativeHandle(
    ref,
    () => ({
      sendCardAsMessage: (card: SuggestionCard) => {
        sendUserText(card.preview, card.type)
      },
    }),
    [sendUserText],
  )

  function handleManualSend(text: string) {
    sendUserText(text, null)
  }

  const noKey = !apiKey.trim()

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <ColumnHeader
        number={3}
        title="CHAT (DETAILED ANSWERS)"
        badge={
          <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            SESSION-ONLY
          </span>
        }
      />

      <div
        ref={containerRef}
        onScroll={onScroll}
        className="relative flex-1 space-y-3 overflow-y-auto p-4"
      >
        {chatMessages.length === 0 ? (
          <p className="mx-auto mt-8 max-w-xs text-center text-sm leading-relaxed text-zinc-500">
            Clicking a suggestion adds it to this chat and streams a detailed answer (separate prompt, more context). User can also type questions directly. One continuous chat per session {'\u2014'} no login, no persistence.
          </p>
        ) : (
          chatMessages.map((message, index) => {
            const isLast = index === chatMessages.length - 1
            return (
              <ChatBubble
                key={index}
                message={message}
                isStreaming={isStreaming && isLast && message.role === 'assistant'}
              />
            )
          })
        )}
        {error && (
          <p className="text-center text-xs text-red-400">{error}</p>
        )}
        {isStreaming && (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-3 right-3 h-2 w-2 animate-pulse rounded-full bg-amber-400"
          />
        )}
      </div>

      <ChatInput
        onSend={handleManualSend}
        disabled={noKey || isStreaming}
        placeholder={
          noKey
            ? 'Add your Groq API key in Settings to start.'
            : 'Ask anything...'
        }
      />
    </div>
  )
})
