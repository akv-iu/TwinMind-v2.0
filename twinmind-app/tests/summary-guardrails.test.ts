import { afterEach, describe, expect, it, vi } from 'vitest'
import { refreshSummary } from '@/lib/summary'
import { shouldRejectSummaryDrift, truncateSummary } from '@/app/api/summarize/route'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('summary guardrails', () => {
  it('truncateSummary enforces the 800-char cap with truncation metadata', () => {
    const raw = `${'A'.repeat(805)} tail`
    const result = truncateSummary(raw)
    expect(result.summary.length).toBeLessThanOrEqual(800)
    expect(result.summaryTruncatedFrom).toBe(raw.length)
    expect(result.summaryTruncatedTo).toBe(result.summary.length)
  })

  it('shouldRejectSummaryDrift rejects oversized summary growth when prior exists', () => {
    const prior = 'x'.repeat(500)
    const drifted = 'y'.repeat(760)
    const safe = 'z'.repeat(700)

    expect(shouldRejectSummaryDrift(prior, drifted)).toBe(true)
    expect(shouldRejectSummaryDrift(prior, safe)).toBe(false)
    expect(shouldRejectSummaryDrift('', drifted)).toBe(false)
  })

  it('refreshSummary sends explicit empty priorSummary when forced', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ summary: 'next summary' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await refreshSummary({
      transcript: 'latest transcript lines',
      apiKey: 'gsk_test',
      priorSummary: '',
    })

    expect(result).toBe('next summary')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const payload = JSON.parse(String(init.body)) as {
      transcript: string
      priorSummary: string
    }
    expect(payload.transcript).toBe('latest transcript lines')
    expect(payload.priorSummary).toBe('')
  })
})
