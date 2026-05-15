'use client'

import { useState } from 'react'
import type { CSSProperties, ChangeEvent, FormEvent } from 'react'
import { useCreateRecipient } from '../hooks/useSaveRecipient'
import type { CreateRecipientRequest } from '../hooks/useSaveRecipient'

type PayoutMethod = 'bank_transfer' | 'mobile_money' | 'crypto_wallet' | 'cash_pickup'

const CORRIDORS = ['US-PH', 'US-NG', 'US-GH', 'US-KE', 'US-MX', 'US-IN']
const PAYOUT_METHODS: Array<{ value: PayoutMethod; label: string }> = [
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'mobile_money', label: 'Mobile Money' },
    { value: 'crypto_wallet', label: 'Crypto Wallet' },
    { value: 'cash_pickup', label: 'Cash Pickup' },
]

interface Props {
    accountId: string
    onSuccess?: (recipientId: string, displayName: string) => void
    onCancel?: () => void
}

type FieldState = Omit<CreateRecipientRequest, 'accountId'>

const EMPTY_FIELDS: FieldState = {
    displayName: '',
    recipientType: 'INDIVIDUAL',
    corridor: 'US-PH',
    payoutMethod: 'bank_transfer',
    recipientName: '',
    recipientPhone: '',
    recipientEmail: '',
    bankCode: '',
    bankName: '',
    accountNumber: '',
    mobileProvider: '',
    mobileNumber: '',
    recipientAddress: '',
    memo: '',
    isDefault: false,
}

