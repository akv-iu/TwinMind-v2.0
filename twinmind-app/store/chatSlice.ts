import type { StateCreator } from 'zustand'
import type { AllSlices } from './index'
import type { CardType, ChatMessage } from '@/lib/types'

export interface ChatSlice {
  chatMessages: ChatMessage[]
  addUserMessage: (payload: { suggestionType: CardType | null; text: string }) => void
  beginAssistantMessage: () => void
  appendToLastMessage: (delta: string) => void
  finaliseLastMessage: () => void
  markLastMessageFailed: () => void
}

export const createChatSlice: StateCreator<AllSlices, [], [], ChatSlice> = (set) => ({
  chatMessages: [],
  addUserMessage: ({ suggestionType, text }) => {
    if (!text.trim()) return
    set((s) => ({
      chatMessages: [
        ...s.chatMessages,
        { id: crypto.randomUUID(), role: 'user', suggestionType, text },
      ],
    }))
  },
  beginAssistantMessage: () =>
    set((s) => ({
      chatMessages: [
        ...s.chatMessages,
        { id: crypto.randomUUID(), role: 'assistant', text: '', isFinalized: false },
      ],
    })),
  appendToLastMessage: (delta) =>
    set((s) => {
      if (s.chatMessages.length === 0) return s
      const next = s.chatMessages.slice()
      const last = next[next.length - 1]
      next[next.length - 1] = { ...last, text: last.text + delta, isFinalized: false }
      return { chatMessages: next }
    }),
  finaliseLastMessage: () =>
    set((s) => {
      if (s.chatMessages.length === 0) return s
      const next = s.chatMessages.slice()
      const last = next[next.length - 1]
      next[next.length - 1] = { ...last, isFinalized: true }
      return { chatMessages: next }
    }),
  markLastMessageFailed: () =>
    set((s) => {
      if (s.chatMessages.length === 0) return s
      const next = s.chatMessages.slice()
      const last = next[next.length - 1]
      if (last.role !== 'assistant') return s
      next[next.length - 1] = { ...last, isFailed: true, isFinalized: true }
      return { chatMessages: next }
    }),
})
