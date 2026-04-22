# Plan 02 — Audio Retry: Bulletproof `sendChunk`

## Summary
Close the real "lost chunk" failure mode with retry + backoff. No architectural change. No queue cap. No gap markers. No track listeners. No dual-recorder. Just retry. This is the 1-hour insurance policy — nothing more.

## Dependencies
**None.** Fully isolated to one file. Can run in parallel with any other plan.

## Files touched
1. [twinmind-app/lib/hooks/useAudioRecorder.ts](twinmind-app/lib/hooks/useAudioRecorder.ts) — `sendChunk` only
2. [twinmind-app/tests/audio-pipeline.test.ts](twinmind-app/tests/audio-pipeline.test.ts) — add retry behavior cases

## Behavior spec
- **Attempts:** 1 initial + up to 3 retries = 4 total attempts.
- **Delays between attempts:** `250ms → 1000ms → 3000ms`.
- **Retry on:** network error (fetch throws), HTTP 5xx, HTTP 429.
- **Fail fast (no retry) on:** HTTP 4xx except 429 (auth error, malformed input, bad key).
- **Final failure:** `setError('Transcription failed after retries')`, chunk is lost silently (same outcome as today). No transcript placeholder.
- **Serialization:** the existing upload queue stays. A single chunk that retries blocks the queue until it drains. Acceptable for now.

## Pseudocode
```ts
// Inside useAudioRecorder.ts
async function transcribeWithRetry(form: FormData): Promise<string> {
  const delays = [250, 1000, 3000] // 3 retries after the initial attempt
  let lastErr: Error = new Error('Transcription failed')
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const res = await fetch('/api/transcribe', { method: 'POST', body: form })
      if (res.ok) {
        const { text } = await res.json()
        return text ?? ''
      }
      // 4xx non-429 = fail fast
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      // 5xx or 429 — retry
      lastErr = new Error(`HTTP ${res.status}`)
    } catch (e) {
      const err = e as Error
      // If this came from the fail-fast branch above, rethrow
      if (/HTTP 4\d\d/.test(err.message) && !/HTTP 429/.test(err.message)) throw err
      lastErr = err
    }
    if (attempt < delays.length) {
      await new Promise(r => setTimeout(r, delays[attempt]))
    }
  }
  throw lastErr
}

// Existing sendChunk — swap the fetch block for transcribeWithRetry(form):
async function sendChunk(assembled: Blob) {
  // ... existing key check + form build ...
  inFlightCountRef.current += 1
  setIsProcessing(true)
  setTranscribing(true)
  try {
    const text = await transcribeWithRetry(form)
    const cleaned = deduplicateTail(lastTranscriptTailRef.current, text)
    if (cleaned.trim()) {
      addTranscriptLine({ timestamp: timestampNow(), text: cleaned })
      lastTranscriptTailRef.current = lastWords(cleaned, TAIL_WORD_COUNT)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transcription failed'
    setError(message)
  } finally {
    inFlightCountRef.current -= 1
    if (inFlightCountRef.current <= 0) {
      inFlightCountRef.current = 0
      setIsProcessing(false)
      setTranscribing(false)
    }
  }
}
```

## Acceptance criteria
- [ ] Mock fetch returning `503` three times, then `200`: chunk eventually succeeds, transcript line appended.
- [ ] Mock fetch returning `401`: no retries, error surfaces immediately.
- [ ] Mock fetch rejecting (network error) 4x: 4 attempts, then error surfaces.
- [ ] Mock fetch returning `429` with `200` on retry: succeeds.
- [ ] Existing happy-path `audio-pipeline.test.ts` cases still pass.
- [ ] No change in UI behavior for the successful case.

## Time estimate
**1 hour** (code ~30min, tests ~30min).

## Non-goals — intentionally deferred
- Queue cap / drop-oldest policy.
- `[audio gap ~6s]` transcript placeholder on permanent failure.
- `track.onmute` / `track.onended` listeners for mid-stream device changes.
- Dual-recorder crossfade.
- AudioWorklet-based capture.

If Day 3 ends with >2 spare hours, revisit the gap marker only. Everything else stays deferred.

## Risk
Very low — the change is additive and isolated. Worst case: a retried chunk arrives out-of-order; the serial queue guarantees order, so this cannot happen.
