import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const apiKey = process.env.GeminiAtlas_API_Key
  if (!apiKey) {
    return NextResponse.json({ error: 'GeminiAtlas_API_Key not configured' }, { status: 503 })
  }

  const body = await req.json()

  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )

  const data = await upstream.json()

  if (!upstream.ok) {
    return NextResponse.json({ error: data.error?.message ?? 'Gemini API error' }, { status: upstream.status })
  }

  return NextResponse.json(data)
}
