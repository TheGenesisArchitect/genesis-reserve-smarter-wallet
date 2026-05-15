'use client'

import { useEffect, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { formatUnits, parseUnits } from 'viem'
import { useUpdateScheduledSend } from '../../hooks/useScheduledSends'
import type { ScheduledSend, ScheduledSendFrequency } from '../../lib/bff.types'

export function EditScheduledForm({
    item,
    onClose,
}: {
    item: ScheduledSend | null
    onClose: () => void
}) {
    const updateMutation = useUpdateScheduledSend()
    const [recipient, setRecipient] = useState('')
    const [amount, setAmount] = useState('')
    const [frequency, setFrequency] = useState<ScheduledSendFrequency>('WEEKLY')
    const [corridor, setCorridor] = useState('US-PH')
    const [payoutMethod, setPayoutMethod] = useState('BANK')
    const [memo, setMemo] = useState('')

    useEffect(() => {
        if (!item) return
        setRecipient(item.recipient)
        setAmount(Number(formatUnits(BigInt(item.amount), 6)).toFixed(2))
        setFrequency(item.frequency)
        setCorridor(item.corridor)
        setPayoutMethod(item.payoutMethod)
        setMemo(item.memo || '')
    }, [item])

    if (!item) return null

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        await updateMutation.mutateAsync({
            id: item.id,
            recipient,
            amount: parseUnits(amount || '0', 6).toString(),
            frequency,
            corridor,
            payoutMethod,
            memo: memo.trim() || undefined,
        })
        onClose()
    }

    return (
        <div style={S.overlay} role="dialog" aria-modal="true" aria-label="Edit scheduled send">
            <form style={S.modal} onSubmit={submit}>
                <div style={S.title}>Edit Scheduled Send</div>
                <div style={S.grid}>
                    <label style={S.field}>
                        <span style={S.label}>Recipient</span>
                        <input style={S.input} value={recipient} onChange={(e) => setRecipient(e.target.value)} />
                    </label>
                    <label style={S.field}>
                        <span style={S.label}>Amount</span>
                        <input style={S.input} type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                    </label>
                    <label style={S.field}>
                        <span style={S.label}>Frequency</span>
                        <select style={S.input} value={frequency} onChange={(e) => setFrequency(e.target.value as ScheduledSendFrequency)}>
                            <option value="DAILY">Daily</option>
                            <option value="WEEKLY">Weekly</option>
                            <option value="MONTHLY">Monthly</option>
                        </select>
                    </label>
                    <label style={S.field}>
                        <span style={S.label}>Payout Method</span>
                        <select style={S.input} value={payoutMethod} onChange={(e) => setPayoutMethod(e.target.value)}>
                            <option value="BANK">Bank</option>
                            <option value="MOBILE_MONEY">Mobile Money</option>
                            <option value="CASH">Cash Pickup</option>
                        </select>
                    </label>
                    <label style={S.field}>
                        <span style={S.label}>Corridor</span>
                        <select style={S.input} value={corridor} onChange={(e) => setCorridor(e.target.value)}>
                            <option value="US-PH">US → PH</option>
                            <option value="US-NG">US → NG</option>
                            <option value="US-IN">US → IN</option>
                            <option value="US-MX">US → MX</option>
                        </select>
                    </label>
                    <label style={{ ...S.field, gridColumn: '1 / -1' }}>
                        <span style={S.label}>Memo</span>
                        <input style={S.input} value={memo} onChange={(e) => setMemo(e.target.value)} />
                    </label>
                </div>
                {updateMutation.error && <div style={S.error}>{updateMutation.error instanceof Error ? updateMutation.error.message : 'Update failed.'}</div>}
                <div style={S.actions}>
                    <button type="button" style={S.secondaryBtn} onClick={onClose}>Close</button>
                    <button type="submit" style={S.primaryBtn} disabled={updateMutation.isPending}>
                        {updateMutation.isPending ? 'Saving…' : 'Save changes'}
                    </button>
                </div>
            </form>
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
        zIndex: 50,
    },
    modal: {
        width: 'min(640px, 100%)',
        background: '#11131B',
        border: '1px solid rgba(201,168,76,0.16)',
        borderRadius: 14,
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
    },
    title: { fontSize: 18, fontWeight: 700, color: '#F0EDE8' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 },
    field: { display: 'flex', flexDirection: 'column', gap: 6 },
    label: { fontSize: 11, color: '#C9A84C', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em' },
    input: { background: '#0F1218', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#F0EDE8', padding: '10px 12px' },
    actions: { display: 'flex', justifyContent: 'flex-end', gap: 10 },
    secondaryBtn: { borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: '#1F2430', color: '#E5E7EB', padding: '10px 12px', cursor: 'pointer' },
    primaryBtn: { borderRadius: 8, border: 'none', background: '#C9A84C', color: '#11131B', padding: '10px 12px', fontWeight: 700, cursor: 'pointer' },
    error: { color: '#f87171', fontSize: 12 },
}
