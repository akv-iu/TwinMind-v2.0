export type CardType = 'QUESTION_TO_ASK' | 'TALKING_POINT' | 'ANSWER' | 'FACT_CHECK'

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
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  suggestionType?: CardType | null
  text: string
}

export interface SettingsState {
  groqApiKey: string
  suggestPrompt: string
  chatPrompt: string
  suggestContextChars: number
  chatContextChars: number
}
