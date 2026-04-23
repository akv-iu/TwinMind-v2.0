import Groq from 'groq-sdk'
import { NextResponse } from 'next/server'
import type { ChatMessage, MeetingKind } from '@/lib/types'
import { checkRateLimit, LIMITS } from '@/lib/server/rateLimit'
import { extractClientIp } from '@/lib/server/extractClientIp'
import { isUpstreamTimeoutError, withTimeout } from '@/lib/server/withTimeout'
import { buildChatPrompt } from '@/lib/promptBuilders'

export const runtime = 'nodejs'

function isAbortLikeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const rec = error as Record<string, unknown>
  return rec.name === 'AbortError'
}

function isValidApiKeyFormat(value: string): boolean {
  return value.startsWith('gsk_') && value.length >= 20
}

const VALID_MEETING_KINDS: ReadonlySet<MeetingKind> = new Set([
  'standup',
  'sales',
  'one_on_one',
  'design_review',
  'interview',
  'brainstorm',
  'presentation',
  'other',
])

const DEFAULT_MAX_HISTORY_TURNS = 28
const configuredHistoryTurns = Number(
  process.env.CHAT_MAX_HISTORY_TURNS ?? DEFAULT_MAX_HISTORY_TURNS,
)
const MAX_HISTORY_TURNS = Number.isFinite(configuredHistoryTurns)
  ? Math.min(Math.max(Math.floor(configuredHistoryTurns), 10), 60)
  : DEFAULT_MAX_HISTORY_TURNS

const MAX_TRANSCRIPT_CHARS = 8000
const MAX_ROLLING_SUMMARY_CHARS = 1200

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

export async function POST(request: Request) {
  const startedAt = Date.now()
  let body: {
    transcript?: string
    messages?: ChatMessage[]
    prompt?: string
    rollingSummary?: string
    meetingKind?: string
    apiKey?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.transcript !== 'undefined' && typeof body.transcript !== 'string') {
    return NextResponse.json({ error: 'invalid field type' }, { status: 400 })
  }
  if (
    typeof body.rollingSummary !== 'undefined' &&
    typeof body.rollingSummary !== 'string'
  ) {
    return NextResponse.json({ error: 'invalid field type' }, { status: 400 })
  }
  if (typeof body.prompt !== 'undefined' && typeof body.prompt !== 'string') {
    return NextResponse.json({ error: 'invalid field type' }, { status: 400 })
  }

  const transcriptCap = capField(
    body.transcript?.trim() ?? '',
    MAX_TRANSCRIPT_CHARS,
    'transcript',
  )
  const summaryCap = capField(
    body.rollingSummary?.trim() ?? '',
    MAX_ROLLING_SUMMARY_CHARS,
    'summary',
  )

  const transcript = transcriptCap.value
  const prompt = body.prompt?.trim() ?? ''
  const rollingSummary = summaryCap.value
  const meetingKind =
    typeof body.meetingKind === 'string' &&
    VALID_MEETING_KINDS.has(body.meetingKind as MeetingKind)
      ? (body.meetingKind as MeetingKind)
      : undefined
  const apiKey = body.apiKey?.trim() ?? ''
  const messages = body.messages
  const ip = extractClientIp(request)

  if (!apiKey) {
    return NextResponse.json({ error: 'No API key provided' }, { status: 400 })
  }
  if (!isValidApiKeyFormat(apiKey)) {
    return NextResponse.json({ error: 'Invalid Groq key format.' }, { status: 400 })
  }
  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
  }
  const cleanMessages = messages.filter((m) => !m.isFailed)
  const trimmedMessages = cleanMessages.slice(-MAX_HISTORY_TURNS)
  const truncationEvents = { ...transcriptCap.events, ...summaryCap.events }

  const systemContent = buildChatPrompt({
    basePrompt: prompt,
    rollingSummary,
    recentTranscript: transcript,
    meetingKind,
  })
  const promptBytes = utf8Bytes(systemContent)
  const baseMetrics = {
    transcriptChars: transcript.length,
    summaryChars: rollingSummary.length,
    promptBytes,
    meetingKind: meetingKind ?? null,
    msgsIn: cleanMessages.length,
    msgsKept: trimmedMessages.length,
    historyCap: MAX_HISTORY_TURNS,
    ...truncationEvents,
  }

  const rate = checkRateLimit(ip, 'chat', LIMITS.chat)
  if (!rate.allowed) {
    console.log(
      JSON.stringify({
        route: 'chat',
        status: 'rate_limited',
        latencyMs: Date.now() - startedAt,
        ...baseMetrics,
      }),
    )
    return NextResponse.json(
      { error: 'Too many requests - wait a minute.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    )
  }

  const groq = new Groq({ apiKey })

  const upstream = new AbortController()
  const onAbort = () => upstream.abort()
  request.signal.addEventListener('abort', onAbort)

  let stream: AsyncIterable<{ choices: Array<{ delta?: { content?: string } }> }>
  try {
    stream = (await withTimeout(
      groq.chat.completions.create(
        {
          model: 'openai/gpt-oss-120b',
          stream: true,
          temperature: 0.5,
          max_tokens: 800,
          messages: [
            { role: 'system', content: systemContent },
            ...trimmedMessages.map((m) => ({ role: m.role, content: m.text })),
          ],
        },
        { signal: upstream.signal },
      ) as unknown as Promise<AsyncIterable<{
        choices: Array<{ delta?: { content?: string } }>
      }>>,
      12_000,
      'chat',
      () => upstream.abort(),
    )) as AsyncIterable<{
      choices: Array<{ delta?: { content?: string } }>
    }>
  } catch (err) {
    if (isUpstreamTimeoutError(err)) {
      console.log(
        JSON.stringify({
          route: 'chat',
          status: 'timeout',
          latencyMs: Date.now() - startedAt,
          ...baseMetrics,
        }),
      )
      return NextResponse.json({ error: 'upstream timeout' }, { status: 504 })
    }
    if (isAbortLikeError(err)) {
      if (request.signal.aborted) {
        return NextResponse.json({ error: 'Chat request canceled' }, { status: 499 })
      }
      return NextResponse.json({ error: 'Chat request timed out' }, { status: 504 })
    }

    console.log(
      JSON.stringify({
        route: 'chat',
        status: 'error',
        latencyMs: Date.now() - startedAt,
        ...baseMetrics,
      }),
    )
    const message = err instanceof Error ? err.message : 'Chat request failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }

  console.log(
    JSON.stringify({
      route: 'chat',
      status: 'ok',
      latencyMs: Date.now() - startedAt,
      ...baseMetrics,
    }),
  )

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      const KEEPALIVE_MS = 15_000
      const keepaliveTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keep-alive\n\n'))
        } catch {
          // controller is already closed
        }
      }, KEEPALIVE_MS)

      try {
        for await (const chunk of stream) {
          if (request.signal.aborted) break
          const delta = chunk.choices?.[0]?.delta?.content ?? ''
          if (delta) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`),
            )
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } catch {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ delta: '\n\n\u26A0 Response interrupted.' })}\n\n`,
          ),
        )
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } finally {
        clearInterval(keepaliveTimer)
        request.signal.removeEventListener('abort', onAbort)
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
