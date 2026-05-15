'use client'

import type { CSSProperties } from 'react'
import { formatUnits } from 'viem'
import type { ScheduledSend } from '../../lib/bff.types'

export function ConfirmCancelModal({
    item,
    isPending,
    onConfirm,
    onClose,
}: {
    item: ScheduledSend | null
    isPending?: boolean
    onConfirm: () => void
    onClose: () => void
}) {
    if (!item) return null

    return (
        <div style={S.overlay} role="dialog" aria-modal="true" aria-label="Cancel scheduled send">
            <div style={S.modal}>
                <div style={S.title}>Cancel scheduled send?</div>
                <div style={S.body}>
                    This will stop future executions for <strong>{item.recipient}</strong> and cancel the {item.frequency.toLowerCase()} {Number(formatUnits(BigInt(item.amount), 6)).toFixed(2)} USDC schedule.
                </div>
                <div style={S.actions}>
                    <button type="button" style={S.secondaryBtn} onClick={onClose}>Keep schedule</button>
                    <button type="button" style={S.dangerBtn} onClick={onConfirm} disabled={isPending}>
                        {isPending ? 'Cancelling…' : 'Confirm cancel'}
                    </button>
                </div>
            </div>
        </div>
    )
}

const S: Record<string, CSSProperties> = {
    overlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        zIndex: 60,
    },
    modal: {
        width: 'min(440px, 100%)',
        background: '#11131B',
        border: '1px solid rgba(248,113,113,0.25)',
        borderRadius: 14,
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    title: { fontSize: 18, fontWeight: 700, color: '#F0EDE8' },
    body: { fontSize: 14, color: '#D1D5DB', lineHeight: 1.5 },
    actions: { display: 'flex', justifyContent: 'flex-end', gap: 10 },
    secondaryBtn: { borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: '#1F2430', color: '#E5E7EB', padding: '10px 12px', cursor: 'pointer' },
    dangerBtn: { borderRadius: 8, border: '1px solid rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.12)', color: '#f87171', padding: '10px 12px', fontWeight: 700, cursor: 'pointer' },
}
