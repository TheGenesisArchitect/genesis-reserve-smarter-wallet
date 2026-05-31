import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * Returns a Gemini Live WebSocket URL for the browser to connect directly.
 * Keeping the API key server-side and issuing the connection URL prevents
 * it from being hard-coded in the client bundle.
 */
export async function GET(_req: NextRequest) {
  const apiKey = process.env.GeminiAtlas_API_Key
  if (!apiKey) {
    return NextResponse.json({ error: 'GeminiAtlas_API_Key not configured' }, { status: 503 })
  }

  const wsUrl =
    'wss://generativelanguage.googleapis.com/ws/' +
    'google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent' +
    `?key=${apiKey}`

  return NextResponse.json({ wsUrl })
}
