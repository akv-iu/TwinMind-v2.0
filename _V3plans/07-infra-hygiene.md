# Plan 07 — Infra Hygiene

## Summary
Five small, independent fixes that harden operational surface area without changing features:
1. **LRU eviction on the rate-limit `buckets` Map** — currently grows unbounded per Vercel instance.
2. **Explicit middleware matcher** — avoid blocking future public routes by accident.
3. **Dev-IP uniqueness** — avoid burning the rate limit while developing locally.
4. **Error-code-based schema fallback** in `suggest/route.ts` — replace brittle string matching with Groq error codes.
5. **Export enrichment** — include rolling summary, meeting kind, degraded-batch flags, and intent-prompts snapshot in the session JSON.

## Dependencies
- Plans 02 (degraded flag), 04 (meeting kind), 06 (summary-of-summaries) are optional prereqs for export enrichment (Step 5). Export can still ship the fields that exist at the time 07 lands; guard with optional chaining.

## Files touched
1. [twinmind-app/lib/server/rateLimit.ts](twinmind-app/lib/server/rateLimit.ts) — LRU eviction
2. [twinmind-app/middleware.ts](twinmind-app/middleware.ts) — explicit matcher list
3. [twinmind-app/lib/server/extractClientIp.ts](twinmind-app/lib/server/extractClientIp.ts) — **NEW** shared helper with dev-IP uniqueness
4. [twinmind-app/app/api/*/route.ts] (all four routes) — use the shared helper
5. [twinmind-app/app/api/suggest/route.ts](twinmind-app/app/api/suggest/route.ts) — error-code-based fallback
6. [twinmind-app/lib/export.ts](twinmind-app/lib/export.ts) — enrich payload
7. [twinmind-app/lib/types.ts](twinmind-app/lib/types.ts) — update `SessionExport`
8. [twinmind-app/components/transcript/TranscriptColumn.tsx](twinmind-app/components/transcript/TranscriptColumn.tsx) — pass new fields to `exportSession`

## Step 1 — Rate-limit LRU eviction
In `lib/server/rateLimit.ts`, add simple time-based eviction that runs on every check:

```ts
const BUCKET_TTL_MS = 10 * 60_000          // 10 minutes idle
const MAX_BUCKETS = 5_000                  // soft cap before forced prune

let lastPruneAt = 0
const PRUNE_INTERVAL_MS = 30_000           // prune at most every 30s

function pruneIfNeeded(now: number) {
  if (buckets.size < MAX_BUCKETS && now - lastPruneAt < PRUNE_INTERVAL_MS) return
  lastPruneAt = now
  const cutoff = now - BUCKET_TTL_MS
  for (const [key, bucket] of buckets) {
    if (bucket.updatedAt < cutoff) buckets.delete(key)
  }
  // If still over cap (unlikely), evict oldest 10%
  if (buckets.size > MAX_BUCKETS) {
    const entries = [...buckets.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt)
    const evictCount = Math.ceil(MAX_BUCKETS * 0.1)
    for (let i = 0; i < evictCount && i < entries.length; i += 1) {
      buckets.delete(entries[i][0])
    }
  }
}

export function checkRateLimit(ip, route, config) {
  const now = Date.now()
  pruneIfNeeded(now)
  // ... existing logic ...
}
```

### Edge cases
- Time-based pruning can evict a bucket that was close to empty (user had spammed), giving them a fresh quota on next request. Acceptable — 10-minute idle means they've effectively waited out the refill anyway.
- High-QPS instance never idles → prune runs every 30s anyway due to the interval check.
- Prune cost at 5,000 entries: ~5,000 iterations + a small sort in the worst case. O(n log n) worst case once, then O(n) scans every 30s. Negligible.

## Step 2 — Explicit middleware matcher
In `middleware.ts`:
```ts
export const config = {
  matcher: [
    '/api/chat/:path*',
    '/api/suggest/:path*',
    '/api/transcribe/:path*',
    '/api/summarize/:path*',
    '/api/classify-meeting/:path*',   // added by Plan 04
  ],
}
```

### Edge cases
- Adding a future route not in this list means it bypasses the origin check — that's the intended opt-in behavior. Document this in a comment above the matcher.
- Vercel middleware globs: `:path*` matches zero or more segments, including the base route. Verified.

## Step 3 — Shared IP extractor with dev-IP uniqueness
`lib/server/extractClientIp.ts`:
```ts
export function extractClientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (fwd) return fwd
  const real = request.headers.get('x-real-ip')?.trim()
  if (real) return real
  // Dev/local fallback: use a per-host+ua key so different dev tabs/processes get separate buckets.
  // This avoids exhausting the rate limit while testing.
  const host = request.headers.get('host') ?? 'unknown-host'
  const ua = request.headers.get('user-agent') ?? 'unknown-ua'
  return `local-${host}-${ua.slice(0, 20)}`
}
```

Delete the four duplicate `extractClientIp` implementations in the route files and import this one:
```ts
import { extractClientIp } from '@/lib/server/extractClientIp'
```

### Edge cases
- Multiple dev tabs on the same machine share user-agent → same bucket. Acceptable.
- Production behind a correctly-configured proxy always has `x-forwarded-for` → dev fallback never triggers.
- Adversary spoofs `x-forwarded-for`: the middleware origin check prevents most abuse; IP-spoofing for rate-limit bypass is out of scope for a deterrent-grade limiter.

## Step 4 — Error-code-based schema fallback
In `app/api/suggest/route.ts`, replace the bulk of `shouldFallbackToJsonObject` with code-first matching and keep string-matching as a secondary:
```ts
interface GroqErrorLike {
  status?: number
  error?: { code?: string; type?: string; message?: string }
  code?: string
  type?: string
  message?: string
}

function shouldFallbackToJsonObject(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as GroqErrorLike

  // Primary: structured code/type from Groq SDK.
  const code = (e.error?.code ?? e.code ?? '').toString().toLowerCase()
  const type = (e.error?.type ?? e.type ?? '').toString().toLowerCase()
  if (code.includes('json_validate_failed')) return true
  if (type.includes('invalid_request_error') && (e.status === 400)) return true

  // Secondary: string-matching as last resort (kept from prior impl).
  const message = [e.error?.message ?? '', e.message ?? '']
    .join(' ')
    .toLowerCase()
  return (
    message.includes('json_validate_failed') ||
    message.includes('failed to validate json') ||
    message.includes('response_format') ||
    message.includes('json_schema')
  )
}
```

### Edge cases
- Groq changes the code naming in a future release: secondary string match still catches common variants.
- Non-Groq error (local network failure, timeout before response): does NOT match either branch → caller throws → 502 → correct.
- Error is nested differently (`err.response.data.error.code`): add a third access path if we ever observe it in production logs.

## Step 5 — Enrich session export
### 5a — Update `SessionExport` type
In `lib/types.ts` (if that's where `SessionExport` lives; otherwise `lib/export.ts`):
```ts
export interface SessionExport {
  exportedAt: string
  transcript: ExportTranscriptLine[]
  suggestionBatches: SuggestionBatch[]
  chat: ExportChatMessage[]
  // NEW
  summary: string                     // rolling summary at export time
  meetingKind: MeetingKind | null     // optional, nullable if Plan 04 didn't land
  settingsSnapshot: {
    suggestIntentPrompts: SuggestIntentPrompts
    chatPrompt: string
    suggestContextChars: number
    chatContextChars: number
  }
  degradedBatchCount: number
}
```

### 5b — Update `buildSessionExport` and `exportSession` signatures
```ts
export function buildSessionExport(
  transcript: TranscriptLine[],
  batches: SuggestionBatch[],
  chat: ChatMessage[],
  extras: {
    summary: string
    meetingKind: MeetingKind | null
    settingsSnapshot: SessionExport['settingsSnapshot']
  },
): SessionExport {
  return {
    exportedAt: new Date().toISOString(),
    transcript: transcript.map(({ timestamp, text }) => ({ timestamp, text })),
    suggestionBatches: batches,
    chat: chat.map(({ role, suggestionType, text }) =>
      suggestionType == null ? { role, text } : { role, suggestionType, text }
    ),
    summary: extras.summary,
    meetingKind: extras.meetingKind,
    settingsSnapshot: extras.settingsSnapshot,
    degradedBatchCount: batches.filter(b => b.degraded).length,
  }
}

export function exportSession(
  transcript: TranscriptLine[],
  batches: SuggestionBatch[],
  chat: ChatMessage[],
  extras: { summary: string; meetingKind: MeetingKind | null; settingsSnapshot: SessionExport['settingsSnapshot'] },
): boolean {
  // ... existing empty-check ...
  const payload = buildSessionExport(transcript, batches, chat, extras)
  // ... rest unchanged
}
```

### 5c — Pass extras from `TranscriptColumn.tsx`
```ts
const summary = useStore((s) => s.summary)
const meetingKind = useStore((s) => s.meetingKind) // null if Plan 04 hasn't landed; store may not have this field
const suggestIntentPrompts = useStore((s) => s.suggestIntentPrompts)
const chatPrompt = useStore((s) => s.chatPrompt)
const suggestContextChars = useStore((s) => s.suggestContextChars)
const chatContextChars = useStore((s) => s.chatContextChars)

function handleExport() {
  exportSession(transcriptLines, batches, chatMessages, {
    summary,
    meetingKind: meetingKind ?? null,
    settingsSnapshot: {
      suggestIntentPrompts,
      chatPrompt,
      suggestContextChars,
      chatContextChars,
    },
  })
}
```

**Do NOT export `groqApiKey`.** Explicitly exclude it.

### Edge cases
- Plan 04 not yet landed → `meetingKind` field doesn't exist in the store → component selector returns `undefined` → coerce with `?? null`.
- Plan 02 not yet landed → `batch.degraded` is always undefined → `degradedBatchCount` is 0.
- Chat exported with `suggestionType` absent for manual turns — existing code handles. `isFinalized`/`isFailed` flags are irrelevant for export; strip them (via explicit whitelist as already done).
- User exports before recording anything → existing empty guard returns false; no file downloads.

## Acceptance criteria
- [ ] After 1000 test requests with 1000 unique IPs, `buckets.size <= MAX_BUCKETS` (unit test with manual loop).
- [ ] Middleware doesn't apply to a new test route under `/api/ping` (verify: add a trivial `app/api/ping/route.ts` locally → it returns 200 regardless of origin → delete the test route).
- [ ] `extractClientIp` is imported from `lib/server/extractClientIp` in all four (+ classify) routes; no local duplicates remain (`grep -r "function extractClientIp" twinmind-app/app`).
- [ ] Forcing a Groq 400 with `code: 'json_validate_failed'` triggers the fallback path (unit test with mocked error object).
- [ ] Exported JSON contains `summary`, `meetingKind`, `settingsSnapshot`, `degradedBatchCount`. Does NOT contain `groqApiKey`.
- [ ] `grep "groqApiKey" twinmind-app/lib/export.ts` returns zero matches.

## Time estimate
**2.5 hours.**
- LRU eviction + unit test: 45min
- Middleware matcher + verification: 10min
- Shared IP extractor + dedupe: 20min
- Error-code schema fallback: 30min
- Export enrichment (type + functions + component): 45min

## Risk
Very low. Each change is isolated and has a clear test. Main risk is the LRU eviction racing against concurrent requests on a hot instance — the Map operations are synchronous and single-threaded in Node, so no race exists.
