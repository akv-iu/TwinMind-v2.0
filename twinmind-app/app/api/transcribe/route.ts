import { NextResponse } from 'next/server'
import Groq from 'groq-sdk'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const apiKey = form.get('apiKey') as string | null
  const audio = form.get('audio') as File | null

  if (!apiKey || !apiKey.trim()) {
    return NextResponse.json({ error: 'No API key provided' }, { status: 400 })
  }
  if (!audio) {
    return NextResponse.json({ error: 'No audio provided' }, { status: 400 })
  }

  try {
    const groq = new Groq({ apiKey: apiKey.trim() })
    const result = await groq.audio.transcriptions.create({
      file: audio,
      model: 'whisper-large-v3',
      response_format: 'json',
    })
    return NextResponse.json({ text: result.text ?? '' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transcription failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
