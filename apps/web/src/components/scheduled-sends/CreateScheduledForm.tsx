'use client'

import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { parseUnits } from 'viem'
import { useCreateScheduledSend } from '../../hooks/useScheduledSends'
import type { ScheduledSendFrequency } from '../../lib/bff.types'

const INITIAL = {
    recipient: '',
    amount: '',
    frequency: 'WEEKLY' as ScheduledSendFrequency,
    payoutMethod: 'BANK',
    corridor: 'US-PH',
    memo: '',
}

export function CreateScheduledForm({ accountId }: { accountId?: string }) {
    const createMutation = useCreateScheduledSend()
    const [form, setForm] = useState(INITIAL)

    const canSubmit = useMemo(() => {
        return Boolean(accountId && form.recipient.trim() && Number(form.amount) > 0)
    }, [accountId, form])

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!canSubmit) return

        await createMutation.mutateAsync({
            accountId,
            recipient: form.recipient.trim(),
            amount: parseUnits(form.amount || '0', 6).toString(),
            frequency: form.frequency,
            payoutMethod: form.payoutMethod,
            corridor: form.corridor,
            memo: form.memo.trim() || undefined,
        })

        setForm(INITIAL)
    }

    return (
        <form style={S.form} onSubmit={submit}>
            <div style={S.header}>
                <div>
                    <div style={S.title}>Create Scheduled Send</div>
                    <div style={S.sub}>Frequency, amount, recipient, and payout routing.</div>
                </div>
            </div>

            <div style={S.grid}>
                <label style={S.field}>
                    <span style={S.label}>Recipient</span>
                    <input style={S.input} value={form.recipient} onChange={(e) => setForm((s) => ({ ...s, recipient: e.target.value }))} placeholder="ops@partner-payroll" />
                </label>
                <label style={S.field}>
                    <span style={S.label}>Amount (USDC)</span>
                    <input style={S.input} type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((s) => ({ ...s, amount: e.target.value }))} placeholder="250.00" />
                </label>
                <label style={S.field}>
                    <span style={S.label}>Frequency</span>
                    <select style={S.input} value={form.frequency} onChange={(e) => setForm((s) => ({ ...s, frequency: e.target.value as ScheduledSendFrequency }))}>
                        <option value="DAILY">Daily</option>
                        <option value="WEEKLY">Weekly</option>
                        <option value="MONTHLY">Monthly</option>
                    </select>
                </label>
                <label style={S.field}>
                    <span style={S.label}>Payout Method</span>
                    <select style={S.input} value={form.payoutMethod} onChange={(e) => setForm((s) => ({ ...s, payoutMethod: e.target.value }))}>
                        <option value="BANK">Bank</option>
                        <option value="MOBILE_MONEY">Mobile Money</option>
                        <option value="CASH">Cash Pickup</option>
                    </select>
                </label>
                <label style={S.field}>
                    <span style={S.label}>Corridor</span>
                    <select style={S.input} value={form.corridor} onChange={(e) => setForm((s) => ({ ...s, corridor: e.target.value }))}>
                        <option value="US-PH">US → PH</option>
                        <option value="US-NG">US → NG</option>
                        <option value="US-IN">US → IN</option>
                        <option value="US-MX">US → MX</option>
                    </select>
                </label>
                <label style={{ ...S.field, gridColumn: '1 / -1' }}>
                    <span style={S.label}>Memo</span>
                    <input style={S.input} value={form.memo} onChange={(e) => setForm((s) => ({ ...s, memo: e.target.value }))} placeholder="Payroll reserve for Fridays" />
                </label>
            </div>

            {!accountId && <div style={S.error}>Resolve an account before creating scheduled sends.</div>}
            {createMutation.error && <div style={S.error}>{createMutation.error instanceof Error ? createMutation.error.message : 'Unable to create scheduled send.'}</div>}

            <button type="submit" style={{ ...S.button, opacity: canSubmit ? 1 : 0.5 }} disabled={!canSubmit || createMutation.isPending}>
                {createMutation.isPending ? 'Creating…' : 'Create schedule'}
            </button>
        </form>
    )
}

const S: Record<string, CSSProperties> = {
    form: {
        background: '#161821',
        border: '1px solid rgba(201,168,76,0.16)',
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
    },
    header: { display: 'flex', justifyContent: 'space-between', gap: 12 },
    title: { fontSize: 16, fontWeight: 700, color: '#F0EDE8' },
    sub: { fontSize: 12, color: '#9CA3AF' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
    field: { display: 'flex', flexDirection: 'column', gap: 6 },
    label: { fontSize: 11, color: '#C9A84C', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em' },
    input: {
        background: '#0F1218',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        color: '#F0EDE8',
        padding: '10px 12px',
        outline: 'none',
    },
    button: {
        alignSelf: 'flex-start',
        background: '#C9A84C',
        color: '#11131B',
        border: 'none',
        borderRadius: 8,
        padding: '11px 14px',
        fontWeight: 700,
        cursor: 'pointer',
    },
    error: {
        color: '#f87171',
        fontSize: 12,
    },
}
