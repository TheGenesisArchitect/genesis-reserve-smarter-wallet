'use client'

// circle-tokenize.ts — browser-side Circle card tokenization helpers.
//
// Raw PAN is encrypted with Circle's RSA public key before leaving the browser.
// Genesis servers never see the plaintext card number or CVV.
// Shared between CardPage (link flow) and FundPage (Enable USDC upgrade flow).

export async function encryptCircleCardData(
  publicKeyPem: string,
  number: string,
  cvv: string,
): Promise<string> {
  const pem = publicKeyPem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const cryptoKey = await window.crypto.subtle.importKey(
    'spki',
    der.buffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  )
  const data = new TextEncoder().encode(JSON.stringify({ number, cvv }))
  const encrypted = await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, cryptoKey, data)
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)))
}

export type TokenizeCardParams = {
  cardNumber: string    // raw digits (spaces stripped internally)
  cvv: string
  expMonth: number
  expYear: number
  cardholderName: string
  accountId: string
}

// Returns a Circle cardId on success, null on any error (graceful degradation).
export async function tokenizeWithCircle(params: TokenizeCardParams): Promise<string | null> {
  try {
    const keyRes = await fetch('/api/gr/circle/encryption-key')
    if (!keyRes.ok) return null
    const { keyId, publicKey } = await keyRes.json()
    if (!keyId || !publicKey) return null

    const raw = params.cardNumber.replace(/\s/g, '')
    const encryptedData = await encryptCircleCardData(publicKey, raw, params.cvv)

    const cardRes = await fetch('/api/gr/circle/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: `circle_card_${params.accountId}_${Date.now().toString(36)}`,
        keyId,
        encryptedData,
        expMonth: params.expMonth,
        expYear: params.expYear,
        billingDetails: { name: params.cardholderName.trim() },
      }),
    })
    if (!cardRes.ok) return null
    const { circleCardId } = await cardRes.json()
    return circleCardId ?? null
  } catch {
    return null
  }
}
