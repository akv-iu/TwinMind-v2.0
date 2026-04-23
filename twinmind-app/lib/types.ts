export type CardType =
  | 'QUESTION_TO_ASK'
  | 'TALKING_POINT'
  | 'ANSWER'
  | 'FACT_CHECK'

export interface SuggestIntentPrompts {
  QUESTION_TO_ASK: string
  TALKING_POINT: string
  ANSWER: string
  FACT_CHECK: string
}

export interface TranscriptLine {
  id: string
  timestamp: string
  text: string
}

export interface SuggestionCard {
  type: CardType
  preview: string
}

export interface SuggestionBatch {
  batchNumber: number
  timestamp: string
  cards: SuggestionCard[]
  degraded?: boolean
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  suggestionType?: CardType | null
  text: string
  isFinalized?: boolean
  isFailed?: boolean
}

export interface SettingsState {
  groqApiKey: string
  suggestIntentPrompts: SuggestIntentPrompts
  chatPrompt: string
  suggestContextChars: number
  chatContextChars: number
}
