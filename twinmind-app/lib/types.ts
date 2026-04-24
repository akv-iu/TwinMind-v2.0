export type CardType =
  | 'QUESTION_TO_ASK'
  | 'TALKING_POINT'
  | 'ANSWER'
  | 'FACT_CHECK'

export type MeetingKind =
  | 'standup'
  | 'sales'
  | 'one_on_one'
  | 'design_review'
  | 'interview'
  | 'brainstorm'
  | 'presentation'
  | 'retrospective'
  | 'other'

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
  repaired?: boolean
}

export interface ChatMessage {
  id: string
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

export interface ExportTranscriptLine {
  timestamp: string
  text: string
}

export interface ExportChatMessage {
  role: 'user' | 'assistant'
  suggestionType?: CardType | null
  text: string
}

export interface SessionExportSettingsSnapshot {
  suggestIntentPrompts: SuggestIntentPrompts
  chatPrompt: string
  suggestContextChars: number
  chatContextChars: number
}

export interface SessionExport {
  exportedAt: string
  transcript: ExportTranscriptLine[]
  suggestionBatches: SuggestionBatch[]
  chat: ExportChatMessage[]
  summary: string
  meetingKind: MeetingKind | null
  settingsSnapshot: SessionExportSettingsSnapshot
  degradedBatchCount: number
}
