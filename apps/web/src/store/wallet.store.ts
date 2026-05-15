// ─────────────────────────────────────────────────────────────────────────────
// genesis-privy/src/store/wallet.store.ts
//
// Global state for flows that span multiple components:
//   - Deposit / Withdraw multi-step wizard
//   - Send / Remittance flow with reservation tracking
//   - UI overlay state (which sheet is open)
//
// Zustand is intentionally minimal — only global UI-crossing state lives here.
// Per-component local state (input values, focus) stays in useState.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// ── Transaction flow types ────────────────────────────────────────────────────

export type TxStep =
  | 'idle'
  | 'approving'
  | 'depositing'
  | 'withdrawing'
  | 'reserving'
  | 'finalizing'
  | 'confirming'
  | 'success'
  | 'error'

export type ActiveSheet =
  | null
  | 'deposit'
  | 'withdraw'
  | 'send'
  | 'receive'
  | 'compliance'
  | 'settings'

// ── Store shape ───────────────────────────────────────────────────────────────

interface WalletStore {
  // ── UI State ────────────────────────────────────────────────────────────────
  activeSheet:      ActiveSheet
  setActiveSheet:   (sheet: ActiveSheet) => void

  // ── Transaction State ────────────────────────────────────────────────────────
  txStep:           TxStep
  txHash:           string | null
  txError:          string | null
  setTxStep:        (step: TxStep) => void
  setTxHash:        (hash: string | null) => void
  setTxError:       (error: string | null) => void
  resetTx:          () => void

  // ── Send Flow State (persisted across remittance steps) ───────────────────
  sendAmount:       string
  sendRecipient:    string
  sendMemo:         string
  reservationId:    string | null
  setSendAmount:    (v: string) => void
  setSendRecipient: (v: string) => void
  setSendMemo:      (v: string) => void
  setReservationId: (id: string | null) => void
  resetSendFlow:    () => void

  // ── Notification State ────────────────────────────────────────────────────
  toasts: Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>
  addToast:  (message: string, type?: 'success' | 'error' | 'info') => void
  removeToast: (id: string) => void
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useWalletStore = create<WalletStore>()(
  persist(
    (set, get) => ({
      // UI
      activeSheet:    null,
      setActiveSheet: (sheet) => set({ activeSheet: sheet }),

      // Transaction
      txStep:    'idle',
      txHash:    null,
      txError:   null,
      setTxStep:  (step)  => set({ txStep: step }),
      setTxHash:  (hash)  => set({ txHash: hash }),
      setTxError: (error) => set({ txError: error }),
      resetTx: () => set({ txStep: 'idle', txHash: null, txError: null }),

      // Send flow
      sendAmount:    '',
      sendRecipient: '',
      sendMemo:      '',
      reservationId: null,
      setSendAmount:    (v)  => set({ sendAmount: v }),
      setSendRecipient: (v)  => set({ sendRecipient: v }),
      setSendMemo:      (v)  => set({ sendMemo: v }),
      setReservationId: (id) => set({ reservationId: id }),
      resetSendFlow: () => set({
        sendAmount: '', sendRecipient: '', sendMemo: '', reservationId: null
      }),

      // Toasts
      toasts: [],
      addToast: (message, type = 'info') => {
        const id = Date.now().toString()
        set(s => ({ toasts: [...s.toasts, { id, message, type }] }))
        // Auto-remove after 5 seconds
        setTimeout(() => get().removeToast(id), 5000)
      },
      removeToast: (id) =>
        set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
    }),
    {
      name:    'genesis-wallet-store',
      storage: createJSONStorage(() => sessionStorage), // session only — never persist tx state to localStorage
      partialize: (s) => ({
        // Only persist send flow in-progress state
        sendAmount:    s.sendAmount,
        sendRecipient: s.sendRecipient,
        sendMemo:      s.sendMemo,
        reservationId: s.reservationId,
      }),
    }
  )
)
