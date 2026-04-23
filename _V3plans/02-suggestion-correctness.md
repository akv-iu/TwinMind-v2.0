# Plan 02 — Suggestion Correctness & UX

## Summary
Five correctness/UX fixes to the suggestion pipeline:
1. **Enforce type variety** in `normalizeCards` — the prompt rule "at least 2 distinct types" is currently unenforced. Model can return 3 of the same type and it passes.
2. **Fix frozen countdown during long calls** — the 1-sec interval skips ticks entirely while `isLoadingRef.current` is true. User sees "auto-refresh in 1s" stuck for 10s.
3. **Add AbortController** to the suggest fetch — stop-mic-then-late-response currently still calls `addBatch` with stale data.
4. **Input-hash skip** — don't fire if the recent transcript is byte-identical to the last fire.
5. **Surface `degraded: true`** in the UI — server sets it, UI ignores it.

## Dependencies
**None.** Independent of all other plans.

## Files touched
1. [twinmind-app/app/api/suggest/route.ts](twinmind-app/app/api/suggest/route.ts) — variety enforcement in `normalizeCards`
2. [twinmind-app/components/suggestions/SuggestionsColumn.tsx](twinmind-app/components/suggestions/SuggestionsColumn.tsx) — countdown-from-deadline, AbortController, input-hash, degraded badge
3. [twinmind-app/components/suggestions/SuggestionBatch.tsx](twinmind-app/components/suggestions/SuggestionBatch.tsx) — render degraded flag
4. [twinmind-app/lib/types.ts](twinmind-app/lib/types.ts) — add `degraded?: boolean` to `SuggestionBatch`
5. [twinmind-app/store/suggestionsSlice.ts](twinmind-app/store/suggestionsSlice.ts) — accept `degraded` in `addBatch` payload
6. [twinmind-app/tests/live-suggestions-engine.test.ts](twinmind-app/tests/live-suggestions-engine.test.ts) — new cases

## Step 1 — Enforce variety in `normalizeCards`
Current `normalizeCards` returns 0–3 cards that pass schema + length filters. Add a post-validation pass:

```ts
export function normalizeCards(input: unknown): SuggestionCard[] {
  // ... existing validation loop, produces `normalized: SuggestionCard[]`

  // Variety enforcement: if 3 cards but all same type, drop the duplicates to 1 + keep order.
  if (normalized.length === 3) {
    const types = normalized.map(c => c.type)
    const uniqueTypes = new Set(types)
    if (uniqueTypes.size === 1) {
      // All three identical type — return only the first to signal "diversity failure"
      return [normalized[0]]
    }
  }
  return normalized
}
```

**Rationale:** returning 1 card on all-same-type triggers the retry-once path on the server (which currently only retries on 0 cards). Extend the server retry condition:

```ts
// In the for-loop in POST handler:
cards = normalizeCards(parsed)
if (cards.length >= 2 || attempt === 1) break   // was: cards.length > 0
```

Second-pass nudge stays. If second pass still returns 1 card, accept it (better than nothing), but mark `degraded: true`:
```ts
if (cards.length < 3) degraded = true
```

### Edge cases
- Model returns 3 cards but only 2 distinct types → ALLOWED. Only 3-of-same triggers fallback.
- Model returns 2 cards with 2 distinct types → ALLOWED.
- Retry returns 0 cards on a genuinely-empty transcript → response is `{cards: []}`, no-op UI path handles it.

