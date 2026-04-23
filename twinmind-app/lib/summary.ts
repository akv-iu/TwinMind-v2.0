import { takeTailByChars } from '@/lib/context'
import type { TranscriptLine } from '@/lib/types'

export interface SummaryRefreshState {
  transcriptChars: number
  batchCount: number
  lastSummaryTranscriptChars: number
  lastSummaryBatchCount: number
}

export interface RefreshSummaryInput {
  transcript: string
  apiKey: string
  priorSummary?: string
  // Backward-compatible alias for older callers.
  previousSummary?: string
}

export interface BuildSummaryInputOptions {
  transcriptLines: TranscriptLine[]
  suggestContextChars: number
  priorSummary: string
}

export interface SummaryInputPayload {
  transcript: string
  priorSummary: string
  tailBudget: number
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

export function buildSummaryInput(
  options: BuildSummaryInputOptions,
): SummaryInputPayload {
  const priorSummary = options.priorSummary.trim()
  const tailBudget = priorSummary
    ? Math.max(options.suggestContextChars * 3, 12_000)
    : Math.max(options.suggestContextChars * 6, 24_000)

  return {
    transcript: takeTailByChars(options.transcriptLines, tailBudget),
    priorSummary,
    tailBudget,
  }
}

export async function refreshSummary(input: RefreshSummaryInput): Promise<string> {
  const transcript = input.transcript
  const key = input.apiKey.trim()
  const priorSummary =
    input.priorSummary?.trim() ?? input.previousSummary?.trim() ?? ''
  if (!key || !transcript.trim()) return ''

  const res = await fetch('/api/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcript,
      apiKey: key,
      priorSummary,
    }),
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
