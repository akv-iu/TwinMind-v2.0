import { describe, expect, it } from 'vitest'
import { shouldClassify } from '@/lib/meetingKind'
import {
  CHAT_PROMPT_DEFAULT,
  SUGGEST_INTENT_PROMPTS_DEFAULT,
} from '@/store/settingsSlice'
import { buildChatPrompt, buildSuggestPrompt } from '@/lib/promptBuilders'

describe('meeting-kind classification trigger', () => {
  it('returns true only when enough signal is available and no kind is set', () => {
    expect(
      shouldClassify({
        meetingKind: null,
        batchCount: 3,
        transcriptChars: 500,
        inFlight: false,
      }),
    ).toBe(true)
    expect(
      shouldClassify({
        meetingKind: 'standup',
        batchCount: 3,
        transcriptChars: 500,
        inFlight: false,
      }),
    ).toBe(false)
    expect(
      shouldClassify({
        meetingKind: null,
        batchCount: 2,
        transcriptChars: 500,
        inFlight: false,
      }),
    ).toBe(false)
    expect(
      shouldClassify({
        meetingKind: null,
        batchCount: 3,
        transcriptChars: 499,
        inFlight: false,
      }),
    ).toBe(false)
    expect(
      shouldClassify({
        meetingKind: null,
        batchCount: 3,
        transcriptChars: 500,
        inFlight: true,
      }),
    ).toBe(false)
  })
})

describe('meeting-kind prompt adaptation', () => {
  it('injects kind hints into suggest prompt when provided', () => {
    const prompt = buildSuggestPrompt(SUGGEST_INTENT_PROMPTS_DEFAULT, {
      recentTranscript: '[09:01:00 AM] We have one blocker in infra.',
      rollingSummary: '- Team discussed deployment health.',
      priorBatches: 'QUESTION TO ASK: Who owns retry policy?',
      meetingKind: 'standup',
      kindRoleHint:
        'This is a standup-style sync. Prefer concise unblocker prompts.',
      kindExampleBlock:
        '{"cards":[{"type":"QUESTION_TO_ASK","preview":"What is blocked?"},{"type":"ANSWER","preview":"Deploy passed staging checks."},{"type":"TALKING_POINT","preview":"One follow-up remains open."}]}',
    })
    expect(prompt).toContain('MEETING_KIND: standup')
    expect(prompt).toContain('standup-style sync')
    expect(prompt).toContain('GOOD EXAMPLES')
    expect(prompt).toContain('"cards"')
  })

  it('injects kind-specific style note into chat prompt', () => {
    const prompt = buildChatPrompt({
      basePrompt: CHAT_PROMPT_DEFAULT,
      rollingSummary: '- Pipeline status updated.',
      recentTranscript: '[09:02:00 AM] We should ship by Friday.',
      meetingKind: 'design_review',
    })
    expect(prompt).toContain('MEETING_KIND: design_review')
    expect(prompt).toContain('KIND STYLE NOTE')
  })
})
