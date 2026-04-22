import type { StateCreator } from 'zustand'
import type { AllSlices } from './index'

export const SUGGEST_PROMPT_DEFAULT =
  "You are a real-time meeting assistant. Based on the transcript below, generate exactly 3 suggestions. Return a JSON array where each item has: type (one of: QUESTION_TO_ASK, TALKING_POINT, ANSWER, FACT_CHECK) and preview (one punchy sentence, self-contained and useful without clicking). Vary the types - do not repeat the same type twice. Ground every suggestion in the most recent content. Respond ONLY with the JSON array - no prose, no markdown fences."

export const CHAT_PROMPT_DEFAULT =
  "You are a meeting assistant with access to a full conversation transcript. The user has selected a suggestion or asked a question. Provide a detailed, specific, and helpful response using the transcript as primary context. Be direct and concise."

export interface SettingsSlice {
  groqApiKey: string
  suggestPrompt: string
  chatPrompt: string
  suggestContextChars: number
  chatContextChars: number
  updateSettings: (patch: Partial<{
    groqApiKey: string
    suggestPrompt: string
    chatPrompt: string
    suggestContextChars: number
    chatContextChars: number
  }>) => void
  resetPromptsToDefault: () => void
}

export const createSettingsSlice: StateCreator<AllSlices, [], [], SettingsSlice> = (set) => ({
  groqApiKey: '',
  suggestPrompt: SUGGEST_PROMPT_DEFAULT,
  chatPrompt: CHAT_PROMPT_DEFAULT,
  suggestContextChars: 3000,
  chatContextChars: 8000,
  updateSettings: (patch) => set(patch),
  resetPromptsToDefault: () =>
    set({ suggestPrompt: SUGGEST_PROMPT_DEFAULT, chatPrompt: CHAT_PROMPT_DEFAULT }),
})
