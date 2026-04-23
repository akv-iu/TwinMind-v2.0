export const RATE_LIMITED_COPY = 'Too many requests - wait a minute.'
export const INVALID_GROQ_KEY_COPY = 'Invalid Groq key format.'
export const SUGGEST_FAILURE_COPY = "Couldn't load suggestions. Next auto-refresh in 30s."
export const TRANSCRIBE_FAILURE_COPY =
  'Transcription failed - check your network or Groq status.'

export function normalizeApiErrorCopy(message: string): string | null {
  const normalized = message.trim().toLowerCase()
  if (!normalized) return null

  if (
    normalized.includes('invalid api key format') ||
    normalized.includes('invalid groq key format')
  ) {
    return INVALID_GROQ_KEY_COPY
  }

  if (
    normalized.includes('rate limit') ||
    normalized.includes('too many requests') ||
    normalized.includes('http 429')
  ) {
    return RATE_LIMITED_COPY
  }

  return null
}
