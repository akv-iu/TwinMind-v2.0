import { NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import type { CardType, MeetingKind, SuggestIntentPrompts, SuggestionCard } from '@/lib/types'
import { checkRateLimit, LIMITS } from '@/lib/server/rateLimit'
import { extractClientIp } from '@/lib/server/extractClientIp'
import { isUpstreamTimeoutError, withTimeout } from '@/lib/server/withTimeout'
import { buildSuggestPrompt } from '@/lib/promptBuilders'
import { KIND_EXAMPLES, KIND_ROLE_HINTS } from '@/lib/meetingKind'
import { SUGGEST_INTENT_PROMPTS_DEFAULT } from '@/store/settingsSlice'

export const runtime = 'nodejs'

const VALID_TYPES: ReadonlySet<CardType> = new Set([
  'QUESTION_TO_ASK',
  'TALKING_POINT',
  'ANSWER',
  'FACT_CHECK',
])

const VALID_MEETING_KINDS: ReadonlySet<MeetingKind> = new Set([
  'standup',
  'sales',
  'one_on_one',
  'design_review',
  'interview',
  'brainstorm',
  'presentation',
  'retrospective',
  'other',
])

const DEFAULT_SUGGEST_MAX_TOKENS = 560
const configuredSuggestMaxTokens = Number(
  process.env.SUGGEST_MAX_TOKENS ?? DEFAULT_SUGGEST_MAX_TOKENS,
)
const SUGGEST_MAX_TOKENS = Number.isFinite(configuredSuggestMaxTokens)
  ? Math.min(Math.max(Math.floor(configuredSuggestMaxTokens), 240), 900)
  : DEFAULT_SUGGEST_MAX_TOKENS
const REPAIR_MAX_TOKENS = 220
const REPAIR_TRANSCRIPT_CHARS = 1200
const REPAIR_MODEL_OUTPUT_CHARS = 2200
const FORCE_NONEMPTY_MAX_TOKENS = 240

const MAX_TRANSCRIPT_CHARS = 8000
const MAX_ROLLING_SUMMARY_CHARS = 1200
const MAX_PRIOR_BATCHES_CHARS = 1000
const MAX_INTENT_PROMPT_CHARS = 500

const RETRY_NUDGE_PROMPT =
  'Your previous response was not valid enough. Return ONLY a JSON object with key "cards". Each card must have: type (QUESTION_TO_ASK|TALKING_POINT|ANSWER|FACT_CHECK) and preview (10-180 chars). Produce exactly 3 cards unless there is no substance, then return {"cards":[]}.'
const REPAIR_SYSTEM_PROMPT = [
  'ROLE',
  'You repair malformed suggestion output into a valid suggestion cards object.',
  '',
  'OUTPUT',
  'Return ONLY JSON object with key "cards".',
  'Each card has: type and preview.',
  'Valid type values: QUESTION_TO_ASK, TALKING_POINT, ANSWER, FACT_CHECK.',
  'Preview length: 10-180 characters.',
  'Prefer exactly 3 cards. Use at least 2 distinct types if possible.',
  'If content is empty/off-topic, return {"cards":[]}.',
].join('\n')

interface ParseSuccess {
  ok: true
  body: {
    transcriptTail: string
    rollingSummary: string
    priorBatchesText: string
    meetingKind?: MeetingKind
    intentPrompts: SuggestIntentPrompts
    apiKey: string
    truncationEvents: Record<string, number | boolean>
  }
}

interface ParseFailure {
  ok: false
  error: 'invalid request shape' | 'invalid field type'
}

const INTENT_PROMPT_KEYS: Array<keyof SuggestIntentPrompts> = [
  'QUESTION_TO_ASK',
  'TALKING_POINT',
  'ANSWER',
  'FACT_CHECK',
]

const INTENT_PROMPT_METRIC_PREFIX: Record<keyof SuggestIntentPrompts, string> = {
  QUESTION_TO_ASK: 'intentQuestionToAsk',
  TALKING_POINT: 'intentTalkingPoint',
  ANSWER: 'intentAnswer',
  FACT_CHECK: 'intentFactCheck',
}

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

function takeTail(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(text.length - maxChars)
}

function hasSubstantiveTranscript(transcript: string): boolean {
  const cleaned = transcript
    .replace(/\b\d{1,2}:\d{2}:\d{2}\s*(AM|PM)?\b/gi, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return false
  const words = cleaned.split(' ').filter(Boolean)
  return words.length >= 18
}

function isJsonLikePreview(value: string): boolean {
  const preview = value.trim()
  if (!preview) return false
  if (preview.startsWith('{') || preview.startsWith('[')) return true
  if (preview.startsWith('\\"{') || preview.startsWith('\\"[')) return true
  if (preview.includes('\\"cards\\"')) return true
  if (/"cards"\s*:/.test(preview)) return true
  if (/"type"\s*:/.test(preview) && /"preview"\s*:/.test(preview)) return true
  return false
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

function normalizePreviewForDistinctness(preview: string): string {
  return preview
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function dedupeDistinctCards(cards: SuggestionCard[]): SuggestionCard[] {
  const distinct: SuggestionCard[] = []
  const seen = new Set<string>()

  for (const card of cards) {
    const key = normalizePreviewForDistinctness(card.preview)
    if (!key || seen.has(key)) continue
    seen.add(key)
    distinct.push(card)
    if (distinct.length >= 3) break
  }

  return distinct
}

function parseCardsFromPlainText(raw: string): SuggestionCard[] {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const cards: SuggestionCard[] = []
  for (const line of lines) {
    if (cards.length >= 12) break
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
      if (isJsonLikePreview(preview)) continue
    } else {
      preview = fitPreview(cleaned)
      if (isJsonLikePreview(preview)) continue
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

  return dedupeDistinctCards(parseCardsFromPlainText(stripped))
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

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === 'object' && !Array.isArray(input)
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length
}

function capField(
  value: string,
  maxChars: number,
  metricPrefix: string,
): { value: string; events: Record<string, number | boolean> } {
  if (value.length <= maxChars) {
    return { value, events: {} }
  }
  return {
    value: value.slice(0, maxChars),
    events: {
      [`${metricPrefix}Truncated`]: true,
      [`${metricPrefix}TruncatedFrom`]: value.length,
      [`${metricPrefix}TruncatedTo`]: maxChars,
    },
  }
}

function normalizeIntentPrompts(input: unknown):
  | {
      ok: true
      intentPrompts: SuggestIntentPrompts
      truncationEvents: Record<string, number | boolean>
    }
  | { ok: false } {
  if (typeof input === 'undefined') {
    return {
      ok: true,
      intentPrompts: { ...SUGGEST_INTENT_PROMPTS_DEFAULT },
      truncationEvents: {},
    }
  }
  if (!isRecord(input)) return { ok: false }

  const intentPrompts: SuggestIntentPrompts = {
    QUESTION_TO_ASK: SUGGEST_INTENT_PROMPTS_DEFAULT.QUESTION_TO_ASK,
    TALKING_POINT: SUGGEST_INTENT_PROMPTS_DEFAULT.TALKING_POINT,
    ANSWER: SUGGEST_INTENT_PROMPTS_DEFAULT.ANSWER,
    FACT_CHECK: SUGGEST_INTENT_PROMPTS_DEFAULT.FACT_CHECK,
  }
  const truncationEvents: Record<string, number | boolean> = {}

  for (const key of INTENT_PROMPT_KEYS) {
    const value = input[key]
    if (typeof value === 'undefined') {
      continue
    }
    if (typeof value !== 'string') return { ok: false }
    const capped = capField(
      value.trim(),
      MAX_INTENT_PROMPT_CHARS,
      INTENT_PROMPT_METRIC_PREFIX[key],
    )
    intentPrompts[key] = capped.value
    Object.assign(truncationEvents, capped.events)
  }

  return { ok: true, intentPrompts, truncationEvents }
}

export function parseSuggestRequestBody(rawBody: unknown): ParseSuccess | ParseFailure {
  if (!isRecord(rawBody)) {
    return { ok: false, error: 'invalid request shape' }
  }
  if ('prompt' in rawBody || 'transcript' in rawBody) {
    return { ok: false, error: 'invalid request shape' }
  }

  if (
    !('transcriptTail' in rawBody) ||
    !('rollingSummary' in rawBody) ||
    !('priorBatchesText' in rawBody)
  ) {
    return { ok: false, error: 'invalid request shape' }
  }

  if (
    typeof rawBody.transcriptTail !== 'string' ||
    typeof rawBody.rollingSummary !== 'string' ||
    typeof rawBody.priorBatchesText !== 'string'
  ) {
    return { ok: false, error: 'invalid field type' }
  }
  if (typeof rawBody.apiKey !== 'undefined' && typeof rawBody.apiKey !== 'string') {
    return { ok: false, error: 'invalid field type' }
  }
  if (
    typeof rawBody.meetingKind !== 'undefined' &&
    rawBody.meetingKind !== null &&
    typeof rawBody.meetingKind !== 'string'
  ) {
    return { ok: false, error: 'invalid field type' }
  }

  const intentPromptsResult = normalizeIntentPrompts(rawBody.intentPrompts)
  if (!intentPromptsResult.ok) {
    return { ok: false, error: 'invalid field type' }
  }

  const transcript = capField(
    rawBody.transcriptTail.trim(),
    MAX_TRANSCRIPT_CHARS,
    'transcript',
  )
  const summary = capField(
    rawBody.rollingSummary.trim(),
    MAX_ROLLING_SUMMARY_CHARS,
    'summary',
  )
  const priorBatches = capField(
    rawBody.priorBatchesText.trim(),
    MAX_PRIOR_BATCHES_CHARS,
    'priorBatches',
  )
  const meetingKind =
    typeof rawBody.meetingKind === 'string' &&
    VALID_MEETING_KINDS.has(rawBody.meetingKind as MeetingKind)
      ? (rawBody.meetingKind as MeetingKind)
      : undefined

  return {
    ok: true,
    body: {
      transcriptTail: transcript.value,
      rollingSummary: summary.value,
      priorBatchesText: priorBatches.value,
      meetingKind,
      intentPrompts: intentPromptsResult.intentPrompts,
      apiKey: typeof rawBody.apiKey === 'string' ? rawBody.apiKey.trim() : '',
      truncationEvents: {
        ...transcript.events,
        ...summary.events,
        ...priorBatches.events,
        ...intentPromptsResult.truncationEvents,
      },
    },
  }
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
    if (normalized.length >= 12) break
    if (!item || typeof item !== 'object') continue

    const rec = item as Record<string, unknown>
    const type = rec.type
    const preview = rec.preview ?? rec.text ?? rec.content
    if (typeof type !== 'string' || typeof preview !== 'string') continue

    const typed = type as CardType
    if (!VALID_TYPES.has(typed)) continue

    const trimmedPreview = preview.trim()
    if (trimmedPreview.length < 10 || trimmedPreview.length > 180) continue
    if (isJsonLikePreview(trimmedPreview)) continue
    normalized.push({ type: typed, preview: trimmedPreview })
  }

  return dedupeDistinctCards(normalized)
}

interface CompletionResult {
  content: string
  usedJsonFallback: boolean
}

async function createSuggestCompletion(
  groq: Groq,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  options?: { maxTokens?: number; temperature?: number; topP?: number },
): Promise<CompletionResult> {
  const baseRequest = {
    model: 'openai/gpt-oss-120b',
    messages,
    temperature: options?.temperature ?? 0.65,
    top_p: options?.topP ?? 0.9,
    max_tokens: options?.maxTokens ?? SUGGEST_MAX_TOKENS,
  }

  try {
    const completion = await groq.chat.completions.create({
      ...baseRequest,
    })

    return {
      content: completion.choices[0]?.message?.content ?? '{}',
      usedJsonFallback: false,
    }
  } catch (err) {
    if (!shouldFallbackToJsonObject(err)) {
      throw err
    }
    return {
      content: '{"cards":[]}',
      usedJsonFallback: true,
    }
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now()
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsedBody = parseSuggestRequestBody(rawBody)
  if (!parsedBody.ok) {
    return NextResponse.json({ error: parsedBody.error }, { status: 400 })
  }

  const {
    transcriptTail,
    rollingSummary,
    priorBatchesText,
    meetingKind,
    intentPrompts,
    apiKey,
    truncationEvents,
  } = parsedBody.body
  const ip = extractClientIp(request)

  if (!apiKey) {
    return NextResponse.json({ error: 'No API key provided' }, { status: 400 })
  }
  if (!isValidApiKeyFormat(apiKey)) {
    return NextResponse.json({ error: 'Invalid Groq key format.' }, { status: 400 })
  }

  const prompt = buildSuggestPrompt(intentPrompts, {
    recentTranscript: transcriptTail,
    rollingSummary,
    priorBatches: priorBatchesText,
    meetingKind,
    kindRoleHint: meetingKind ? KIND_ROLE_HINTS[meetingKind] : undefined,
    kindExampleBlock: meetingKind ? KIND_EXAMPLES[meetingKind] : undefined,
  })
  const promptBytes = utf8Bytes(prompt)
  const baseMetrics = {
    transcriptChars: transcriptTail.length,
    summaryChars: rollingSummary.length,
    priorBatchesChars: priorBatchesText.length,
    promptBytes,
    meetingKind: meetingKind ?? null,
    ...truncationEvents,
  }

  if (!transcriptTail) {
    console.log(
      JSON.stringify({
        route: 'suggest',
        status: 'ok_no_transcript',
        latencyMs: Date.now() - startedAt,
        cardsOut: 0,
        degraded: false,
        ...baseMetrics,
      }),
    )
    return NextResponse.json({ cards: [] })
  }

  const rate = checkRateLimit(ip, 'suggest', LIMITS.suggest)
  if (!rate.allowed) {
    console.log(
      JSON.stringify({
        route: 'suggest',
        status: 'rate_limited',
        latencyMs: Date.now() - startedAt,
        cardsOut: 0,
        ...baseMetrics,
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
    let repairUsed = false
    let attemptsUsed = 1

    const primaryMessages: Array<{ role: 'system' | 'user'; content: string }> = [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Generate the suggestion batch JSON now.' },
    ]
    const primaryCompletion = await withTimeout(
      createSuggestCompletion(groq, primaryMessages),
      12_000,
      'suggest',
    )
    usedJsonFallback = usedJsonFallback || primaryCompletion.usedJsonFallback
    cards = coerceCardsFromModelContent(primaryCompletion.content)

    if (cards.length < 3) {
      attemptsUsed = 2
      const repairMessages: Array<{ role: 'system' | 'user'; content: string }> = [
        { role: 'system', content: REPAIR_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            'RECENT_TRANSCRIPT_TAIL:',
            takeTail(transcriptTail, REPAIR_TRANSCRIPT_CHARS),
            '',
            'MALFORMED_MODEL_OUTPUT:',
            takeTail(primaryCompletion.content, REPAIR_MODEL_OUTPUT_CHARS),
            '',
            RETRY_NUDGE_PROMPT,
          ].join('\n'),
        },
      ]

      try {
        const repairCompletion = await withTimeout(
          createSuggestCompletion(groq, repairMessages, {
            maxTokens: REPAIR_MAX_TOKENS,
            temperature: 0.2,
            topP: 0.8,
          }),
          8_000,
          'suggest_repair',
        )
        usedJsonFallback = usedJsonFallback || repairCompletion.usedJsonFallback
        const repairedCards = coerceCardsFromModelContent(repairCompletion.content)
        if (repairedCards.length > 0) {
          cards = repairedCards
          repairUsed = true
        }
      } catch {
        // keep primary cards
      }
    }

    if (cards.length === 0 && hasSubstantiveTranscript(transcriptTail)) {
      attemptsUsed = Math.max(attemptsUsed, 3)
      const forceMessages: Array<{ role: 'system' | 'user'; content: string }> = [
        { role: 'system', content: REPAIR_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            'RECENT_TRANSCRIPT_TAIL:',
            takeTail(transcriptTail, REPAIR_TRANSCRIPT_CHARS),
            '',
            'No valid cards were parsed. The transcript has substantive content.',
            'Return exactly 3 cards and do not return {"cards":[]} unless there is truly no meeting substance.',
          ].join('\n'),
        },
      ]
      try {
        const forceCompletion = await withTimeout(
          createSuggestCompletion(groq, forceMessages, {
            maxTokens: FORCE_NONEMPTY_MAX_TOKENS,
            temperature: 0.25,
            topP: 0.85,
          }),
          8_000,
          'suggest_force_nonempty',
        )
        usedJsonFallback = usedJsonFallback || forceCompletion.usedJsonFallback
        const forcedCards = coerceCardsFromModelContent(forceCompletion.content)
        if (forcedCards.length > 0) {
          cards = forcedCards
          repairUsed = true
        }
      } catch {
        // keep existing cards (still empty)
      }
    }

    const strictDistinctShortfall = cards.length > 0 && cards.length < 3
    const strictDistinctMissingCount = strictDistinctShortfall ? 3 - cards.length : 0
    const degraded = (usedJsonFallback && !repairUsed) || strictDistinctShortfall

    console.log(
      JSON.stringify({
        route: 'suggest',
        status: 'ok',
        latencyMs: Date.now() - startedAt,
        cardsOut: cards.length,
        waitingLikeEmpty: cards.length === 0,
        partialCards: cards.length < 3,
        degraded,
        strictDistinctShortfall,
        strictDistinctMissingCount,
        repairUsed,
        usedJsonFallback,
        attemptsUsed,
        suggestMaxTokens: SUGGEST_MAX_TOKENS,
        ...baseMetrics,
      }),
    )

    const responsePayload: {
      cards: SuggestionCard[]
      degraded?: boolean
      repaired?: boolean
    } = { cards }
    if (degraded) responsePayload.degraded = true
    if (repairUsed) responsePayload.repaired = true
    return NextResponse.json(responsePayload)
  } catch (err) {
    if (isUpstreamTimeoutError(err)) {
      console.log(
        JSON.stringify({
          route: 'suggest',
          status: 'timeout',
          latencyMs: Date.now() - startedAt,
          cardsOut: 0,
          ...baseMetrics,
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
          cardsOut: 0,
          suggestMaxTokens: SUGGEST_MAX_TOKENS,
          ...baseMetrics,
        }),
      )
      return NextResponse.json({ cards: [], degraded: true })
    }

    console.log(
      JSON.stringify({
        route: 'suggest',
        status: 'error',
        latencyMs: Date.now() - startedAt,
        cardsOut: 0,
        ...baseMetrics,
      }),
    )
    const message = err instanceof Error ? err.message : 'Suggestion failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
