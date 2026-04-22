export interface SummaryRefreshState {
  transcriptChars: number
  batchCount: number
  lastSummaryTranscriptChars: number
  lastSummaryBatchCount: number
}

const MIN_TRANSCRIPT_CHAR_GROWTH = 1500
const MIN_BATCH_GROWTH = 5

export function shouldRefreshSummary(state: SummaryRefreshState): boolean {
  if (
    state.transcriptChars - state.lastSummaryTranscriptChars >=
    MIN_TRANSCRIPT_CHAR_GROWTH
  ) {
    return true
  }

  if (state.batchCount - state.lastSummaryBatchCount >= MIN_BATCH_GROWTH) {
    return true
  }

  return false
}

export async function refreshSummary(
  transcript: string,
  apiKey: string,
): Promise<string> {
  const key = apiKey.trim()
  if (!key || !transcript.trim()) return ''

  const res = await fetch('/api/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript, apiKey: key }),
  })

  if (!res.ok) {
    const data = (await res.json().catch(() => ({ error: 'Summary failed' }))) as {
      error?: string
    }
    throw new Error(data.error ?? 'Summary failed')
  }

  const data = (await res.json()) as { summary?: unknown }
  return typeof data.summary === 'string' ? data.summary.trim() : ''
}

