import { beforeEach, describe, expect, it } from 'vitest'
import { deduplicateTail, lastWords } from '@/lib/dedup'
import { useStore } from '@/store'

beforeEach(() => {
  useStore.setState({ transcriptLines: [], isTranscribing: false })
})

describe('deduplicateTail', () => {
  it('strips an exact word-level overlap from the new text', () => {
    const prev = 'the quick brown fox jumps'
    const next = 'brown fox jumps over the lazy dog'
    expect(deduplicateTail(prev, next)).toBe('over the lazy dog')
  })

  it('is case-insensitive at the join boundary', () => {
    const prev = 'we should ship the feature'
    const next = 'Ship the FEATURE next week'
    expect(deduplicateTail(prev, next)).toBe('next week')
  })

  it('returns the original new text when there is no overlap', () => {
    const prev = 'one two three'
    const next = 'four five six'
    expect(deduplicateTail(prev, next)).toBe('four five six')
  })

  it('caps overlap detection at 20 words', () => {
    const words = Array.from({ length: 25 }, (_, i) => `w${i}`).join(' ')
    expect(deduplicateTail(words, words)).toBe(
      Array.from({ length: 5 }, (_, i) => `w${i + 20}`).join(' '),
    )
  })

  it('handles empty inputs without throwing', () => {
    expect(deduplicateTail('', 'hello world')).toBe('hello world')
    expect(deduplicateTail('hello', '')).toBe('')
  })
})

describe('lastWords', () => {
  it('returns the last N whitespace-delimited words', () => {
    expect(lastWords('one two three four five', 3)).toBe('three four five')
  })

  it('returns the entire string when fewer words exist than requested', () => {
    expect(lastWords('hi there', 5)).toBe('hi there')
  })
})

describe('transcript slice', () => {
  it('appends new lines and assigns ids', () => {
    useStore.getState().addTranscriptLine({ timestamp: '10:00:01', text: 'Hello' })
    useStore.getState().addTranscriptLine({ timestamp: '10:00:31', text: 'World' })
    const lines = useStore.getState().transcriptLines
    expect(lines).toHaveLength(2)
    expect(lines[0].text).toBe('Hello')
    expect(lines[1].text).toBe('World')
    expect(lines[0].id).not.toBe(lines[1].id)
  })

  it('clearTranscript empties the buffer', () => {
    useStore.getState().addTranscriptLine({ timestamp: '10:00:01', text: 'hi' })
    useStore.getState().clearTranscript()
    expect(useStore.getState().transcriptLines).toHaveLength(0)
  })
})
