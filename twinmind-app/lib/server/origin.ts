function buildAllowedOrigins(): string[] {
  const explicit = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  // Vercel injects these automatically — no manual env var needed for standard deployments
  const auto: string[] = []
  if (process.env.VERCEL_URL) auto.push(`https://${process.env.VERCEL_URL}`)
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    auto.push(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)

  return [...new Set([...explicit, ...auto])]
}

const allowedOrigins = buildAllowedOrigins()

export function originAllowed(origin: string | null): boolean {
  if (!origin) return false

  if (allowedOrigins.length === 0) {
    return (
      origin.startsWith('http://localhost:') ||
      origin.startsWith('https://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      origin.startsWith('https://127.0.0.1:')
    )
  }

  return allowedOrigins.includes(origin)
}

