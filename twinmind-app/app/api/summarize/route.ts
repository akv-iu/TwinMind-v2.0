import { NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { checkRateLimit, LIMITS } from '@/lib/server/rateLimit'
import { isUpstreamTimeoutError, withTimeout } from '@/lib/server/withTimeout'

export const runtime = 'nodejs'

const SUMMARY_SYSTEM_PROMPT =
  'Summarize this meeting transcript in 3-5 short bullet points covering: who is involved, the main topics discussed, the decisions or open questions. Max 120 words total. Output plain text, no markdown headers.'

function extractClientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

function isValidApiKeyFormat(value: string): boolean {
  return value.startsWith('gsk_') && value.length >= 20
}

export async function POST(request: Request) {
  const startedAt = Date.now()
  let body: { transcript?: string; apiKey?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const transcript = body.transcript?.trim() ?? ''
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

  const rate = checkRateLimit(ip, 'summarize', LIMITS.summarize)
  if (!rate.allowed) {
    console.log(
      JSON.stringify({
        route: 'summarize',
        status: 'rate_limited',
        latencyMs: Date.now() - startedAt,
        charsIn: transcript.length,
      }),
    )
    return NextResponse.json(
      { error: 'Too many requests - wait a minute.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    )
  }

  try {
    const groq = new Groq({ apiKey })
    const completion = await withTimeout(
      groq.chat.completions.create({
        model: 'openai/gpt-oss-120b',
        temperature: 0.3,
        max_tokens: 300,
        messages: [
          { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
          { role: 'user', content: `Transcript:\n${transcript}` },
        ],
      }),
      15_000,
      'summarize',
    )

    const summary = completion.choices[0]?.message?.content?.trim() ?? ''
    console.log(
      JSON.stringify({
        route: 'summarize',
        status: 'ok',
        latencyMs: Date.now() - startedAt,
        charsIn: transcript.length,
        summaryChars: summary.length,
      }),
    )
    return NextResponse.json({ summary })
  } catch (err) {
    if (isUpstreamTimeoutError(err)) {
      console.log(
        JSON.stringify({
          route: 'summarize',
          status: 'timeout',
          latencyMs: Date.now() - startedAt,
          charsIn: transcript.length,
        }),
      )
      return NextResponse.json({ error: 'upstream timeout' }, { status: 504 })
    }
    console.log(
      JSON.stringify({
        route: 'summarize',
        status: 'error',
        latencyMs: Date.now() - startedAt,
        charsIn: transcript.length,
      }),
    )
    const message = err instanceof Error ? err.message : 'Summary failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
