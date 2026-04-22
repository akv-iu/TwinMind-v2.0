import type { StateCreator } from 'zustand'
import type { AllSlices } from './index'
import type { CardType, ChatMessage } from '@/lib/types'

export interface ChatSlice {
  chatMessages: ChatMessage[]
  addUserMessage: (payload: { suggestionType: CardType | null; text: string }) => void
  beginAssistantMessage: () => void
  appendToLastMessage: (delta: string) => void
  finaliseLastMessage: () => void
  clearChat: () => void
}

export const createChatSlice: StateCreator<AllSlices, [], [], ChatSlice> = (set) => ({
  chatMessages: [],
  addUserMessage: ({ suggestionType, text }) => {
    if (!text.trim()) return
    set((s) => ({
      chatMessages: [...s.chatMessages, { role: 'user', suggestionType, text }],
    }))
  },
  beginAssistantMessage: () =>
    set((s) => ({
      chatMessages: [...s.chatMessages, { role: 'assistant', text: '' }],
    })),
  appendToLastMessage: (delta) =>
    set((s) => {
      if (s.chatMessages.length === 0) return s
      const next = s.chatMessages.slice()
      const last = next[next.length - 1]
      next[next.length - 1] = { ...last, text: last.text + delta }
      return { chatMessages: next }
    }),
  finaliseLastMessage: () => {
    // No-op marker; signals streaming has completed.
  },
  clearChat: () => set({ chatMessages: [] }),
})
