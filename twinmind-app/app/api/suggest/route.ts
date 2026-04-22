import { NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import type { CardType, SuggestionCard } from '@/lib/types'
import { checkRateLimit, LIMITS } from '@/lib/server/rateLimit'
import { isUpstreamTimeoutError, withTimeout } from '@/lib/server/withTimeout'

export const runtime = 'nodejs'

const VALID_TYPES: ReadonlySet<CardType> = new Set([
  'QUESTION_TO_ASK',
  'TALKING_POINT',
  'ANSWER',
  'FACT_CHECK',
])

const SUGGEST_RESPONSE_SCHEMA = {
  name: 'suggestion_batch',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      cards: {
        type: 'array',
        minItems: 0,
        maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: {
              enum: ['QUESTION_TO_ASK', 'TALKING_POINT', 'ANSWER', 'FACT_CHECK'],
            },
            preview: {
              type: 'string',
              minLength: 10,
              maxLength: 180,
            },
          },
          required: ['type', 'preview'],
        },
      },
    },
    required: ['cards'],
  },
} as const

const RETRY_NUDGE_PROMPT =
  'Your previous response had no valid cards. Produce exactly 3 grounded suggestions now, or return {"cards": []} if the transcript has no substantive content.'

function stripJsonFences(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  }
  return trimmed
}

function shouldFallbackToJsonObject(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const rec = error as Record<string, unknown>
  const nested =
    rec.error && typeof rec.error === 'object'
      ? (rec.error as Record<string, unknown>)
      : null

  const messageParts = [
    error instanceof Error ? error.message : '',
    typeof rec.message === 'string' ? rec.message : '',
    typeof nested?.message === 'string' ? nested.message : '',
  ]
  const message = messageParts.join(' ').toLowerCase()

  const codeParts = [
    typeof rec.code === 'string' ? rec.code : '',
    typeof nested?.code === 'string' ? nested.code : '',
    typeof rec.type === 'string' ? rec.type : '',
    typeof nested?.type === 'string' ? nested.type : '',
  ]
  const codes = codeParts.join(' ').toLowerCase()

  return (
    codes.includes('json_validate_failed') ||
    codes.includes('invalid_request_error') ||
    message.includes('failed to validate json') ||
    message.includes('json_validate_failed') ||
    message.includes('json_schema') ||
    message.includes('response_format') ||
    message.includes('schema') ||
    message.includes('strict')
  )
}

function extractClientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
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
  degraded: boolean
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
    max_tokens: 600,
  }

  try {
    const completion = await groq.chat.completions.create(
      {
        ...baseRequest,
        response_format: {
          type: 'json_schema',
          json_schema: SUGGEST_RESPONSE_SCHEMA,
        },
      },
    )

    return {
      content: completion.choices[0]?.message?.content ?? '{}',
      degraded: false,
    }
  } catch (err) {
    if (!shouldFallbackToJsonObject(err)) {
      throw err
    }

    const completion = await groq.chat.completions.create(
      {
        ...baseRequest,
        response_format: { type: 'json_object' },
      },
    )

    return {
      content: completion.choices[0]?.message?.content ?? '{}',
      degraded: true,
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
    return NextResponse.json({ error: 'invalid api key format' }, { status: 400 })
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
      { error: 'rate limit' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    )
  }

  try {
    const groq = new Groq({ apiKey })
    let cards: SuggestionCard[] = []
    let degraded = false

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const messages: Array<{ role: 'system' | 'user'; content: string }> = [
        { role: 'system', content: prompt },
        { role: 'user', content: 'Generate the suggestion batch JSON now.' },
      ]
      if (attempt === 1) {
        messages.push({ role: 'system', content: RETRY_NUDGE_PROMPT })
      }

      const completion = await withTimeout(
        createSuggestCompletion(groq, messages),
        12_000,
        'suggest',
      )
      degraded = degraded || completion.degraded || attempt === 1

      let parsed: unknown
      try {
        parsed = JSON.parse(stripJsonFences(completion.content))
      } catch {
        if (attempt === 0) {
          degraded = true
          continue
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
        return NextResponse.json({ error: 'invalid model output' }, { status: 502 })
      }

      cards = normalizeCards(parsed)
      if (cards.length > 0 || attempt === 1) break
    }

    console.log(
      JSON.stringify({
        route: 'suggest',
        latencyMs: Date.now() - startedAt,
        charsIn: transcript.length,
        cardsOut: cards.length,
        status: 'ok',
      }),
    )

    return NextResponse.json(degraded ? { cards, degraded: true } : { cards })
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
