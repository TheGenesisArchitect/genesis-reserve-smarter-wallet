import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET() {
  const check = (name: string) => {
    const val = process.env[name]
    if (!val) return 'NOT SET'
    return `SET (length: ${val.length})`
  }

  return NextResponse.json({
    GeminiAtlas_API_Key:       check('GeminiAtlas_API_Key'),
    GEMINI_API_KEY:            check('GEMINI_API_KEY'),
    GeminiAtlas_API_KEY:       check('GeminiAtlas_API_KEY'),
    Claude_Helix_Atlas_API_Key: check('Claude_Helix_Atlas_API_Key'),
    ANTHROPIC_API_KEY:         check('ANTHROPIC_API_KEY'),
    NODE_ENV:                  process.env.NODE_ENV ?? 'undefined',
    VERCEL_ENV:                process.env.VERCEL_ENV ?? 'undefined',
  })
}
