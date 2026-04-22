import { NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import type { CardType, SuggestionCard } from '@/lib/types'

export const runtime = 'nodejs'

const VALID_TYPES: ReadonlySet<CardType> = new Set([
  'QUESTION_TO_ASK',
  'TALKING_POINT',
  'ANSWER',
  'FACT_CHECK',
  'CLARIFYING_INFO',
])

const FALLBACK_TYPE_ORDER: CardType[] = [
  'CLARIFYING_INFO',
  'TALKING_POINT',
  'QUESTION_TO_ASK',
  'ANSWER',
  'FACT_CHECK',
]

const FALLBACK_PREVIEWS: Record<CardType, string> = {
  QUESTION_TO_ASK: 'What single question would unblock the next decision?',
  TALKING_POINT: 'Summarize the highest-impact takeaway from the latest update.',
  ANSWER: 'Offer a direct response based on the most recent transcript evidence.',
  FACT_CHECK: 'Verify the latest claim with a source or concrete metric.',
  CLARIFYING_INFO: 'Add one clarifying detail to remove ambiguity before proceeding.',
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
    if (!trimmedPreview) continue
    normalized.push({ type: typed, preview: trimmedPreview })
  }

  while (normalized.length < 3) {
    const type = FALLBACK_TYPE_ORDER[normalized.length % FALLBACK_TYPE_ORDER.length]
    normalized.push({ type, preview: FALLBACK_PREVIEWS[type] })
  }

  return normalized
}

function stripJsonFences(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  }
  return trimmed
}

export async function POST(request: Request) {
  let body: { transcript?: string; prompt?: string; apiKey?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { transcript, prompt, apiKey } = body
  if (!apiKey || !apiKey.trim()) {
    return NextResponse.json({ error: 'No API key provided' }, { status: 400 })
  }
  if (!transcript || !transcript.trim()) {
    return NextResponse.json({ error: 'No transcript provided' }, { status: 400 })
  }

  try {
    const groq = new Groq({ apiKey: apiKey.trim() })
    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: prompt ?? '' },
        { role: 'user', content: `Transcript:\n${transcript}` },
      ],
    })
    const raw = completion.choices[0]?.message?.content ?? '[]'
    const cleaned = stripJsonFences(raw)

    let parsed: unknown
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({ error: 'Model returned invalid JSON' }, { status: 502 })
    }

    const cards = normalizeCards(parsed)
    return NextResponse.json({ cards })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Suggestion failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
