import { query } from '../config/db'

export interface AdminStatCard {
    key: string;
    label: string;
    value: string;
    delta?: string;
}

export interface AdminUserSummary {
    userId: string;
    displayName: string;
    initials: string;
    kycTier: 'BASIC' | 'ENHANCED' | 'INSTITUTIONAL';
    status: 'ACTIVE' | 'PENDING' | 'RESTRICTED';
    volumeUsdc: string;
}

export interface AdminFeatureFlag {
    key: string;
    label: string;
    description: string;
    enabled: boolean;
}

export interface AdminQueueItem {
    id: string;
    category: string;
    subject: string;
    amountUsdc?: string;
    ageLabel: string;
    status: 'PENDING' | 'REVIEW' | 'AWAITING' | 'ESCALATED';
}

function formatDelta(current: number, previous: number, suffix = ''): string | undefined {
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return undefined
    const pct = ((current - previous) / previous) * 100
    const sign = pct > 0 ? '+' : ''
    return `${sign}${pct.toFixed(1)}%${suffix}`
}

function formatCurrencyFromMicros(raw: string | number | null | undefined): string {
    const value = Number(raw || 0) / 1_000_000
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function statusToAdminStatus(status: string | null | undefined): 'ACTIVE' | 'PENDING' | 'RESTRICTED' {
    if (status === 'ACTIVE') return 'ACTIVE'
    if (status === 'PENDING') return 'PENDING'
    return 'RESTRICTED'
}

function kycLevelToTier(level: number | null | undefined): 'BASIC' | 'ENHANCED' | 'INSTITUTIONAL' {
    if ((level || 0) >= 2) return 'INSTITUTIONAL'
    if ((level || 0) >= 1) return 'ENHANCED'
    return 'BASIC'
}

function initialsFromDisplayName(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || '')
        .join('') || 'NA'
}

