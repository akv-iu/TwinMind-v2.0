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
  matcher: '/api/:path*',
}

