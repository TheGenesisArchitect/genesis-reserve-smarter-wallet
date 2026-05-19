/**
 * useAutoKYCActivate
 *
 * Fires once after wallet connect. Calls POST /api/gr/kyc/activate which
 * verifies backend KYC approval and only then mirrors that status on-chain.
 */

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useActiveWalletAddress } from './useActiveWalletAddress'

export function useAutoKYCActivate(addressOverride?: string | null) {
  const activeAddress = useActiveWalletAddress()
  const address = addressOverride ?? activeAddress
  const queryClient = useQueryClient()
  const activatedRef = useRef<string | null>(null)
  const vaultActivatedRef = useRef<Record<string, boolean>>({})
  const retryAttemptsRef = useRef<Record<string, number>>({})
  const retryTimerRef = useRef<number | null>(null)
  const vaultRetryAttemptsRef = useRef<Record<string, number>>({})
  const vaultRetryTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!address) return
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
    if (vaultRetryTimerRef.current) {
      window.clearTimeout(vaultRetryTimerRef.current)
      vaultRetryTimerRef.current = null
    }
    // Only fire once per address per session
    if (activatedRef.current === address) return

    let cancelled = false

    const ensureVaultAccountActive = () => {
      if (vaultActivatedRef.current[address]) return

      fetch('/api/gr/vault/activate-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      })
        .then(async (res) => ({ ok: res.ok, payload: await res.json().catch(() => ({})) }))
        .then(({ ok, payload }) => {
          if (cancelled) return
          const status = String((payload as { status?: string }).status ?? '')
          const done = status === 'activated' || status === 'already_active'

          if (ok && done) {
            vaultActivatedRef.current[address] = true
            vaultRetryAttemptsRef.current[address] = 0
            return
          }

          const attempts = (vaultRetryAttemptsRef.current[address] ?? 0) + 1
          vaultRetryAttemptsRef.current[address] = attempts
          const detail = (payload as { detail?: string; error?: string }).detail
            ?? (payload as { detail?: string; error?: string }).error
            ?? status
            ?? 'unknown_error'

          const shouldRetry = status === 'kyc_required' || !status
          console.warn('[Vault] Account activation warning:', detail)

          if (shouldRetry && attempts < 4) {
            const delayMs = attempts * 1500
            vaultRetryTimerRef.current = window.setTimeout(() => ensureVaultAccountActive(), delayMs)
          }
        })
        .catch((err) => {
          if (cancelled) return
          const attempts = (vaultRetryAttemptsRef.current[address] ?? 0) + 1
          vaultRetryAttemptsRef.current[address] = attempts
          console.warn('[Vault] Account activation failed:', err)
          if (attempts < 4) {
            const delayMs = attempts * 1500
            vaultRetryTimerRef.current = window.setTimeout(() => ensureVaultAccountActive(), delayMs)
          }
        })
    }

    const activate = () => {
      fetch('/api/gr/kyc/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      })
        .then(async (response) => ({ ok: response.ok, payload: await response.json().catch(() => ({})) }))
        .then(data => {
          if (cancelled) return

          const payload = data.payload as { status?: string; txHash?: string; kycLevel?: number; detail?: string }
          const status = payload.status ?? ''
          const isActivated = status === 'activated' || status === 'already_active'

          if (isActivated) {
            activatedRef.current = address
            retryAttemptsRef.current[address] = 0
            void queryClient.invalidateQueries()

            // Vault has a separate account-policy gate. Ensure it is active too.
            ensureVaultAccountActive()

            if (status === 'activated') {
              console.log(`[KYC] Wallet ${address} activated on-chain (tx: ${payload.txHash})`)
            } else {
              console.log(`[KYC] Wallet ${address} already active (kycLevel: ${payload.kycLevel})`)
            }
            return
          }

          if (!data.ok) {
            const attempts = (retryAttemptsRef.current[address] ?? 0) + 1
            retryAttemptsRef.current[address] = attempts
            const retryable = status === 'compliance_lookup_failed' || !status

            console.warn('[KYC] Activation not permitted:', status || payload.detail || 'unknown_error')

            if (retryable && attempts < 4) {
              const delayMs = attempts * 1500
              retryTimerRef.current = window.setTimeout(() => activate(), delayMs)
            }
          }
        })
        .catch(err => {
          if (cancelled) return
          const attempts = (retryAttemptsRef.current[address] ?? 0) + 1
          retryAttemptsRef.current[address] = attempts
          console.warn('[KYC] Auto-activate failed:', err)
          if (attempts < 4) {
            const delayMs = attempts * 1500
            retryTimerRef.current = window.setTimeout(() => activate(), delayMs)
          }
        })
    }

    activate()

    return () => {
      cancelled = true
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
      if (vaultRetryTimerRef.current) {
        window.clearTimeout(vaultRetryTimerRef.current)
        vaultRetryTimerRef.current = null
      }
    }
  }, [address, queryClient])
}
