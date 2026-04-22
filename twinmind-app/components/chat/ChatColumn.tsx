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
import { takeTailByChars } from '@/lib/context'
import { useStore } from '@/store'
import type { CardType, ChatMessage, SuggestionCard } from '@/lib/types'

const RESPONSE_INTERRUPTED_MARKER = '\n\n\u26A0 Response interrupted.'

export interface ChatColumnHandle {
  sendCardAsMessage: (card: SuggestionCard) => void
}

function trimPendingAssistantMessage(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length === 0) return messages
  const last = messages[messages.length - 1]
  if (last.role !== 'assistant') return messages
  if (last.isFinalized) return messages
  return messages.slice(0, -1)
}

export const ChatColumn = forwardRef<ChatColumnHandle>(function ChatColumn(_props, ref) {
  const chatMessages = useStore((s) => s.chatMessages)
  const transcriptLines = useStore((s) => s.transcriptLines)
  const rollingSummary = useStore((s) => s.summary)
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
  const currentRequestIdRef = useRef<string | null>(null)
  const lastScrollRef = useRef(0)

  const { containerRef, onScroll, scrollToBottom } = useAutoScroll()

  useEffect(() => {
    const now = Date.now()
    if (now - lastScrollRef.current < 100) return
    lastScrollRef.current = now
    scrollToBottom()
  }, [chatMessages.length, isStreaming, scrollToBottom])

  useEffect(() => {
    if (!isStreaming) return
    let raf = 0
    const tick = () => {
      scrollToBottom()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isStreaming, scrollToBottom])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const fireChat = useCallback(
    async (messagesForRequest: ChatMessage[]) => {
      const key = apiKey.trim()
      if (!key) return

      abortRef.current?.abort()
      const requestId = crypto.randomUUID()
      currentRequestIdRef.current = requestId

      const controller = new AbortController()
      abortRef.current = controller

      isStreamingRef.current = true
      setIsStreaming(true)
      setError(null)

      const transcript = takeTailByChars(transcriptLines, chatContextChars)
      const summaryText = rollingSummary.trim() || 'not available yet'

      beginAssistantMessage()
      let didStreamAnyDelta = false

      const isCurrentRequest = () => currentRequestIdRef.current === requestId

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript,
            rollingSummary: summaryText,
            messages: messagesForRequest,
            prompt: chatPrompt,
            apiKey: key,
          }),
          signal: controller.signal,
        })

        if (!res.ok || !res.body) {
          let msg = 'Chat request failed'
          try {
            const data = (await res.json()) as { error?: string }
            msg = data?.error ?? msg
          } catch {
            // keep fallback message
          }
          throw new Error(msg)
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
              if (!isCurrentRequest()) return

              if (payload === '[DONE]') {
                finaliseLastMessage()
                continue
              }

              try {
                const parsed = JSON.parse(payload) as { delta?: string }
                if (parsed.delta) {
                  didStreamAnyDelta = true
                  appendToLastMessage(parsed.delta)
                }
              } catch {
                // ignore malformed event lines
              }
            }
          }
        }

        if (isCurrentRequest()) {
          finaliseLastMessage()
        }
      } catch (e) {
        if (!isCurrentRequest()) return
        if ((e as { name?: string }).name === 'AbortError') return

        if (didStreamAnyDelta) {
          appendToLastMessage(RESPONSE_INTERRUPTED_MARKER)
          finaliseLastMessage()
          return
        }

        setError(e instanceof Error ? e.message : 'Chat request failed')

        const state = useStore.getState()
        useStore.setState({
          chatMessages: trimPendingAssistantMessage(state.chatMessages),
        })
      } finally {
        if (!isCurrentRequest()) return
        currentRequestIdRef.current = null
        isStreamingRef.current = false
        setIsStreaming(false)
        abortRef.current = null
      }
    },
    [
      apiKey,
      beginAssistantMessage,
      appendToLastMessage,
      chatContextChars,
      chatPrompt,
      finaliseLastMessage,
      rollingSummary,
      transcriptLines,
    ],
  )

  const sendUserText = useCallback(
    (text: string, suggestionType: CardType | null) => {
      const trimmed = text.trim()
      if (!trimmed) return
      if (!apiKey.trim()) return

      if (isStreamingRef.current) {
        abortRef.current?.abort()
        currentRequestIdRef.current = null
        isStreamingRef.current = false
        setIsStreaming(false)
        abortRef.current = null

        const state = useStore.getState()
        useStore.setState({
          chatMessages: trimPendingAssistantMessage(state.chatMessages),
        })
      }

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

  const handleRetryLast = useCallback(() => {
    const messages = useStore.getState().chatMessages
    let lastUserIndex = -1
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'user') {
        lastUserIndex = i
        break
      }
    }
    if (lastUserIndex === -1) return

    const retryMessages = messages.slice(0, lastUserIndex + 1)
    useStore.setState({ chatMessages: retryMessages })
    setError(null)
    void fireChat(retryMessages)
  }, [fireChat])

  function handleManualSend(text: string) {
    sendUserText(text, null)
  }

  const noKey = !apiKey.trim()
  const lastMessage = chatMessages[chatMessages.length - 1]
  const showStreamingIndicator =
    isStreaming && lastMessage?.role === 'assistant' && !lastMessage?.isFinalized

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
                isStreaming={isStreaming && isLast && message.role === 'assistant' && !message.isFinalized}
                onRetryLast={isLast ? handleRetryLast : undefined}
              />
            )
          })
        )}
        {error && (
          <p className="text-center text-xs text-red-400">{error}</p>
        )}
        {showStreamingIndicator && (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-3 right-3 h-2 w-2 animate-pulse rounded-full bg-amber-400"
          />
        )}
      </div>

      <ChatInput
        onSend={handleManualSend}
        disabled={noKey}
        placeholder={
          noKey
            ? 'Add your Groq API key in Settings to start.'
            : 'Ask anything...'
        }
      />
    </div>
  )
})
