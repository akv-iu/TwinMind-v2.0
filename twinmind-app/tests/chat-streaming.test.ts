import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '@/store'

beforeEach(() => {
  useStore.setState({ chatMessages: [], isRecording: false })
})

describe('chat slice', () => {
  it('addUserMessage appends a user-role message', () => {
    useStore.getState().addUserMessage({ suggestionType: null, text: 'hello' })
    const messages = useStore.getState().chatMessages
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('user')
    expect(messages[0].text).toBe('hello')
    expect(messages[0].suggestionType).toBeNull()
  })

  it('addUserMessage stores the suggestion type when provided', () => {
    useStore.getState().addUserMessage({
      suggestionType: 'FACT_CHECK',
      text: 'verify this',
    })
    expect(useStore.getState().chatMessages[0].suggestionType).toBe('FACT_CHECK')
  })

  it('addUserMessage rejects empty input', () => {
    useStore.getState().addUserMessage({ suggestionType: null, text: '   ' })
    expect(useStore.getState().chatMessages).toHaveLength(0)
  })

  it('beginAssistantMessage appends an empty assistant slot', () => {
    useStore.getState().beginAssistantMessage()
    const last = useStore.getState().chatMessages.at(-1)!
    expect(last.role).toBe('assistant')
    expect(last.text).toBe('')
    expect(last.isFinalized).toBe(false)
  })

  it('appendToLastMessage concatenates streamed deltas', () => {
    useStore.getState().beginAssistantMessage()
    useStore.getState().appendToLastMessage('Hel')
    useStore.getState().appendToLastMessage('lo, ')
    useStore.getState().appendToLastMessage('world!')
    expect(useStore.getState().chatMessages.at(-1)!.text).toBe('Hello, world!')
    expect(useStore.getState().chatMessages.at(-1)!.isFinalized).toBe(false)
  })

  it('finaliseLastMessage marks the last message as finalized', () => {
    useStore.getState().beginAssistantMessage()
    useStore.getState().appendToLastMessage('partial')
    useStore.getState().finaliseLastMessage()
    expect(useStore.getState().chatMessages.at(-1)!.isFinalized).toBe(true)
  })

  it('appendToLastMessage is a no-op when no messages exist', () => {
    useStore.getState().appendToLastMessage('orphan')
    expect(useStore.getState().chatMessages).toHaveLength(0)
  })

  it('clearChat empties the conversation', () => {
    useStore.getState().addUserMessage({ suggestionType: null, text: 'a' })
    useStore.getState().beginAssistantMessage()
    useStore.getState().clearChat()
    expect(useStore.getState().chatMessages).toHaveLength(0)
  })
})

describe('SSE delta assembly', () => {
  function parseSseChunk(buffer: string): { events: string[]; rest: string } {
    const events: string[] = []
    let rest = buffer
    let i = rest.indexOf('\n\n')
    while (i !== -1) {
      events.push(rest.slice(0, i))
      rest = rest.slice(i + 2)
      i = rest.indexOf('\n\n')
    }
    return { events, rest }
  }

  it('splits a chunked SSE stream into discrete events', () => {
    const stream =
      'data: {"delta":"Hello"}\n\n' +
      'data: {"delta":" world"}\n\n' +
      'data: [DONE]\n\n'
    const { events, rest } = parseSseChunk(stream)
    expect(events).toHaveLength(3)
    expect(rest).toBe('')
    const deltas: string[] = []
    for (const e of events) {
      const payload = e.replace(/^data:\s*/, '')
      if (payload === '[DONE]') continue
      deltas.push((JSON.parse(payload) as { delta: string }).delta)
    }
    expect(deltas.join('')).toBe('Hello world')
  })

  it('preserves an unfinished trailing event in the buffer', () => {
    const stream = 'data: {"delta":"Hello"}\n\ndata: {"delta":" wo'
    const { events, rest } = parseSseChunk(stream)
    expect(events).toHaveLength(1)
    expect(rest).toBe('data: {"delta":" wo')
  })
})
