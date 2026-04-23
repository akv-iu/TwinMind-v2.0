import { NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { checkRateLimit, LIMITS } from '@/lib/server/rateLimit'
import { extractClientIp } from '@/lib/server/extractClientIp'
import { isUpstreamTimeoutError, withTimeout } from '@/lib/server/withTimeout'

export const runtime = 'nodejs'

function isValidApiKeyFormat(value: string): boolean {
  return value.startsWith('gsk_') && value.length >= 20
}

export async function POST(request: Request) {
  const startedAt = Date.now()
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const apiKey = form.get('apiKey') as string | null
  const audio = form.get('audio') as File | null
  const ip = extractClientIp(request)

  if (!apiKey || !apiKey.trim()) {
    return NextResponse.json({ error: 'No API key provided' }, { status: 400 })
  }
  const apiKeyTrimmed = apiKey.trim()
  if (!isValidApiKeyFormat(apiKeyTrimmed)) {
    return NextResponse.json({ error: 'Invalid Groq key format.' }, { status: 400 })
  }
  if (!audio) {
    return NextResponse.json({ error: 'No audio provided' }, { status: 400 })
  }

  const rate = checkRateLimit(ip, 'transcribe', LIMITS.transcribe)
  if (!rate.allowed) {
    console.log(
      JSON.stringify({
        route: 'transcribe',
        status: 'rate_limited',
        latencyMs: Date.now() - startedAt,
        bytesIn: audio.size,
      }),
    )
    return NextResponse.json(
      { error: 'Too many requests - wait a minute.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    )
  }

  try {
    const groq = new Groq({ apiKey: apiKeyTrimmed })
    const result = await withTimeout(
      groq.audio.transcriptions.create({
        file: audio,
        model: 'whisper-large-v3',
        response_format: 'json',
      }),
      25_000,
      'transcribe',
    )
    const text = result.text ?? ''
    console.log(
      JSON.stringify({
        route: 'transcribe',
        status: 'ok',
        latencyMs: Date.now() - startedAt,
        bytesIn: audio.size,
        charsOut: text.length,
      }),
    )
    return NextResponse.json({ text })
  } catch (err) {
    if (isUpstreamTimeoutError(err)) {
      console.log(
        JSON.stringify({
          route: 'transcribe',
          status: 'timeout',
          latencyMs: Date.now() - startedAt,
          bytesIn: audio.size,
        }),
      )
      return NextResponse.json({ error: 'upstream timeout' }, { status: 504 })
    }
    console.log(
      JSON.stringify({
        route: 'transcribe',
        status: 'error',
        latencyMs: Date.now() - startedAt,
        bytesIn: audio.size,
      }),
    )
    const message = err instanceof Error ? err.message : 'Transcription failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
