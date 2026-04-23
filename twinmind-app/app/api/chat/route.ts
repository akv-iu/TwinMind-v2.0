import Groq from 'groq-sdk'
import { NextResponse } from 'next/server'
import type { ChatMessage } from '@/lib/types'
import { checkRateLimit, LIMITS } from '@/lib/server/rateLimit'
import { isUpstreamTimeoutError, withTimeout } from '@/lib/server/withTimeout'

export const runtime = 'nodejs'

function isAbortLikeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const rec = error as Record<string, unknown>
  return rec.name === 'AbortError'
}

function extractClientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

function isValidApiKeyFormat(value: string): boolean {
  return value.startsWith('gsk_') && value.length >= 20
}

export async function POST(request: Request) {
  const startedAt = Date.now()
  let body: {
    transcript?: string
    messages?: ChatMessage[]
    prompt?: string
    rollingSummary?: string
    apiKey?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const transcript = body.transcript?.trim() ?? ''
  const prompt = body.prompt?.trim() ?? ''
  const rollingSummary = body.rollingSummary?.trim() || 'not available yet'
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

  const rate = checkRateLimit(ip, 'chat', LIMITS.chat)
  if (!rate.allowed) {
    console.log(
      JSON.stringify({
        route: 'chat',
        status: 'rate_limited',
        latencyMs: Date.now() - startedAt,
        charsIn: transcript.length,
        msgsIn: cleanMessages.length,
      }),
    )
    return NextResponse.json(
      { error: 'Too many requests - wait a minute.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    )
  }

  const groq = new Groq({ apiKey })
  const systemContent = [
    prompt,
    '',
    'MEETING_SUMMARY_SO_FAR:',
    rollingSummary,
    '',
    'RECENT_TRANSCRIPT (timestamped):',
    transcript || 'not available yet',
  ].join('\n')

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
            ...cleanMessages.map((m) => ({ role: m.role, content: m.text })),
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
          charsIn: transcript.length,
          msgsIn: cleanMessages.length,
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
        charsIn: transcript.length,
        msgsIn: cleanMessages.length,
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
      charsIn: transcript.length,
      msgsIn: cleanMessages.length,
    }),
  )

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
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