function ageLabel(date: Date | string | null | undefined): string {
    if (!date) return 'just now'
    const ts = new Date(date).getTime()
    const diffMs = Math.max(0, Date.now() - ts)
    const minutes = Math.floor(diffMs / 60_000)
    if (minutes < 60) return `${Math.max(1, minutes)}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
}

export class AdminService {
    async getStats(): Promise<AdminStatCard[]> {
        const [currentUsers, previousUsers, currentOrders, previousOrders, yieldTotals, failedOrders] = await Promise.all([
            query<{ count: string }>(
                `SELECT COUNT(*)::text AS count
         FROM users
         WHERE status = 'ACTIVE'`
            ),
            query<{ count: string }>(
                `SELECT COUNT(*)::text AS count
         FROM users
         WHERE status = 'ACTIVE' AND created_at < NOW() - INTERVAL '7 days'`
            ),
            query<{ count: string; volume: string }>(
                `SELECT COUNT(*)::text AS count, COALESCE(SUM(send_amount), 0)::text AS volume
         FROM remittance_orders
         WHERE created_at >= NOW() - INTERVAL '30 days'`
            ),
            query<{ count: string; volume: string }>(
                `SELECT COUNT(*)::text AS count, COALESCE(SUM(send_amount), 0)::text AS volume
         FROM remittance_orders
         WHERE created_at >= NOW() - INTERVAL '60 days'
           AND created_at < NOW() - INTERVAL '30 days'`
            ),
            query<{ total: string; current_total: string; previous_total: string }>(
                `SELECT
           COALESCE(SUM(amount), 0)::text AS total,
           COALESCE(SUM(amount) FILTER (WHERE accrued_at >= NOW() - INTERVAL '30 days'), 0)::text AS current_total,
           COALESCE(SUM(amount) FILTER (WHERE accrued_at >= NOW() - INTERVAL '60 days' AND accrued_at < NOW() - INTERVAL '30 days'), 0)::text AS previous_total
         FROM yield_accruals`
            ),
            query<{ failed_count: string; total_count: string }>(
                `SELECT
           COUNT(*) FILTER (WHERE status = 'FAILED')::text AS failed_count,
           COUNT(*)::text AS total_count
         FROM remittance_orders
         WHERE created_at >= NOW() - INTERVAL '30 days'`
            ),
        ])

        const activeUsers = Number(currentUsers.rows[0]?.count || 0)
        const priorActiveUsers = Number(previousUsers.rows[0]?.count || 0)

        const currentOrderCount = Number(currentOrders.rows[0]?.count || 0)
        const previousOrderCount = Number(previousOrders.rows[0]?.count || 0)
        const currentVolume = currentOrders.rows[0]?.volume || '0'

        const currentYield = Number(yieldTotals.rows[0]?.current_total || 0)
        const previousYield = Number(yieldTotals.rows[0]?.previous_total || 0)

        const failedCount = Number(failedOrders.rows[0]?.failed_count || 0)
        const totalCount = Number(failedOrders.rows[0]?.total_count || 0)
        const errorRate = totalCount > 0 ? (failedCount / totalCount) * 100 : 0

        return [
            {
                key: 'active_users',
                label: 'Active Users',
                value: activeUsers.toLocaleString(),
                delta: formatDelta(activeUsers, priorActiveUsers),
            },
            {
                key: 'tx_volume',
                label: 'Transaction Volume',
                value: formatCurrencyFromMicros(currentVolume),
                delta: formatDelta(Number(currentVolume), Number(previousOrders.rows[0]?.volume || 0)),
            },
            {
                key: 'yield_generated',
                label: 'Yield Generated',
                value: formatCurrencyFromMicros(yieldTotals.rows[0]?.current_total || '0'),
                delta: formatDelta(currentYield, previousYield),
            },
            {
                key: 'error_rate',
                label: 'Error Rate',
                value: `${errorRate.toFixed(2)}%`,
                delta: currentOrderCount > previousOrderCount ? undefined : undefined,
            },
        ]
    }

    async getUsers(limit = 8): Promise<AdminUserSummary[]> {
        const result = await query<{
            user_id: string;
            status: string;
            account_id: string | null;
            kyc_level: number | null;
            volume_usdc: string;
        }>(
            `SELECT
         u.user_id,
         u.status,
         ta.account_id,
         MAX(COALESCE(ic.kyc_level, ta.kyc_level, 0))::int AS kyc_level,
         COALESCE(SUM(ro.send_amount), 0)::text AS volume_usdc
       FROM users u
       LEFT JOIN treasury_accounts ta ON ta.owner_id = u.user_id
       LEFT JOIN identity_cases ic ON ic.user_id = u.user_id
       LEFT JOIN remittance_orders ro ON ro.account_id = ta.account_id
       GROUP BY u.user_id, u.status, ta.account_id
       ORDER BY MAX(COALESCE(ro.updated_at, ta.updated_at, u.updated_at)) DESC NULLS LAST, u.created_at DESC
       LIMIT $1`,
            [limit]
        )

        return result.rows.map((row) => {
            const displayName = row.account_id || row.user_id
            return {
                userId: row.user_id,
                displayName,
                initials: initialsFromDisplayName(displayName.replace(/[-_]/g, ' ')),
                kycTier: kycLevelToTier(row.kyc_level),
                status: statusToAdminStatus(row.status),
                volumeUsdc: row.volume_usdc || '0',
            }
        })
    }

    async getFeatureFlags(): Promise<AdminFeatureFlag[]> {
        const result = await query<{
            flag_key: string;
            label: string;
            description: string;
            enabled: boolean;
        }>(
            `SELECT DISTINCT ON (flag_key)
         flag_key,
         label,
         description,
         enabled
       FROM partner_feature_flags
       ORDER BY flag_key, partner_id NULLS FIRST, updated_at DESC`
        )

        return result.rows.map((row) => ({
            key: row.flag_key,
            label: row.label,
            description: row.description,
            enabled: row.enabled,
        }))
    }

    async getQueue(limit = 10): Promise<AdminQueueItem[]> {
        const result = await query<{
            queue_id: string;
            category: string;
            subject: string;
            amount_usdc: string | null;
            status: 'PENDING' | 'REVIEW' | 'AWAITING' | 'ESCALATED';
            created_at: Date;
        }>(
            `SELECT queue_id, category, subject, amount_usdc::text, status, created_at
       FROM support_queue
       WHERE status IN ('PENDING', 'REVIEW', 'AWAITING', 'ESCALATED')
       ORDER BY priority DESC, created_at ASC
       LIMIT $1`,
            [limit]
        )

        return result.rows.map((row) => ({
            id: row.queue_id,
            category: row.category,
            subject: row.subject,
            amountUsdc: row.amount_usdc || undefined,
            ageLabel: ageLabel(row.created_at),
            status: row.status,
        }))
    }
}
