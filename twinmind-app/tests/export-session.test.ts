import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildSessionExport, exportSession } from '@/lib/export'
import { getBatchOpacity } from '@/components/suggestions/SuggestionBatch'
import type { ChatMessage, SuggestionBatch, TranscriptLine } from '@/lib/types'

function sampleTranscript(): TranscriptLine[] {
  return [
    { id: 'line-1', timestamp: '04:52:07 PM', text: 'Hello world' },
    { id: 'line-2', timestamp: '04:52:37 PM', text: 'Next point' },
  ]
}

function sampleBatches(): SuggestionBatch[] {
  return [
    {
      batchNumber: 1,
      timestamp: '04:53:00 PM',
      cards: [
        { type: 'QUESTION_TO_ASK', preview: 'What is the blocker?' },
        { type: 'TALKING_POINT', preview: 'Mention migration progress.' },
        { type: 'ANSWER', preview: 'The rollout is complete.' },
      ],
    },
  ]
}

function sampleChat(): ChatMessage[] {
  return [
    {
      role: 'user',
      suggestionType: 'FACT_CHECK',
      text: 'Can we verify that metric?',
    },
    {
      role: 'assistant',
      text: 'The metric was revised last quarter.',
    },
  ]
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('buildSessionExport', () => {
  it('matches required export schema', () => {
    const result = buildSessionExport(sampleTranscript(), sampleBatches(), sampleChat())

    expect(result.transcript).toHaveLength(2)
    expect(result.transcript[0]).toEqual({
      timestamp: '04:52:07 PM',
      text: 'Hello world',
    })
    expect('id' in result.transcript[0]).toBe(false)

    expect(result.suggestionBatches[0].cards).toHaveLength(3)

    expect(result.chat[0]).toEqual({
      role: 'user',
      suggestionType: 'FACT_CHECK',
      text: 'Can we verify that metric?',
    })
    expect(result.chat[1]).toEqual({
      role: 'assistant',
      text: 'The metric was revised last quarter.',
    })
    expect('suggestionType' in result.chat[1]).toBe(false)
  })
})

describe('exportSession', () => {
  it('returns false and does nothing when all slices are empty', () => {
    const createElementSpy = vi.spyOn(document, 'createElement')
    expect(exportSession([], [], [])).toBe(false)
    expect(createElementSpy).not.toHaveBeenCalled()
  })

  it('creates a download with a sanitized filename', () => {
    const originalCreateElement = document.createElement.bind(document)
    const anchor = originalCreateElement('a')

    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tagName: string) => {
        if (tagName.toLowerCase() === 'a') return anchor
        return originalCreateElement(tagName)
      })

    const appendChildSpy = vi.spyOn(document.body, 'appendChild')
    const removeChildSpy = vi.spyOn(document.body, 'removeChild')
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    const createObjectUrlSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock')
    const revokeObjectUrlSpy = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {})

    expect(exportSession(sampleTranscript(), sampleBatches(), sampleChat())).toBe(true)

    expect(createElementSpy).toHaveBeenCalledWith('a')
    expect(anchor.download).toMatch(/^twinmind-session-/)
    expect(anchor.download.endsWith('.json')).toBe(true)
    expect(anchor.download.includes(':')).toBe(false)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(appendChildSpy).toHaveBeenCalledTimes(1)
    expect(removeChildSpy).toHaveBeenCalledTimes(1)
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(1)
  })
})

describe('getBatchOpacity', () => {
  it('returns opacity classes by index tier', () => {
    expect(getBatchOpacity(0)).toBe('opacity-100')
    expect(getBatchOpacity(1)).toBe('opacity-60')
    expect(getBatchOpacity(2)).toBe('opacity-35')
    expect(getBatchOpacity(10)).toBe('opacity-35')
  })
})
