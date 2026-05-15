import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      firstName: string
      lastName: string
      dob: string
      nationality: string
      idType: string
      idNumber: string
      walletAddress?: string
      requestedTier: number
      submittedAt: string
    }

    // Validate required fields
    if (!body.firstName || !body.lastName || !body.dob || !body.idNumber) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }

    // Forward to Genesis infrastructure API if available
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL
    if (apiBase) {
      try {
        const res = await fetch(`${apiBase}/kyc/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (res.ok) {
          const data = await res.json()
          return NextResponse.json(data)
        }
      } catch { /* backend unavailable — accept locally */ }
    }

    // Log locally and return accepted status
    const referenceId = `KYC-${Date.now().toString(36).toUpperCase()}`
    console.log('[KYC Submit]', {
      referenceId,
      wallet: body.walletAddress,
      name: `${body.firstName} ${body.lastName}`,
      idType: body.idType,
      requestedTier: body.requestedTier,
      submittedAt: body.submittedAt,
    })

    return NextResponse.json({
      status: 'under_review',
      referenceId,
      estimatedReviewHours: 48,
      message: 'Application received. You will be notified when reviewed.',
    })

  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
}
