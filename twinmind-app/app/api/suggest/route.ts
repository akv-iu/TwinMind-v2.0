import { NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import type { CardType, SuggestionCard } from '@/lib/types'
import { checkRateLimit, LIMITS } from '@/lib/server/rateLimit'
import { extractClientIp } from '@/lib/server/extractClientIp'
import { isUpstreamTimeoutError, withTimeout } from '@/lib/server/withTimeout'

export const runtime = 'nodejs'

const VALID_TYPES: ReadonlySet<CardType> = new Set([
  'QUESTION_TO_ASK',
  'TALKING_POINT',
  'ANSWER',
  'FACT_CHECK',
])

const DEFAULT_SUGGEST_MAX_TOKENS = 560
const configuredSuggestMaxTokens = Number(
  process.env.SUGGEST_MAX_TOKENS ?? DEFAULT_SUGGEST_MAX_TOKENS,
)
const SUGGEST_MAX_TOKENS = Number.isFinite(configuredSuggestMaxTokens)
  ? Math.min(Math.max(Math.floor(configuredSuggestMaxTokens), 240), 900)
  : DEFAULT_SUGGEST_MAX_TOKENS

const RETRY_NUDGE_PROMPT =
  'Your previous response was not valid enough. Return ONLY a JSON object with key "cards". Each card must have: type (QUESTION_TO_ASK|TALKING_POINT|ANSWER|FACT_CHECK) and preview (10-180 chars). Produce exactly 3 cards unless there is no substance, then return {"cards":[]}.'

function stripJsonFences(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  }
  return trimmed
}

function extractFirstJsonObject(raw: string): string {
  const start = raw.indexOf('{')
  if (start === -1) return raw
  const end = raw.lastIndexOf('}')
  if (end === -1 || end < start) return raw
  return raw.slice(start, end + 1)
}

function fitPreview(value: string): string {
  const trimmed = value.replace(/\s+/g, ' ').trim()
  if (trimmed.length === 0) {
    return 'Clarify the most recent point before deciding next steps.'
  }
  if (trimmed.length >= 10 && trimmed.length <= 180) return trimmed
  if (trimmed.length < 10) return `${trimmed}. Please clarify this point.`.slice(0, 180)
  return `${trimmed.slice(0, 177)}...`
}

function parseCardsFromPlainText(raw: string): SuggestionCard[] {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const cards: SuggestionCard[] = []
  for (const line of lines) {
    if (cards.length >= 3) break
    const cleaned = line.replace(/^[\-\*\d\.\)\s]+/, '')
    const match = cleaned.match(
      /^(QUESTION_TO_ASK|TALKING_POINT|ANSWER|FACT_CHECK)\s*[\|\:\-]\s*(.+)$/i,
    )
    let type: CardType
    let preview: string

    if (match) {
      type = match[1].toUpperCase() as CardType
      preview = fitPreview(match[2] ?? '')
      if (!VALID_TYPES.has(type)) continue
    } else {
      preview = fitPreview(cleaned)
      const lower = cleaned.toLowerCase()
      if (cleaned.endsWith('?')) type = 'QUESTION_TO_ASK'
      else if (
        lower.includes('verify') ||
        lower.includes('double-check') ||
        lower.includes('fact check') ||
        lower.includes('check if')
      ) {
        type = 'FACT_CHECK'
      } else if (
        lower.startsWith('answer') ||
        lower.includes('the answer is') ||
        lower.includes('respond with')
      ) {
        type = 'ANSWER'
      } else {
        type = 'TALKING_POINT'
      }
    }

    cards.push({ type, preview })
  }

  return cards
}

function coerceCardsFromModelContent(content: string): SuggestionCard[] {
  const stripped = stripJsonFences(content)
  try {
    return normalizeCards(JSON.parse(stripped))
  } catch {
    // fall through
  }

  try {
    return normalizeCards(JSON.parse(extractFirstJsonObject(stripped)))
  } catch {
    // fall through
  }

  return parseCardsFromPlainText(stripped)
}

function safeSerializeError(error: unknown): string {
  try {
    return JSON.stringify(error)
  } catch {
    return ''
  }
}

interface GroqErrorLike {
  status?: number
  response?: {
    status?: number
    error?: { code?: string; type?: string; message?: string }
    data?: {
      error?: { code?: string; type?: string; message?: string }
    }
  }
  cause?: {
    message?: string
  }
  error?: { code?: string; type?: string; message?: string }
  code?: string
  type?: string
  message?: string
}

function shouldFallbackToJsonObject(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const rec = error as GroqErrorLike

  // Primary: structured fields from SDK error payload.
  const code = (
    rec.error?.code ??
    rec.code ??
    rec.response?.error?.code ??
    rec.response?.data?.error?.code ??
    ''
  ).toLowerCase()
  const type = (
    rec.error?.type ??
    rec.type ??
    rec.response?.error?.type ??
    rec.response?.data?.error?.type ??
    ''
  ).toLowerCase()
  const status = rec.status ?? rec.response?.status
  if (code.includes('json_validate_failed')) return true
  if (code.includes('failed_generation')) return true
  if (type.includes('invalid_request_error') && status === 400) return true

  // Secondary: message matching fallback for shape variance.
  const message = [
    rec.error?.message ?? '',
    rec.response?.error?.message ?? '',
    rec.response?.data?.error?.message ?? '',
    rec.cause?.message ?? '',
    rec.message ?? '',
    error instanceof Error ? error.message : '',
  ]
    .join(' ')
    .toLowerCase()
  const serialized = safeSerializeError(error).toLowerCase()
  return (
    message.includes('json_validate_failed') ||
    message.includes('failed_generation') ||
    message.includes('failed to validate json') ||
    message.includes('failed to generate json') ||
    message.includes('response_format') ||
    message.includes('json_schema') ||
    message.includes('strict') ||
    serialized.includes('json_validate_failed') ||
    serialized.includes('failed_generation')
  )
}

