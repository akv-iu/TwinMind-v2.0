import { takeTailByChars } from '@/lib/context'
import type { SuggestionBatch, TranscriptLine } from '@/lib/types'

export const CHECKPOINT_BATCH_INTERVAL = 4
export const CHECKPOINT_SUMMARY_RETRY_COOLDOWN_MS = 15_000

export function shouldStartCheckpointSummary(input: {
  batchCount: number
  committedCheckpointBatchCount: number
  hasPendingCheckpoint: boolean
}): boolean {
  if (input.hasPendingCheckpoint) return false
  return (
    input.batchCount - input.committedCheckpointBatchCount >=
    CHECKPOINT_BATCH_INTERVAL
  )
}

export function getSuggestTranscriptTailFromCheckpoint(input: {
  transcriptLines: TranscriptLine[]
  committedCheckpointLineCount: number
  suggestContextChars: number
}): string {
  const start = Math.max(
    0,
    Math.min(input.committedCheckpointLineCount, input.transcriptLines.length),
  )
  const checkpointDelta = input.transcriptLines.slice(start)
  return takeTailByChars(checkpointDelta, input.suggestContextChars)
}

export function getCheckpointSummaryWindow(input: {
  transcriptLines: TranscriptLine[]
  committedCheckpointLineCount: number
  snapshotLineCount?: number
}): TranscriptLine[] {
  const start = Math.max(
    0,
    Math.min(input.committedCheckpointLineCount, input.transcriptLines.length),
  )
  const requestedEnd =
    typeof input.snapshotLineCount === 'number'
      ? input.snapshotLineCount
      : input.transcriptLines.length
  const end = Math.max(start, Math.min(requestedEnd, input.transcriptLines.length))
  return input.transcriptLines.slice(start, end)
}

export function selectPriorBatchesForCheckpoint(input: {
  batches: SuggestionBatch[]
  committedCheckpointBatchCount: number
}): SuggestionBatch[] {
  const currentWindow = input.batches.filter(
    (batch) => batch.batchNumber > input.committedCheckpointBatchCount,
  )
  if (input.committedCheckpointBatchCount <= 0) {
    return currentWindow
  }

  const carryover = input.batches.find(
    (batch) => batch.batchNumber === input.committedCheckpointBatchCount,
  )
  if (!carryover) {
    return currentWindow
  }
  return [...currentWindow, carryover]
}
