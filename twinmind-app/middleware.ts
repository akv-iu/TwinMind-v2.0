import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { originAllowed } from '@/lib/server/origin'

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!originAllowed(origin)) {
    return NextResponse.json({ error: 'forbidden origin' }, { status: 403 })
  }
  return NextResponse.next()
}

export const config = {
  // Opt-in route list: new API routes must be added here intentionally.
  matcher: [
    '/api/chat/:path*',
    '/api/suggest/:path*',
    '/api/transcribe/:path*',
    '/api/summarize/:path*',
    '/api/classify-meeting/:path*',
  ],
}