function isValidApiKeyFormat(value: string): boolean {
  return value.startsWith('gsk_') && value.length >= 20
}

export function normalizeCards(input: unknown): SuggestionCard[] {
  let arr: unknown[] = []
  if (Array.isArray(input)) {
    arr = input
  } else if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>
    if (Array.isArray(obj.cards)) arr = obj.cards
    else if (Array.isArray(obj.suggestions)) arr = obj.suggestions
  }

  const normalized: SuggestionCard[] = []
  for (const item of arr) {
    if (normalized.length >= 3) break
    if (!item || typeof item !== 'object') continue

    const rec = item as Record<string, unknown>
    const type = rec.type
    const preview = rec.preview ?? rec.text ?? rec.content
    if (typeof type !== 'string' || typeof preview !== 'string') continue

    const typed = type as CardType
    if (!VALID_TYPES.has(typed)) continue

    const trimmedPreview = preview.trim()
    if (trimmedPreview.length < 10 || trimmedPreview.length > 180) continue
    normalized.push({ type: typed, preview: trimmedPreview })
  }

  return normalized
}

interface CompletionResult {
  content: string
  usedJsonFallback: boolean
}

async function createSuggestCompletion(
  groq: Groq,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
): Promise<CompletionResult> {
  const baseRequest = {
    model: 'openai/gpt-oss-120b',
    messages,
    temperature: 0.4,
    top_p: 0.9,
    max_tokens: SUGGEST_MAX_TOKENS,
  }

  try {
    const completion = await groq.chat.completions.create(
      {
        ...baseRequest,
      },
    )

    return {
      content: completion.choices[0]?.message?.content ?? '{}',
      usedJsonFallback: false,
    }
  } catch (err) {
    if (!shouldFallbackToJsonObject(err)) {
      throw err
    }
    return {
      // Keep the pipeline alive on JSON-shape failures.
      content: '{"cards":[]}',
      usedJsonFallback: true,
    }
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now()
  let body: { transcript?: string; prompt?: string; apiKey?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const transcript = body.transcript?.trim() ?? ''
  const prompt = body.prompt?.trim() ?? ''
  const apiKey = body.apiKey?.trim() ?? ''
  const ip = extractClientIp(request)

  if (!apiKey) {
    return NextResponse.json({ error: 'No API key provided' }, { status: 400 })
  }
  if (!isValidApiKeyFormat(apiKey)) {
    return NextResponse.json({ error: 'Invalid Groq key format.' }, { status: 400 })
  }
  if (!transcript) {
    return NextResponse.json({ error: 'No transcript provided' }, { status: 400 })
  }

  const rate = checkRateLimit(ip, 'suggest', LIMITS.suggest)
  if (!rate.allowed) {
    console.log(
      JSON.stringify({
        route: 'suggest',
        status: 'rate_limited',
        latencyMs: Date.now() - startedAt,
        charsIn: transcript.length,
        cardsOut: 0,
      }),
    )
    return NextResponse.json(
      { error: 'Too many requests - wait a minute.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    )
  }

  try {
    const groq = new Groq({ apiKey })
    let cards: SuggestionCard[] = []
    let usedJsonFallback = false
    let attemptsUsed = 0

    for (let attempt = 0; attempt < 2; attempt += 1) {
      attemptsUsed = attempt + 1
      const messages: Array<{ role: 'system' | 'user'; content: string }> = [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content:
            'Generate the suggestion batch now. Return ONLY a JSON object with key "cards". Each card must include type and preview. No markdown and no extra keys.',
        },
      ]
      if (attempt === 1) {
        messages.push({ role: 'system', content: RETRY_NUDGE_PROMPT })
      }

      const completion = await withTimeout(
        createSuggestCompletion(groq, messages),
        12_000,
        'suggest',
      )
      usedJsonFallback = usedJsonFallback || completion.usedJsonFallback

      cards = coerceCardsFromModelContent(completion.content)
      if (cards.length >= 2 || attempt === 1) break
    }

    console.log(
      JSON.stringify({
        route: 'suggest',
        latencyMs: Date.now() - startedAt,
        charsIn: transcript.length,
        cardsOut: cards.length,
        partialCards: cards.length < 3,
        usedJsonFallback,
        attemptsUsed,
        suggestMaxTokens: SUGGEST_MAX_TOKENS,
        status: 'ok',
      }),
    )

    return NextResponse.json(
      usedJsonFallback ? { cards, degraded: true } : { cards },
    )
  } catch (err) {
    if (isUpstreamTimeoutError(err)) {
      console.log(
        JSON.stringify({
          route: 'suggest',
          status: 'timeout',
          latencyMs: Date.now() - startedAt,
          charsIn: transcript.length,
          cardsOut: 0,
        }),
      )
      return NextResponse.json({ error: 'upstream timeout' }, { status: 504 })
    }
    if (shouldFallbackToJsonObject(err)) {
      console.log(
        JSON.stringify({
          route: 'suggest',
          status: 'json_degraded_empty',
          latencyMs: Date.now() - startedAt,
          charsIn: transcript.length,
          cardsOut: 0,
          suggestMaxTokens: SUGGEST_MAX_TOKENS,
        }),
      )
      return NextResponse.json({ cards: [], degraded: true })
    }

    console.log(
      JSON.stringify({
        route: 'suggest',
        status: 'error',
        latencyMs: Date.now() - startedAt,
        charsIn: transcript.length,
        cardsOut: 0,
      }),
    )
    const message = err instanceof Error ? err.message : 'Suggestion failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
