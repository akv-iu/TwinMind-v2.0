import type {
  ChatMessage,
  SuggestionBatch,
  TranscriptLine,
} from '@/lib/types'

export interface ExportTranscriptLine {
  timestamp: string
  text: string
}

export interface ExportChatMessage {
  role: 'user' | 'assistant'
  suggestionType?: ChatMessage['suggestionType']
  text: string
}

export interface SessionExport {
  exportedAt: string
  transcript: ExportTranscriptLine[]
  suggestionBatches: SuggestionBatch[]
  chat: ExportChatMessage[]
}

export function buildSessionExport(
  transcript: TranscriptLine[],
  batches: SuggestionBatch[],
  chat: ChatMessage[],
): SessionExport {
  return {
    exportedAt: new Date().toISOString(),
    transcript: transcript.map(({ timestamp, text }) => ({ timestamp, text })),
    suggestionBatches: batches,
    chat: chat.map(({ role, suggestionType, text }) => (
      suggestionType == null
        ? { role, text }
        : { role, suggestionType, text }
    )),
  }
}

export function exportSession(
  transcript: TranscriptLine[],
  batches: SuggestionBatch[],
  chat: ChatMessage[],
): boolean {
  if (transcript.length === 0 && batches.length === 0 && chat.length === 0) {
    return false
  }

  const payload = buildSessionExport(transcript, batches, chat)
  const json = JSON.stringify(payload, null, 2)

  if (typeof window === 'undefined') return true

  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `twinmind-session-${payload.exportedAt.replace(/[:.]/g, '-')}.json`
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
  return true
}
