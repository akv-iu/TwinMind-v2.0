import { describe, expect, it, beforeEach } from 'vitest'
import { useStore } from '@/store'
import {
  CHAT_PROMPT_DEFAULT,
  SUGGEST_PROMPT_DEFAULT,
} from '@/store/settingsSlice'

beforeEach(() => {
  useStore.setState({
    transcriptLines: [],
    batches: [],
    chatMessages: [],
    groqApiKey: '',
    suggestPrompt: SUGGEST_PROMPT_DEFAULT,
    chatPrompt: CHAT_PROMPT_DEFAULT,
    suggestContextChars: 3000,
    chatContextChars: 8000,
  })
})

describe('app-foundation', () => {
  it('exposes default settings on a fresh store', () => {
    const s = useStore.getState()
    expect(s.groqApiKey).toBe('')
    expect(s.suggestPrompt).toBe(SUGGEST_PROMPT_DEFAULT)
    expect(s.chatPrompt).toBe(CHAT_PROMPT_DEFAULT)
    expect(s.suggestContextChars).toBe(3000)
    expect(s.chatContextChars).toBe(8000)
  })

  it('updateSettings patches only the keys it is given', () => {
    useStore.getState().updateSettings({ groqApiKey: 'gsk_test' })
    expect(useStore.getState().groqApiKey).toBe('gsk_test')
    expect(useStore.getState().suggestPrompt).toBe(SUGGEST_PROMPT_DEFAULT)
  })

  it('resetPromptsToDefault restores both prompts but keeps the api key', () => {
    useStore.getState().updateSettings({
      groqApiKey: 'gsk_keep',
      suggestPrompt: 'custom',
      chatPrompt: 'custom',
    })
    useStore.getState().resetPromptsToDefault()
    const s = useStore.getState()
    expect(s.groqApiKey).toBe('gsk_keep')
    expect(s.suggestPrompt).toBe(SUGGEST_PROMPT_DEFAULT)
    expect(s.chatPrompt).toBe(CHAT_PROMPT_DEFAULT)
  })

  it('selector references are stable across reads', () => {
    const a = useStore.getState().addTranscriptLine
    const b = useStore.getState().addTranscriptLine
    expect(a).toBe(b)
  })
})
