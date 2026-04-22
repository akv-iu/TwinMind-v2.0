const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

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

