// In-memory, per-instance limiter. On serverless multi-instance deployments,
// this is a deterrent, not a global hard guarantee.
type Bucket = {
  tokens: number
  updatedAt: number
}

const buckets = new Map<string, Bucket>()

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
} satisfies Record<string, RateLimitConfig>

