import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deduplicateTail, lastWords } from '@/lib/dedup'
import {
  attachMicTrackListeners,
  transcribeWithRetry,
} from '@/lib/hooks/useAudioRecorder'
import { useStore } from '@/store'

beforeEach(() => {
  useStore.setState({ transcriptLines: [], isTranscribing: false, isRecording: false })
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

describe('transcribeWithRetry', () => {
  it('retries 503 responses and eventually succeeds', async () => {
    const responses = [
      new Response(JSON.stringify({ error: 'upstream down' }), { status: 503 }),
      new Response(JSON.stringify({ error: 'upstream down' }), { status: 503 }),
      new Response(JSON.stringify({ error: 'upstream down' }), { status: 503 }),
      new Response(JSON.stringify({ text: 'final transcript' }), { status: 200 }),
    ]
    const fetchImpl = vi.fn(async () => responses.shift()!)
    const wait = vi.fn(async (_ms: number) => {})
    const form = new FormData()

    const text = await transcribeWithRetry(form, { fetchImpl, wait })

    expect(text).toBe('final transcript')
    expect(fetchImpl).toHaveBeenCalledTimes(4)
    expect(wait).toHaveBeenCalledTimes(3)
    expect(wait.mock.calls.map((args) => args[0])).toEqual([250, 1000, 3000])
  })

  it('fails fast on 401 without retry', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'Invalid API key' }), { status: 401 }),
    )
    const wait = vi.fn(async (_ms: number) => {})
    const form = new FormData()

    await expect(transcribeWithRetry(form, { fetchImpl, wait })).rejects.toThrow(
      'Invalid API key',
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(wait).not.toHaveBeenCalled()
  })

  it('retries network errors for 4 total attempts then fails', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down')
    })
    const wait = vi.fn(async (_ms: number) => {})
    const form = new FormData()

    await expect(transcribeWithRetry(form, { fetchImpl, wait })).rejects.toThrow(
      'network down',
    )
    expect(fetchImpl).toHaveBeenCalledTimes(4)
    expect(wait).toHaveBeenCalledTimes(3)
    expect(wait.mock.calls.map((args) => args[0])).toEqual([250, 1000, 3000])
  })

  it('retries 429 and succeeds on the next attempt', async () => {
    const responses = [
      new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429 }),
      new Response(JSON.stringify({ text: 'retried transcript' }), { status: 200 }),
    ]
    const fetchImpl = vi.fn(async () => responses.shift()!)
    const wait = vi.fn(async (_ms: number) => {})
    const form = new FormData()

    const text = await transcribeWithRetry(form, { fetchImpl, wait })

    expect(text).toBe('retried transcript')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledTimes(1)
    expect(wait).toHaveBeenCalledWith(250)
  })
})

describe('attachMicTrackListeners', () => {
  it('reflects mute/unmute state and emits ended once', () => {
    const track = new EventTarget() as EventTarget & {
      muted: boolean
      addEventListener: MediaStreamTrack['addEventListener']
      removeEventListener: MediaStreamTrack['removeEventListener']
      dispatchEvent: (event: Event) => boolean
    }
    track.muted = false

    const mutedEvents: boolean[] = []
    const onEnded = vi.fn()

    const binding = attachMicTrackListeners(track as unknown as MediaStreamTrack, {
      onMutedChange: (next) => mutedEvents.push(next),
      onEnded,
    })

    track.muted = true
    track.dispatchEvent(new Event('mute'))

    track.muted = false
    track.dispatchEvent(new Event('unmute'))

    track.dispatchEvent(new Event('ended'))

    expect(mutedEvents).toEqual([false, true, false])
    expect(onEnded).toHaveBeenCalledTimes(1)

    binding.detach()
    track.muted = true
    track.dispatchEvent(new Event('mute'))
    expect(mutedEvents).toEqual([false, true, false])
  })
})