export function AddRecipientForm({ accountId, onSuccess, onCancel }: Props) {
    const [fields, setFields] = useState<FieldState>(EMPTY_FIELDS)
    const create = useCreateRecipient()

    function set<K extends keyof FieldState>(key: K, value: FieldState[K]) {
        setFields(prev => ({ ...prev, [key]: value }))
    }

    function onString(key: keyof FieldState) {
        return (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
            set(key, e.target.value as FieldState[typeof key])
    }

    async function handleSubmit(e: FormEvent) {
        e.preventDefault()

        if (!fields.displayName.trim()) return

        const req: CreateRecipientRequest = {
            accountId,
            ...fields,
            displayName: fields.displayName.trim(),
            recipientName: fields.recipientName?.trim() || undefined,
            recipientPhone: fields.recipientPhone?.trim() || undefined,
            recipientEmail: fields.recipientEmail?.trim() || undefined,
            bankCode: fields.bankCode?.trim() || undefined,
            bankName: fields.bankName?.trim() || undefined,
            accountNumber: fields.accountNumber?.trim() || undefined,
            mobileProvider: fields.mobileProvider?.trim() || undefined,
            mobileNumber: fields.mobileNumber?.trim() || undefined,
            recipientAddress: fields.recipientAddress?.trim() || undefined,
            memo: fields.memo?.trim() || undefined,
        }

        try {
            const result = await create.mutateAsync(req)
            setFields(EMPTY_FIELDS)
            onSuccess?.(result.recipientId, result.displayName)
        } catch {
            // error shown via create.error
        }
    }

    const isBankMethod = fields.payoutMethod === 'bank_transfer'
    const isMobileMethod = fields.payoutMethod === 'mobile_money'
    const isCryptoMethod = fields.payoutMethod === 'crypto_wallet'

    return (
        <form style={S.form} onSubmit={handleSubmit} noValidate>
            <div style={S.formTitle}>Add Recipient</div>

            <div style={S.row}>
                <label style={S.label}>Display Name *</label>
                <input
                    style={S.input}
                    type="text"
                    placeholder="e.g. Maria Santos"
                    value={fields.displayName}
                    onChange={onString('displayName')}
                    required
                />
            </div>

            <div style={S.rowGroup}>
                <div style={S.col}>
                    <label style={S.label}>Corridor</label>
                    <select style={S.select} value={fields.corridor} onChange={onString('corridor')}>
                        {CORRIDORS.map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </div>
                <div style={S.col}>
                    <label style={S.label}>Payout Method</label>
                    <select style={S.select} value={fields.payoutMethod} onChange={onString('payoutMethod')}>
                        {PAYOUT_METHODS.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div style={S.rowGroup}>
                <div style={S.col}>
                    <label style={S.label}>Recipient Type</label>
                    <select style={S.select} value={fields.recipientType} onChange={onString('recipientType')}>
                        <option value="INDIVIDUAL">Individual</option>
                        <option value="BUSINESS">Business</option>
                    </select>
                </div>
                <div style={S.col}>
                    <label style={S.label}>Full Name</label>
                    <input
                        style={S.input}
                        type="text"
                        placeholder="Legal name"
                        value={fields.recipientName ?? ''}
                        onChange={onString('recipientName')}
                    />
                </div>
            </div>

            <div style={S.rowGroup}>
                <div style={S.col}>
                    <label style={S.label}>Phone</label>
                    <input
                        style={S.input}
                        type="tel"
                        placeholder="+63 900 000 0000"
                        value={fields.recipientPhone ?? ''}
                        onChange={onString('recipientPhone')}
                    />
                </div>
                <div style={S.col}>
                    <label style={S.label}>Email</label>
                    <input
                        style={S.input}
                        type="email"
                        placeholder="recipient@example.com"
                        value={fields.recipientEmail ?? ''}
                        onChange={onString('recipientEmail')}
                    />
                </div>
            </div>

            {isBankMethod && (
                <>
                    <div style={S.rowGroup}>
                        <div style={S.col}>
                            <label style={S.label}>Bank Name</label>
                            <input
                                style={S.input}
                                type="text"
                                placeholder="BDO, BPI, GCash Bank…"
                                value={fields.bankName ?? ''}
                                onChange={onString('bankName')}
                            />
                        </div>
                        <div style={S.col}>
                            <label style={S.label}>Bank Code / SWIFT</label>
                            <input
                                style={S.input}
                                type="text"
                                placeholder="BNORPHMM"
                                value={fields.bankCode ?? ''}
                                onChange={onString('bankCode')}
                            />
                        </div>
                    </div>
                    <div style={S.row}>
                        <label style={S.label}>Account Number</label>
                        <input
                            style={S.input}
                            type="text"
                            placeholder="1234567890"
                            value={fields.accountNumber ?? ''}
                            onChange={onString('accountNumber')}
                        />
                    </div>
                </>
            )}

            {isMobileMethod && (
                <div style={S.rowGroup}>
                    <div style={S.col}>
                        <label style={S.label}>Mobile Provider</label>
                        <input
                            style={S.input}
                            type="text"
                            placeholder="GCash, M-Pesa…"
                            value={fields.mobileProvider ?? ''}
                            onChange={onString('mobileProvider')}
                        />
                    </div>
                    <div style={S.col}>
                        <label style={S.label}>Mobile Number</label>
                        <input
                            style={S.input}
                            type="tel"
                            placeholder="+63 917 000 0000"
                            value={fields.mobileNumber ?? ''}
                            onChange={onString('mobileNumber')}
                        />
                    </div>
                </div>
            )}

            {isCryptoMethod && (
                <div style={S.row}>
                    <label style={S.label}>Wallet Address</label>
                    <input
                        style={S.input}
                        type="text"
                        placeholder="0x…"
                        value={fields.recipientAddress ?? ''}
                        onChange={onString('recipientAddress')}
                    />
                </div>
            )}

            <div style={S.row}>
                <label style={S.label}>Memo (optional)</label>
                <input
                    style={S.input}
                    type="text"
                    placeholder="Family support, rent…"
                    value={fields.memo ?? ''}
                    onChange={onString('memo')}
                />
            </div>

            <div style={S.checkRow}>
                <input
                    id="is-default"
                    type="checkbox"
                    checked={Boolean(fields.isDefault)}
                    onChange={e => set('isDefault', e.target.checked)}
                    style={{ accentColor: '#C9A84C' }}
                />
                <label htmlFor="is-default" style={S.checkLabel}>
                    Set as default for this corridor
                </label>
            </div>

            {create.isError && (
                <div style={S.error}>
                    {create.error?.message ?? 'Failed to save recipient. Try again.'}
                </div>
            )}

            <div style={S.buttonRow}>
                {onCancel && (
                    <button
                        type="button"
                        style={S.cancelBtn}
                        onClick={onCancel}
                        disabled={create.isPending}
                    >
                        Cancel
                    </button>
                )}
                <button
                    type="submit"
                    style={create.isPending ? { ...S.submitBtn, opacity: 0.6 } : S.submitBtn}
                    disabled={create.isPending || !fields.displayName.trim()}
                >
                    {create.isPending ? 'Saving…' : 'Save Recipient'}
                </button>
            </div>
        </form>
    )
}

const S: Record<string, CSSProperties> = {
    form: {
        background: '#12141C',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    formTitle: {
        fontFamily: 'JetBrains Mono, monospace',
        color: '#C9A84C',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    row: {
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    rowGroup: {
        display: 'flex',
        gap: 10,
    },
    col: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    label: {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
        color: '#6E6A64',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
    },
    input: {
        background: '#1A1D25',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 6,
        color: '#F0EDE8',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 12,
        padding: '8px 10px',
        outline: 'none',
        width: '100%',
        boxSizing: 'border-box' as const,
    },
    select: {
        background: '#1A1D25',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 6,
        color: '#F0EDE8',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 12,
        padding: '8px 10px',
        outline: 'none',
        width: '100%',
        boxSizing: 'border-box' as const,
    },
    checkRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    checkLabel: {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        color: '#A8A49E',
    },
    error: {
        border: '1px solid rgba(224,64,64,0.25)',
        background: 'rgba(224,64,64,0.10)',
        color: '#E04040',
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace',
    },
    buttonRow: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 8,
        marginTop: 4,
    },
    cancelBtn: {
        background: 'transparent',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 6,
        color: '#A8A49E',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        padding: '8px 16px',
        cursor: 'pointer',
        letterSpacing: '0.05em',
    },
    submitBtn: {
        background: '#C9A84C',
        border: 'none',
        borderRadius: 6,
        color: '#0a0604',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        fontWeight: 700,
        padding: '8px 20px',
        cursor: 'pointer',
        letterSpacing: '0.06em',
    },
}
