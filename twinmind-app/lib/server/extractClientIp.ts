export function extractClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (forwarded) return forwarded

  const realIp = request.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp

  // Local/dev fallback to avoid exhausting a shared "unknown" bucket.
  const host = request.headers.get('host') ?? 'unknown-host'
  const userAgent = request.headers.get('user-agent') ?? 'unknown-ua'
  return `local-${host}-${userAgent.slice(0, 20)}`
}
