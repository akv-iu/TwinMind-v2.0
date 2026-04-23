import { describe, expect, it } from 'vitest'
import { parseSuggestRequestBody } from '@/app/api/suggest/route'
import { SUGGEST_INTENT_PROMPTS_DEFAULT } from '@/store/settingsSlice'

describe('suggest route contract parser', () => {
  it('rejects the old merged-prompt request shape', () => {
    const result = parseSuggestRequestBody({
      transcript: 'legacy transcript',
      prompt: 'legacy prompt',
      apiKey: 'gsk_test',
    })
    expect(result).toEqual({ ok: false, error: 'invalid request shape' })
  })

  it('applies hard per-field caps for structured payloads', () => {
    const result = parseSuggestRequestBody({
      transcriptTail: 't'.repeat(12_000),
      rollingSummary: 's'.repeat(2_000),
      priorBatchesText: 'p'.repeat(1_400),
      meetingKind: 'standup',
      intentPrompts: {
        QUESTION_TO_ASK: 'q'.repeat(700),
        TALKING_POINT: 'k'.repeat(700),
        ANSWER: 'a'.repeat(700),
        FACT_CHECK: 'f'.repeat(700),
      },
      apiKey: 'gsk_test',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.body.transcriptTail.length).toBe(8_000)
    expect(result.body.rollingSummary.length).toBe(1_200)
    expect(result.body.priorBatchesText.length).toBe(1_000)
    expect(result.body.intentPrompts.QUESTION_TO_ASK.length).toBe(500)
    expect(result.body.intentPrompts.TALKING_POINT.length).toBe(500)
    expect(result.body.intentPrompts.ANSWER.length).toBe(500)
    expect(result.body.intentPrompts.FACT_CHECK.length).toBe(500)

    expect(result.body.truncationEvents.transcriptTruncated).toBe(true)
    expect(result.body.truncationEvents.summaryTruncated).toBe(true)
    expect(result.body.truncationEvents.priorBatchesTruncated).toBe(true)
    expect(result.body.truncationEvents.intentQuestionToAskTruncated).toBe(true)
  })

  it('falls back to default intent prompts when field is omitted', () => {
    const result = parseSuggestRequestBody({
      transcriptTail: 'recent lines',
      rollingSummary: '',
      priorBatchesText: '',
      apiKey: 'gsk_test',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.body.intentPrompts).toEqual(SUGGEST_INTENT_PROMPTS_DEFAULT)
  })

  it('rejects invalid field types', () => {
    const result = parseSuggestRequestBody({
      transcriptTail: 'recent lines',
      rollingSummary: 123,
      priorBatchesText: '',
      apiKey: 'gsk_test',
    })
    expect(result).toEqual({ ok: false, error: 'invalid field type' })
  })
})
