import Groq from 'groq-sdk'
import { NextResponse } from 'next/server'
import type { ChatMessage } from '@/lib/types'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  let body: {
    transcript?: string
    messages?: ChatMessage[]
    prompt?: string
    apiKey?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { transcript, messages, prompt, apiKey } = body
  if (!apiKey || !apiKey.trim()) {
    return NextResponse.json({ error: 'No API key provided' }, { status: 400 })
  }
  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
  }

  const groq = new Groq({ apiKey: apiKey.trim() })
  const systemContent = `${prompt ?? ''}\n\nTranscript:\n${transcript ?? ''}`

  let stream: AsyncIterable<{ choices: Array<{ delta?: { content?: string } }> }>
  try {
    stream = (await groq.chat.completions.create({
      model: 'gpt-OSS-120B',
      stream: true,
      messages: [
        { role: 'system', content: systemContent },
        ...messages.map((m) => ({ role: m.role, content: m.text })),
      ],
    })) as unknown as AsyncIterable<{
      choices: Array<{ delta?: { content?: string } }>
    }>
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Chat request failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
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
            `data: ${JSON.stringify({ delta: ' [Response interrupted]' })}\n\n`,
          ),
        )
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } finally {
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
