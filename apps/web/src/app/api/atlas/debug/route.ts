import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const check = (name: string) => {
    const val = process.env[name]
    if (!val) return 'NOT SET'
    return `SET (length: ${val.length})`
  }

  const apiKey =
    process.env.GeminiAtlas_API_Key ||
    process.env.GEMINI_API_KEY       ||
    process.env.GeminiAtlas_API_KEY

  let liveModels: string[] = []
  let modelsError: string | null = null

  if (apiKey) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`
      )
      const data = await r.json()
      if (r.ok && data.models) {
        liveModels = (data.models as { name: string; supportedGenerationMethods?: string[] }[])
          .filter(m => m.supportedGenerationMethods?.includes('bidiGenerateContent'))
          .map(m => m.name)
      } else {
        modelsError = data.error?.message ?? 'Unknown error fetching models'
      }
    } catch (e: unknown) {
      modelsError = e instanceof Error ? e.message : String(e)
    }
  }

  return NextResponse.json({
    GeminiAtlas_API_Key:        check('GeminiAtlas_API_Key'),
    GEMINI_API_KEY:             check('GEMINI_API_KEY'),
    GeminiAtlas_API_KEY:        check('GeminiAtlas_API_KEY'),
    Claude_Helix_Atlas_API_Key: check('Claude_Helix_Atlas_API_Key'),
    ANTHROPIC_API_KEY:          check('ANTHROPIC_API_KEY'),
    NODE_ENV:                   process.env.NODE_ENV ?? 'undefined',
    VERCEL_ENV:                 process.env.VERCEL_ENV ?? 'undefined',
    bidiGenerateContent_models: liveModels,
    models_error:               modelsError,
  })
}
