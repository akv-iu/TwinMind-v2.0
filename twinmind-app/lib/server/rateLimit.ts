// In-memory, per-instance limiter. On serverless multi-instance deployments,
// this is a deterrent, not a global hard guarantee.
type Bucket = {
  tokens: number
  updatedAt: number
}

const buckets = new Map<string, Bucket>()
const BUCKET_TTL_MS = 10 * 60_000
const MAX_BUCKETS = 5_000
const PRUNE_INTERVAL_MS = 30_000
let lastPruneAt = 0

function pruneIfNeeded(now: number): void {
  if (buckets.size < MAX_BUCKETS && now - lastPruneAt < PRUNE_INTERVAL_MS) {
    return
  }

  lastPruneAt = now
  const cutoff = now - BUCKET_TTL_MS

  for (const [key, bucket] of buckets) {
    if (bucket.updatedAt < cutoff) {
      buckets.delete(key)
    }
  }

  if (buckets.size > MAX_BUCKETS) {
    const entries = [...buckets.entries()].sort(
      (a, b) => a[1].updatedAt - b[1].updatedAt,
    )
    const evictCount = Math.ceil(MAX_BUCKETS * 0.1)
    for (let i = 0; i < evictCount && i < entries.length; i += 1) {
      buckets.delete(entries[i][0])
    }
  }
}

export interface RateLimitConfig {
  capacity: number
  refillPerSec: number
}

export function checkRateLimit(
  ip: string,
  route: string,
  config: RateLimitConfig,
): { allowed: boolean; retryAfterSec: number } {
  const key = `${route}:${ip}`
  const now = Date.now()
  pruneIfNeeded(now)
  const bucket = buckets.get(key) ?? { tokens: config.capacity, updatedAt: now }

  const elapsedSec = (now - bucket.updatedAt) / 1000
  bucket.tokens = Math.min(
    config.capacity,
    bucket.tokens + elapsedSec * config.refillPerSec,
  )
  bucket.updatedAt = now

  if (bucket.tokens < 1) {
    buckets.set(key, bucket)
    const retryAfterSec = Math.ceil((1 - bucket.tokens) / config.refillPerSec)
    return { allowed: false, retryAfterSec }
  }

  bucket.tokens -= 1
  buckets.set(key, bucket)
  return { allowed: true, retryAfterSec: 0 }
}

export const LIMITS = {
  transcribe: { capacity: 60, refillPerSec: 60 / 60 },
  suggest: { capacity: 10, refillPerSec: 10 / 60 },
  chat: { capacity: 30, refillPerSec: 30 / 60 },
  summarize: { capacity: 5, refillPerSec: 5 / 60 },
  classify: { capacity: 3, refillPerSec: 3 / 60 },
} satisfies Record<string, RateLimitConfig>
