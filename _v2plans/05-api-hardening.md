# Plan 05 — API Hardening: Origin + Rate Limit + Timeouts + Log Hygiene

## Summary
Prevent strangers from burning your Vercel-billed Groq quota. Ensure every Groq call has a hard timeout. Remove all PII from server logs. Keep it pragmatic — in-memory rate limiting, not a production-grade distributed store.

## Dependencies
- **None.** Can run in parallel with Plans 02, 03, 04, 06.
- **Must land before Plan 07** (deploy).

## Files touched
1. [twinmind-app/middleware.ts](twinmind-app/middleware.ts) — **NEW** (Next.js edge middleware)
2. [twinmind-app/lib/server/rateLimit.ts](twinmind-app/lib/server/rateLimit.ts) — **NEW**
3. [twinmind-app/lib/server/origin.ts](twinmind-app/lib/server/origin.ts) — **NEW** (helper used by middleware)
4. [twinmind-app/lib/server/withTimeout.ts](twinmind-app/lib/server/withTimeout.ts) — **NEW** (timeout wrapper for Groq calls)
5. [twinmind-app/app/api/chat/route.ts](twinmind-app/app/api/chat/route.ts)
6. [twinmind-app/app/api/suggest/route.ts](twinmind-app/app/api/suggest/route.ts)
7. [twinmind-app/app/api/transcribe/route.ts](twinmind-app/app/api/transcribe/route.ts)
8. [twinmind-app/app/api/summarize/route.ts](twinmind-app/app/api/summarize/route.ts) (if Plan 03 landed)

## Step 1 — Origin check middleware
`twinmind-app/middleware.ts`:
```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ALLOWED = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',').map(s => s.trim()).filter(Boolean)

function originAllowed(origin: string | null): boolean {
  if (!origin) return false
  if (ALLOWED.length === 0) return origin.startsWith('http://localhost:')  // dev default
  return ALLOWED.includes(origin)
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get('origin')
  if (!originAllowed(origin)) {
    return NextResponse.json({ error: 'forbidden origin' }, { status: 403 })
  }
  return NextResponse.next()
}

export const config = { matcher: '/api/:path*' }
```
Env var to set in Vercel: `ALLOWED_ORIGINS=https://<prod-domain>,https://<preview-domain>`.
Dev works with no env var (localhost allowed by default).

## Step 2 — Per-IP rate limit (in-memory token bucket)
`lib/server/rateLimit.ts`:
```ts
type Bucket = { tokens: number; updatedAt: number }
const buckets = new Map<string, Bucket>()

export interface RateLimitConfig {
  capacity: number       // max tokens
  refillPerSec: number   // tokens added per second
}

export function checkRateLimit(
  ip: string,
  route: string,
  config: RateLimitConfig,
): { allowed: boolean; retryAfterSec: number } {
  const key = `${route}:${ip}`
  const now = Date.now()
  const b = buckets.get(key) ?? { tokens: config.capacity, updatedAt: now }
  const elapsedSec = (now - b.updatedAt) / 1000
  b.tokens = Math.min(config.capacity, b.tokens + elapsedSec * config.refillPerSec)
  b.updatedAt = now
  if (b.tokens < 1) {
    buckets.set(key, b)
    const retry = Math.ceil((1 - b.tokens) / config.refillPerSec)
    return { allowed: false, retryAfterSec: retry }
  }
  b.tokens -= 1
  buckets.set(key, b)
  return { allowed: true, retryAfterSec: 0 }
}

export const LIMITS = {
  transcribe: { capacity: 60, refillPerSec: 60 / 60 },   // 60/min
  suggest:    { capacity: 10, refillPerSec: 10 / 60 },   // 10/min
  chat:       { capacity: 30, refillPerSec: 30 / 60 },   // 30/min
  summarize:  { capacity:  5, refillPerSec:  5 / 60 },   // 5/min
}
```

In each route handler, near the top:
```ts
import { checkRateLimit, LIMITS } from '@/lib/server/rateLimit'

const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
const rl = checkRateLimit(ip, 'suggest', LIMITS.suggest)
if (!rl.allowed) {
  return NextResponse.json(
    { error: 'rate limit' },
    { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
  )
}
```

**Documented tradeoff:** in-memory per-instance = on Vercel with multiple lambdas, a single bad actor can multiplex across instances. This is a *deterrent*, not a fortress. Add a comment at the top of `rateLimit.ts` stating this.

## Step 3 — Groq request timeouts
`lib/server/withTimeout.ts`:
```ts
export async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
  )
  return Promise.race([p, timeout])
}
```

Wire into routes:
- `/api/transcribe`: 25s — `withTimeout(groq.audio.transcriptions.create(...), 25000, 'transcribe')`
- `/api/suggest`: 12s
- `/api/chat`: 12s on the initial create call only; streaming iteration is untouched
- `/api/summarize`: 15s

Map timeout errors to HTTP 504 `{error: 'upstream timeout'}`.

## Step 4 — Remove all transcript/prompt/key logging
Sweep every route and client file:
- `app/api/suggest/route.ts`: delete `hasLoggedSuggestPayload` + `console.log('[api/suggest] incoming payload ...')` (covered by Plan 03, re-verify here).
- `app/api/chat/route.ts`: no `console.log` of `systemContent`, `messages`, or `apiKey`.
- `app/api/transcribe/route.ts`: no logging of audio bytes or key.
- Replace with structured metric lines **after** the operation:
  ```ts
  console.log(JSON.stringify({
    route: 'suggest',
    status: 'ok',       // or 'error' / 'timeout' / 'rate_limited'
    latencyMs: Date.now() - start,
    charsIn: transcript.length,
    cardsOut: cards.length,
  }))
  ```
- `maskApiKey` helper can stay as a utility, but is no longer called anywhere (key is never logged).

## Step 5 — Server-side API key sanity check
In each route that receives `apiKey`:
```ts
const trimmed = apiKey?.trim() ?? ''
if (!trimmed.startsWith('gsk_') || trimmed.length < 20) {
  return NextResponse.json({ error: 'invalid api key format' }, { status: 400 })
}
```
Saves a round trip to Groq on obviously malformed keys.

## Step 6 — Vercel env var setup
In the Vercel dashboard (Settings → Environment Variables):
- `ALLOWED_ORIGINS` = `https://<your-prod-domain>` (+ preview if applicable), set for Production and Preview environments.
- Nothing else — no Groq key, no secrets. Users paste their own key.

## Acceptance criteria
- [ ] `curl -X POST -H "Origin: https://evil.example" https://<prod>/api/chat` → 403.
- [ ] `curl` to `/api/suggest` 11 times from same IP in 60s → 11th returns 429 with `Retry-After` header.
- [ ] Mock Groq 20s hang → route returns 504 within 12s (for suggest/chat) or 25s (transcribe).
- [ ] `grep -rE "(transcript|systemContent|messages|prompt|apiKey):" twinmind-app/app/api --include='*.ts'` shows no `console.log` of those fields.
- [ ] Metric logs in Vercel logs are single-line JSON with only counts and status.
- [ ] Sending `apiKey: "hello"` to any route returns 400 before hitting Groq.

## Time estimate
**3 hours**:
- Middleware + origin helper: 45min
- Rate limit module + wire-in 3 routes: 1h
- Timeout wrapper + wire-in: 30min
- Log sweep + metric replacements: 30min
- Key format check: 15min

## Risk
Low. The main risk is accidentally blocking legitimate Vercel preview URLs — mitigated by setting `ALLOWED_ORIGINS` to include all preview domains, or allowing the `*.vercel.app` suffix by convention. Document this in the deployment step.
