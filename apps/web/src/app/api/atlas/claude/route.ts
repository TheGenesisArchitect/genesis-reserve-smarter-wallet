import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  }

  const { system, messages } = await req.json()

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      system,
      messages,
    }),
  })

  const data = await upstream.json()

  if (!upstream.ok) {
    return NextResponse.json({ error: data.error?.message ?? 'Claude API error' }, { status: upstream.status })
  }

  const text = data.content?.[0]?.text ?? ''
  return NextResponse.json({ text })
}