## Step 2 — Countdown from deadline timestamp
Currently [SuggestionsColumn.tsx:174-187](twinmind-app/components/suggestions/SuggestionsColumn.tsx#L174-L187) decrements state, skipping during inflight. Replace with target-based:

```ts
const deadlineRef = useRef<number>(Date.now() + COUNTDOWN_SECONDS * 1000)

useEffect(() => {
  if (!isRecording) return
  deadlineRef.current = Date.now() + COUNTDOWN_SECONDS * 1000
  setCountdown(COUNTDOWN_SECONDS)

  const id = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000))
    setCountdown(remaining)
    if (remaining === 0 && !isLoadingRef.current) {
      deadlineRef.current = Date.now() + COUNTDOWN_SECONDS * 1000
      void fireSuggestions()
    }
  }, 250)   // 4 Hz — smooth label, cheap
  return () => clearInterval(id)
}, [fireSuggestions, isRecording])
```
Countdown label now always reflects real time. When a long call is in flight, change the label in JSX:
```tsx
<span className="text-xs text-zinc-500">
  {!isRecording
    ? 'auto-refresh paused (mic off)'
    : isLoading
      ? 'generating suggestions...'
      : `auto-refresh in ${countdown}s`}
</span>
```

### Edge cases
- Reload click during a fire → the `handleReload` guard already skips during `isLoading`. Also reset `deadlineRef` to `Date.now() + COUNTDOWN_SECONDS * 1000`.
- Mic stops mid-call → inflight call continues but next fire won't happen (interval is torn down by effect deps).
- Tab hidden → setInterval throttles in background; when user returns, `remaining` may be negative → `Math.max(0, ...)` handles it and next tick fires.

## Step 3 — AbortController on suggest fetch
```ts
const abortRef = useRef<AbortController | null>(null)

const fireSuggestions = useCallback(async () => {
  // ... key + transcript checks

  abortRef.current?.abort()
  const controller = new AbortController()
  abortRef.current = controller

  // ... existing logic, but pass signal:
  const res = await fetch('/api/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
  // ... rest unchanged
}, [ ... ])

// Abort on mic stop:
useEffect(() => {
  if (!isRecording) abortRef.current?.abort()
}, [isRecording])

// Abort on unmount:
useEffect(() => () => abortRef.current?.abort(), [])
```

In the catch block, handle AbortError quietly:
```ts
catch (err) {
  if ((err as { name?: string }).name === 'AbortError') return
  // ... existing error handling
}
```

## Step 4 — Input-hash skip
Prevent firing against unchanged content:
```ts
const lastFireHashRef = useRef<string>('')

const fireSuggestions = useCallback(async () => {
  if (isLoadingRef.current) return
  const key = apiKey.trim()
  if (!key) return

  const recentTranscript = takeTailByChars(transcriptLines, suggestContextChars)
  if (!recentTranscript.trim()) return

  // Cheap hash: last 64 chars + length. Not crypto, just change-detection.
  const hashInput = `${recentTranscript.length}:${recentTranscript.slice(-64)}`
  if (hashInput === lastFireHashRef.current) {
    return   // nothing new — skip this cycle
  }

  // ... existing fire logic ...

  // On success (after addBatch):
  lastFireHashRef.current = hashInput
}, [ ... ])
```

`handleReload` should force-reset the hash to bypass the skip:
```ts
function handleReload() {
  if (isLoading || !apiKey.trim()) return
  deadlineRef.current = Date.now() + COUNTDOWN_SECONDS * 1000
  lastFireHashRef.current = ''   // force fire even on unchanged content
  void fireSuggestions()
}
```

### Edge cases
- Summary refresh should also be skipped when transcript unchanged — already handled because `shouldRefreshSummary` runs only after a successful `addBatch`.
- Hash collision on identical-length identical-suffix: benign; worst case is one skipped fire.

## Step 5 — Surface `degraded` flag
1. Extend `SuggestionBatch` type:
```ts
export interface SuggestionBatch {
  batchNumber: number
  timestamp: string
  cards: SuggestionCard[]
  degraded?: boolean   // NEW
}
```

2. Accept in slice:
```ts
addBatch: ({ timestamp, cards, degraded }) =>
  set((s) => {
    const batchNumber = s.batches.length + 1
    const newBatch: SuggestionBatch = { batchNumber, timestamp, cards, degraded }
    return { batches: [newBatch, ...s.batches] }
  }),
```

3. Pass from `SuggestionsColumn.tsx`:
```ts
addBatch({ timestamp: timestampNow(), cards, degraded: data.degraded })
```

4. Render in `SuggestionBatch.tsx`:
```tsx
<p className="mb-1 mt-3 text-center text-xs text-zinc-500">
  {'—'} BATCH {batch.batchNumber} {'·'} {batch.timestamp}
  {batch.degraded ? ' · schema-fallback' : ''}
  {' —'}
</p>
```
Subtle; doesn't shout.

## Acceptance criteria
- [ ] `normalizeCards([{type:'ANSWER',preview:'x1'},{type:'ANSWER',preview:'x2'},{type:'ANSWER',preview:'x3'}])` returns length 1 (unit test).
- [ ] Force a 10s suggest-fire (throttle `/api/suggest` in DevTools): countdown label shows `generating suggestions...` the whole time; returns to `auto-refresh in 30s` after.
- [ ] Start recording, fire once, stop mic before response arrives: no batch is added.
- [ ] Transcript unchanged across two auto-refresh cycles: second cycle skipped (verify via Network tab — no second `POST /api/suggest`).
- [ ] Force the schema fallback path (e.g. in dev, throw a known error in `shouldFallbackToJsonObject` to always fallback): the batch footer shows `· schema-fallback`.
- [ ] Manual reload after a skipped cycle does fire.

## Time estimate
**3 hours.**
- Variety enforcement + server retry: 45min
- Countdown rewrite + label: 45min
- AbortController wiring + edge cases: 30min
- Input-hash gate + reload bypass: 20min
- `degraded` surfacing: 30min
- Tests + manual session: 30min

## Risk
Low. Main risk: the variety check drops to 1 card when the model really meant 3 similar-but-useful cards (e.g. 3 FACT_CHECKs on a dense fact-heavy meeting). Mitigation: the server retries once with the nudge prompt before accepting the drop. If still monotype, the single card is still better than 3 duplicates.
