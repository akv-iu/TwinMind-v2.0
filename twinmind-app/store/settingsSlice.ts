import type { StateCreator } from 'zustand'
import type { AllSlices } from './index'
import type { SuggestIntentPrompts } from '@/lib/types'

export const SUGGEST_INTENT_PROMPTS_DEFAULT: SuggestIntentPrompts = {
  QUESTION_TO_ASK:
    'Ask the single highest-value question that would unblock the next decision.',
  TALKING_POINT:
    'Offer a concise talking point that advances the conversation or aligns stakeholders.',
  ANSWER:
    'Provide the best direct answer to the most recent explicit or implied question.',
  FACT_CHECK:
    'Flag any claim that may be inaccurate, incomplete, or unsourced, and suggest what to verify.',
  CLARIFYING_INFO:
    'Provide short clarifying context that removes ambiguity or defines terms being discussed.',
}

function cloneSuggestIntentPrompts(
  prompts: SuggestIntentPrompts,
): SuggestIntentPrompts {
  return { ...prompts }
}

export function buildSuggestPrompt(intentPrompts: SuggestIntentPrompts): string {
  return [
    'You are a real-time meeting assistant.',
    'Use the transcript to generate exactly 3 suggestions that are most useful right now.',
    'The 3 suggestions can be any mix of the valid types below, including repeats when context justifies it.',
    'Prioritize recency and immediate usefulness over generic advice.',
    'Respond ONLY with JSON in this exact shape:',
    '{"cards":[{"type":"QUESTION_TO_ASK","preview":"..."},{"type":"TALKING_POINT","preview":"..."},{"type":"ANSWER","preview":"..."}]}',
    'Every card must contain:',
    '- type: one of QUESTION_TO_ASK, TALKING_POINT, ANSWER, FACT_CHECK, CLARIFYING_INFO',
    '- preview: one punchy, self-contained sentence',
    'Intent guidance:',
    `- QUESTION_TO_ASK: ${intentPrompts.QUESTION_TO_ASK}`,
    `- TALKING_POINT: ${intentPrompts.TALKING_POINT}`,
    `- ANSWER: ${intentPrompts.ANSWER}`,
    `- FACT_CHECK: ${intentPrompts.FACT_CHECK}`,
    `- CLARIFYING_INFO: ${intentPrompts.CLARIFYING_INFO}`,
  ].join('\n')
}

export const CHAT_PROMPT_DEFAULT =
  "You are a meeting assistant with access to a full conversation transcript. The user has selected a suggestion or asked a question. Provide a detailed, specific, and helpful response using the transcript as primary context. Be direct and concise."

export interface SettingsSlice {
  groqApiKey: string
  suggestIntentPrompts: SuggestIntentPrompts
  chatPrompt: string
  suggestContextChars: number
  chatContextChars: number
  updateSettings: (patch: Partial<{
    groqApiKey: string
    suggestIntentPrompts: SuggestIntentPrompts
    chatPrompt: string
    suggestContextChars: number
    chatContextChars: number
  }>) => void
  resetPromptsToDefault: () => void
}

export const createSettingsSlice: StateCreator<AllSlices, [], [], SettingsSlice> = (set) => ({
  groqApiKey: '',
  suggestIntentPrompts: cloneSuggestIntentPrompts(SUGGEST_INTENT_PROMPTS_DEFAULT),
  chatPrompt: CHAT_PROMPT_DEFAULT,
  suggestContextChars: 3000,
  chatContextChars: 8000,
  updateSettings: (patch) => set(patch),
  resetPromptsToDefault: () =>
    set({
      suggestIntentPrompts: cloneSuggestIntentPrompts(
        SUGGEST_INTENT_PROMPTS_DEFAULT,
      ),
      chatPrompt: CHAT_PROMPT_DEFAULT,
    }),
})
