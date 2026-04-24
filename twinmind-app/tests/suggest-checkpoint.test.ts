import { describe, expect, it } from 'vitest'
import type { SuggestionBatch, TranscriptLine } from '@/lib/types'
import {
  CHECKPOINT_BATCH_INTERVAL,
  getCheckpointSummaryWindow,
  getSuggestTranscriptTailFromCheckpoint,
  selectPriorBatchesForCheckpoint,
  shouldStartCheckpointSummary,
} from '@/lib/suggestCheckpoint'

function makeLine(id: number, text: string): TranscriptLine {
  return {
    id: `line-${id}`,
    timestamp: `[10:00:0${id} AM]`,
    text,
  }
}

function makeBatch(batchNumber: number, preview: string): SuggestionBatch {
  return {
    batchNumber,
    timestamp: '10:00:00 AM',
    cards: [{ type: 'QUESTION_TO_ASK', preview }],
  }
}

describe('suggest checkpoint helpers', () => {
  it('starts checkpoint only when four new batches have accrued and no pending request', () => {
    expect(
      shouldStartCheckpointSummary({
        batchCount: CHECKPOINT_BATCH_INTERVAL - 1,
        committedCheckpointBatchCount: 0,
        hasPendingCheckpoint: false,
      }),
    ).toBe(false)

    expect(
      shouldStartCheckpointSummary({
        batchCount: CHECKPOINT_BATCH_INTERVAL,
        committedCheckpointBatchCount: 0,
        hasPendingCheckpoint: false,
      }),
    ).toBe(true)

    expect(
      shouldStartCheckpointSummary({
        batchCount: CHECKPOINT_BATCH_INTERVAL + 1,
        committedCheckpointBatchCount: 0,
        hasPendingCheckpoint: true,
      }),
    ).toBe(false)
  })

  it('builds suggest transcript tail from committed checkpoint forward', () => {
    const transcriptLines = [
      makeLine(1, 'alpha checkpointed'),
      makeLine(2, 'beta checkpointed'),
      makeLine(3, 'gamma fresh'),
      makeLine(4, 'delta fresh'),
    ]

    const tail = getSuggestTranscriptTailFromCheckpoint({
      transcriptLines,
      committedCheckpointLineCount: 2,
      suggestContextChars: 1000,
    })

    expect(tail).toContain('gamma fresh')
    expect(tail).toContain('delta fresh')
    expect(tail).not.toContain('alpha checkpointed')
    expect(tail).not.toContain('beta checkpointed')
  })

  it('builds summary window up to a snapshot boundary without dropping unsummarized lines', () => {
    const transcriptLines = [
      makeLine(1, 'line one'),
      makeLine(2, 'line two'),
      makeLine(3, 'line three'),
      makeLine(4, 'line four'),
      makeLine(5, 'line five'),
    ]

    const window = getCheckpointSummaryWindow({
      transcriptLines,
      committedCheckpointLineCount: 2,
      snapshotLineCount: 4,
    })

    expect(window).toHaveLength(2)
    expect(window[0].text).toBe('line three')
    expect(window[1].text).toBe('line four')
  })

  it('keeps current checkpoint window batches plus one carryover batch', () => {
    const batches = [
      makeBatch(7, 'batch 7'),
      makeBatch(6, 'batch 6'),
      makeBatch(5, 'batch 5'),
      makeBatch(4, 'batch 4'),
      makeBatch(3, 'batch 3'),
    ]

    const selected = selectPriorBatchesForCheckpoint({
      batches,
      committedCheckpointBatchCount: 4,
    })

    expect(selected.map((b) => b.batchNumber)).toEqual([7, 6, 5, 4])
  })
})
