'use client'

import { useState } from 'react'
import type { CSSProperties } from 'react'
import { CreateScheduledForm } from './scheduled-sends/CreateScheduledForm'
import { ScheduledSendsList } from './scheduled-sends/ScheduledSendsList'
import { EditScheduledForm } from './scheduled-sends/EditScheduledForm'
import { ConfirmCancelModal } from './scheduled-sends/ConfirmCancelModal'
import {
    useCancelScheduledSend,
    useScheduledSends,
    useUpdateScheduledSend,
} from '../hooks/useScheduledSends'
import type { ScheduledSend } from '../lib/bff.types'

export function ScheduledSendsPanel({ accountId }: { accountId?: string }) {
    const { data, isLoading, error } = useScheduledSends(accountId)
    const updateMutation = useUpdateScheduledSend()
    const cancelMutation = useCancelScheduledSend()
    const [editing, setEditing] = useState<ScheduledSend | null>(null)
    const [pendingCancel, setPendingCancel] = useState<ScheduledSend | null>(null)
    const [busyId, setBusyId] = useState<string | null>(null)

    const togglePause = async (item: ScheduledSend) => {
        setBusyId(item.id)
        try {
            await updateMutation.mutateAsync({
                id: item.id,
                status: item.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED',
            })
        } finally {
            setBusyId(null)
        }
    }

    const confirmCancel = async () => {
        if (!pendingCancel) return
        setBusyId(pendingCancel.id)
        try {
            await cancelMutation.mutateAsync({
                id: pendingCancel.id,
                accountId: pendingCancel.accountId,
            })
            setPendingCancel(null)
        } finally {
            setBusyId(null)
        }
    }

    return (
        <div style={S.root}>
            <CreateScheduledForm accountId={accountId} />

            <section style={S.section}>
                <div style={S.sectionHeader}>
                    <div>
                        <div style={S.sectionTitle}>Scheduled Sends</div>
                        <div style={S.sectionSub}>Pause, resume, edit, or cancel recurring payouts.</div>
                    </div>
                </div>

                {!accountId ? (
                    <div style={S.empty}>Resolve an account to manage schedules.</div>
                ) : isLoading ? (
                    <div style={S.empty}>Loading scheduled sends…</div>
                ) : error ? (
                    <div style={S.error}>Unable to load scheduled sends.</div>
                ) : (
                    <ScheduledSendsList
                        items={data?.items ?? []}
                        busyId={busyId}
                        onEdit={setEditing}
                        onTogglePause={togglePause}
                        onCancel={setPendingCancel}
                    />
                )}
            </section>

            <EditScheduledForm item={editing} onClose={() => setEditing(null)} />
            <ConfirmCancelModal item={pendingCancel} isPending={cancelMutation.isPending} onConfirm={confirmCancel} onClose={() => setPendingCancel(null)} />
        </div>
    )
}

const S: Record<string, CSSProperties> = {
    root: {
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
    },
    section: {
        background: '#11131B',
        border: '1px solid rgba(201,168,76,0.14)',
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
    },
    sectionHeader: { display: 'flex', justifyContent: 'space-between', gap: 12 },
    sectionTitle: { fontSize: 16, fontWeight: 700, color: '#F0EDE8' },
    sectionSub: { fontSize: 12, color: '#9CA3AF' },
    empty: { color: '#9CA3AF', padding: '18px 4px' },
    error: { color: '#f87171', padding: '18px 4px' },
}
