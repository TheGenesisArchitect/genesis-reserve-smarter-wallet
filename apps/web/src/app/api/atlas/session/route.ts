import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Returns a Gemini Live WebSocket URL for the browser to connect directly.
 * Keeping the API key server-side and issuing the connection URL prevents
 * it from being hard-coded in the client bundle.
 */
export async function GET(_req: NextRequest) {
  const apiKey =
    process.env.GeminiAtlas_API_Key ||
    process.env.GEMINI_API_KEY       ||
    process.env.GeminiAtlas_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Gemini API key not configured (tried GeminiAtlas_API_Key, GEMINI_API_KEY)' }, { status: 503 })
  }

  const wsUrl =
    'wss://generativelanguage.googleapis.com/ws/' +
    'google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent' +
    `?key=${apiKey}`

  return NextResponse.json({ wsUrl })
}
