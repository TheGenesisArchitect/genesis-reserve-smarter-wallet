import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '../_lib/card-db'

export interface NotificationPrefs {
    depositAlerts: boolean
    sendAlerts: boolean
    cashoutAlerts: boolean
    securityAlerts: boolean
    marketing: boolean
}

const DEFAULTS: NotificationPrefs = {
    depositAlerts: true,
    sendAlerts: true,
    cashoutAlerts: true,
    securityAlerts: true,
    marketing: false,
}

async function ensureTable() {
    const pool = getPool()
    if (!pool) return
    await pool.query(`
        CREATE TABLE IF NOT EXISTS notification_preferences (
            account_id      TEXT PRIMARY KEY,
            deposit_alerts  BOOLEAN NOT NULL DEFAULT true,
            send_alerts     BOOLEAN NOT NULL DEFAULT true,
            cashout_alerts  BOOLEAN NOT NULL DEFAULT true,
            security_alerts BOOLEAN NOT NULL DEFAULT true,
            marketing       BOOLEAN NOT NULL DEFAULT false,
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `)
}

function rowToPrefs(r: Record<string, unknown>): NotificationPrefs {
    return {
        depositAlerts: Boolean(r.deposit_alerts),
        sendAlerts: Boolean(r.send_alerts),
        cashoutAlerts: Boolean(r.cashout_alerts),
        securityAlerts: Boolean(r.security_alerts),
        marketing: Boolean(r.marketing),
    }
}

export async function GET(request: NextRequest) {
    const accountId = request.nextUrl.searchParams.get('accountId')
    if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 })

    const pool = getPool()
    if (!pool) return NextResponse.json({ data: DEFAULTS })

    try {
        await ensureTable()
        const { rows } = await pool.query(
            'SELECT * FROM notification_preferences WHERE account_id = $1',
            [accountId.toLowerCase()]
        )
        return NextResponse.json({ data: rows[0] ? rowToPrefs(rows[0]) : DEFAULTS })
    } catch {
        return NextResponse.json({ data: DEFAULTS })
    }
}

export async function PATCH(request: NextRequest) {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const accountId = body.accountId as string | undefined
    if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 })

    const pool = getPool()
    if (!pool) {
        return NextResponse.json({ data: { ...DEFAULTS, ...body, accountId: undefined } })
    }

    try {
        await ensureTable()
        const { rows } = await pool.query(`
            INSERT INTO notification_preferences
                (account_id, deposit_alerts, send_alerts, cashout_alerts, security_alerts, marketing, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (account_id) DO UPDATE SET
                deposit_alerts  = COALESCE($2, notification_preferences.deposit_alerts),
                send_alerts     = COALESCE($3, notification_preferences.send_alerts),
                cashout_alerts  = COALESCE($4, notification_preferences.cashout_alerts),
                security_alerts = COALESCE($5, notification_preferences.security_alerts),
                marketing       = COALESCE($6, notification_preferences.marketing),
                updated_at      = NOW()
            RETURNING *
        `, [
            accountId.toLowerCase(),
            body.depositAlerts ?? null,
            body.sendAlerts ?? null,
            body.cashoutAlerts ?? null,
            body.securityAlerts ?? null,
            body.marketing ?? null,
        ])
        return NextResponse.json({ data: rowToPrefs(rows[0]) })
    } catch {
        return NextResponse.json({ error: 'db_error' }, { status: 500 })
    }
}
