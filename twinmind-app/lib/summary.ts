export interface RefreshSummaryInput {
  transcript: string
  apiKey: string
  priorSummary?: string
  // Backward-compatible alias for older callers.
  previousSummary?: string
}

export async function refreshSummary(input: RefreshSummaryInput): Promise<string> {
  const transcript = input.transcript
  const key = input.apiKey.trim()
  const priorSummary =
    input.priorSummary?.trim() ?? input.previousSummary?.trim() ?? ''
  if (!key || !transcript.trim()) return ''

  const res = await fetch('/api/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcript,
      apiKey: key,
      priorSummary,
    }),
  })

  if (!res.ok) {
    const data = (await res.json().catch(() => ({ error: 'Summary failed' }))) as {
      error?: string
    }
    throw new Error(data.error ?? 'Summary failed')
  }

  const data = (await res.json()) as { summary?: unknown }
  return typeof data.summary === 'string' ? data.summary.trim() : ''
}
