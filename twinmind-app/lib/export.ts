import type {
  ChatMessage,
  SessionExport,
  SessionExportSettingsSnapshot,
  SuggestionBatch,
  TranscriptLine,
} from '@/lib/types'

export interface SessionExportExtras {
  summary: string
  meetingKind: SessionExport['meetingKind']
  settingsSnapshot: SessionExportSettingsSnapshot
}

export function buildSessionExport(
  transcript: TranscriptLine[],
  batches: SuggestionBatch[],
  chat: ChatMessage[],
  extras: SessionExportExtras,
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
    summary: extras.summary,
    meetingKind: extras.meetingKind,
    settingsSnapshot: {
      suggestIntentPrompts: { ...extras.settingsSnapshot.suggestIntentPrompts },
      chatPrompt: extras.settingsSnapshot.chatPrompt,
      suggestContextChars: extras.settingsSnapshot.suggestContextChars,
      chatContextChars: extras.settingsSnapshot.chatContextChars,
    },
    degradedBatchCount: batches.filter((batch) => batch.degraded).length,
  }
}

export function exportSession(
  transcript: TranscriptLine[],
  batches: SuggestionBatch[],
  chat: ChatMessage[],
  extras: SessionExportExtras,
): boolean {
  if (transcript.length === 0 && batches.length === 0 && chat.length === 0) {
    return false
  }

  const payload = buildSessionExport(transcript, batches, chat, extras)
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
