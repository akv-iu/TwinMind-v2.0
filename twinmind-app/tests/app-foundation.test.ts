import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '@/store'
import {
  buildChatPrompt,
  CHAT_PROMPT_DEFAULT,
  SUGGEST_INTENT_PROMPTS_DEFAULT,
} from '@/store/settingsSlice'

beforeEach(() => {
  useStore.setState({
    transcriptLines: [],
    isTranscribing: false,
    isRecording: false,
    batches: [],
    meetingKind: null,
    chatMessages: [],
    groqApiKey: '',
    suggestIntentPrompts: { ...SUGGEST_INTENT_PROMPTS_DEFAULT },
    chatPrompt: CHAT_PROMPT_DEFAULT,
    suggestContextChars: 3000,
    chatContextChars: 8000,
  })
})

describe('app-foundation', () => {
  it('exposes default settings on a fresh store', () => {
    const s = useStore.getState()
    expect(s.groqApiKey).toBe('')
    expect(s.suggestIntentPrompts).toEqual(SUGGEST_INTENT_PROMPTS_DEFAULT)
    expect(s.chatPrompt).toBe(CHAT_PROMPT_DEFAULT)
    expect(s.suggestContextChars).toBe(3000)
    expect(s.chatContextChars).toBe(8000)
  })

  it('updateSettings patches only the keys it is given', () => {
    useStore.getState().updateSettings({ groqApiKey: 'gsk_test' })
    expect(useStore.getState().groqApiKey).toBe('gsk_test')
    expect(useStore.getState().suggestIntentPrompts).toEqual(
      SUGGEST_INTENT_PROMPTS_DEFAULT,
    )
  })

  it('resetPromptsToDefault restores suggest/chat prompts but keeps the api key', () => {
    useStore.getState().updateSettings({
      groqApiKey: 'gsk_keep',
      suggestIntentPrompts: {
        ...SUGGEST_INTENT_PROMPTS_DEFAULT,
        ANSWER: 'custom answer prompt',
      },
      chatPrompt: 'custom',
    })
    useStore.getState().resetPromptsToDefault()
    const s = useStore.getState()
    expect(s.groqApiKey).toBe('gsk_keep')
    expect(s.suggestIntentPrompts).toEqual(SUGGEST_INTENT_PROMPTS_DEFAULT)
    expect(s.chatPrompt).toBe(CHAT_PROMPT_DEFAULT)
  })

  it('setRecording updates recording state', () => {
    useStore.getState().setRecording(true)
    expect(useStore.getState().isRecording).toBe(true)
    useStore.getState().setRecording(false)
    expect(useStore.getState().isRecording).toBe(false)
  })

  it('selector references are stable across reads', () => {
    const a = useStore.getState().addTranscriptLine
    const b = useStore.getState().addTranscriptLine
    expect(a).toBe(b)
  })

  it('buildChatPrompt adds empty-state guidance when transcript is missing', () => {
    const prompt = buildChatPrompt({
      basePrompt: CHAT_PROMPT_DEFAULT,
      rollingSummary: '',
      recentTranscript: '',
    })
    expect(prompt).toContain('CONTEXT NOTE')
    expect(prompt).toContain('No meeting transcript is available yet.')
    expect(prompt).toContain('MEETING_SUMMARY_SO_FAR:\nnone yet')
    expect(prompt).toContain('RECENT_TRANSCRIPT (timestamped):\n(none yet)')
  })

  it('buildChatPrompt keeps transcript context branch unchanged when transcript exists', () => {
    const prompt = buildChatPrompt({
      basePrompt: CHAT_PROMPT_DEFAULT,
      rollingSummary: '',
      recentTranscript: '[04:52:07 PM] We should push to Friday.',
    })
    expect(prompt).not.toContain('CONTEXT NOTE')
    expect(prompt).toContain('MEETING_SUMMARY_SO_FAR:\nnot available yet')
    expect(prompt).toContain('RECENT_TRANSCRIPT (timestamped):\n[04:52:07 PM] We should push to Friday.')
  })
})
