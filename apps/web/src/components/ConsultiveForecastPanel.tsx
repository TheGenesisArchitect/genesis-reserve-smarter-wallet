'use client'

import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import {
    calculateCorridorCosts,
    calculateForecast,
    calculateOnboardingImpact,
    buildPerformanceComparison,
    buildUserBalanceProjection,
    calculateBreakEven,
    CORRIDOR_RATES,
    type Corridor,
    type Horizon,
    type TierKey,
} from '../lib/consultive'

const money = (value: number, fraction = 2) => `$${value.toLocaleString(undefined, { maximumFractionDigits: fraction, minimumFractionDigits: fraction })}`
const pct = (value: number, digits = 2) => `${(value * 100).toFixed(digits)}%`
const compactMoney = (value: number) => `$${new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value)}`

const SCENARIOS = {
    canary: {
        label: 'Canary Partner',
        principal: 50_000,
        users: 350,
        avgBalance: 140,
        monthlyInflow: 8_000,
        monthlyNewUsers: 45,
        monthlyChurnWith: 0.02,
        monthlyChurnWithout: 0.045,
    },
    growth: {
        label: 'Growth Partner',
        principal: 250_000,
        users: 1200,
        avgBalance: 220,
        monthlyInflow: 20_000,
        monthlyNewUsers: 180,
        monthlyChurnWith: 0.018,
        monthlyChurnWithout: 0.042,
    },
    enterprise: {
        label: 'Enterprise Partner',
        principal: 1_250_000,
        users: 6200,
        avgBalance: 410,
        monthlyInflow: 85_000,
        monthlyNewUsers: 720,
        monthlyChurnWith: 0.012,
        monthlyChurnWithout: 0.03,
    },
} as const

interface AumCurvePoint {
    month: number
    withGenesis: number
    withoutGenesis: number
}

function AumCurveChart({ points, milestones }: { points: AumCurvePoint[]; milestones: number[] }) {
    const W = 760
    const H = 250
    const PAD_L = 64
    const PAD_R = 20
    const PAD_T = 20
    const PAD_B = 34
    const maxSeries = Math.max(...points.map((p) => Math.max(p.withGenesis, p.withoutGenesis)), 1)
    const max = Math.max(maxSeries, ...milestones, 1)

    const toX = (index: number) => PAD_L + (index / Math.max(1, points.length - 1)) * (W - PAD_L - PAD_R)
    const toY = (value: number) => H - PAD_B - (value / max) * (H - PAD_T - PAD_B)

    const withPath = points
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.withGenesis).toFixed(1)}`)
        .join(' ')

    const withoutPath = points
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.withoutGenesis).toFixed(1)}`)
        .join(' ')

    const liftArea = [
        ...points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.withGenesis).toFixed(1)}`),
        ...points.slice().reverse().map((p, i) => `${i === 0 ? 'L' : 'L'}${toX(points.length - 1 - i).toFixed(1)},${toY(p.withoutGenesis).toFixed(1)}`),
        'Z',
    ].join(' ')

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => max * t)

    return (
        <svg viewBox={`0 0 ${W} ${H}`} style={S.chartSvg}>
            {yTicks.map((tick) => {
                const y = toY(tick)
                return (
                    <g key={`tick-${tick}`}>
                        <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
                        <text x={PAD_L - 8} y={y + 4} textAnchor="end" style={{ fill: '#5A5650', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                            {compactMoney(tick)}
                        </text>
                    </g>
                )
            })}

            {milestones.filter((m) => m <= max * 1.05).map((m) => {
                const y = toY(m)
                return (
                    <g key={`milestone-${m}`}>
                        <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="rgba(201,168,76,0.35)" strokeWidth={1} strokeDasharray="4 4" />
                        <text x={W - PAD_R - 2} y={y - 4} textAnchor="end" style={{ fill: '#C9A84C', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                            {compactMoney(m)} target
                        </text>
                    </g>
                )
            })}

            <path d={liftArea} fill="rgba(24,200,112,0.12)" stroke="none" />
            <path d={withoutPath} stroke="#A8A49E" strokeWidth={2} fill="none" />
            <path d={withPath} stroke="#18C870" strokeWidth={3} fill="none" />

            {points.map((p, i) => {
                if (![0, 2, 5, 8, 11].includes(i)) return null
                const x = toX(i)
                return (
                    <g key={`month-${p.month}`}>
                        <line x1={x} y1={PAD_T} x2={x} y2={H - PAD_B} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
                        <text x={x} y={H - 10} textAnchor="middle" style={{ fill: '#A8A49E', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                            M{p.month}
                        </text>
                    </g>
                )
            })}
        </svg>
    )
}

export function ConsultiveForecastPanel() {
    const [principal, setPrincipal] = useState(250_000)
    const [tier, setTier] = useState<TierKey>('income')
    const [horizon, setHorizon] = useState<Horizon>(90)
    const [withoutGenesisApy, setWithoutGenesisApy] = useState(0.012)
    const [users, setUsers] = useState(1200)
    const [avgBalance, setAvgBalance] = useState(220)
    const [prospects, setProspects] = useState(2500)
    const [kycPassWith, setKycPassWith] = useState(0.86)
    const [kycPassWithout, setKycPassWithout] = useState(0.64)
    const [daysToValueWith, setDaysToValueWith] = useState(2)
    const [daysToValueWithout, setDaysToValueWithout] = useState(7)
    const [monthlyInflow, setMonthlyInflow] = useState(20_000)
    const [inflowCaptureWithGenesis, setInflowCaptureWithGenesis] = useState(0.95)
    const [inflowCaptureWithoutGenesis, setInflowCaptureWithoutGenesis] = useState(0.72)
    const [monthlyNewUsers, setMonthlyNewUsers] = useState(180)
    const [monthlyChurnWith, setMonthlyChurnWith] = useState(0.018)
    const [monthlyChurnWithout, setMonthlyChurnWithout] = useState(0.042)
    const [monthlyBalanceGrowthWith, setMonthlyBalanceGrowthWith] = useState(0.018)
    const [monthlyBalanceGrowthWithout, setMonthlyBalanceGrowthWithout] = useState(0.004)
    const [integrationCost, setIntegrationCost] = useState(15_000)
    const [corridor, setCorridor] = useState<Corridor>('US-PH')
    const [monthlySendVolume, setMonthlySendVolume] = useState(120_000)
    const [avgTxSize, setAvgTxSize] = useState(450)

    const { apy: currentApy, totalYield, genesisFee, partnerRevenue, netToUsers, perUserDaily } = calculateForecast({
        principal,
        tier,
        horizon,
        users,
    })

    const impliedAum = users * avgBalance
    const comparisonRows = useMemo(() => buildPerformanceComparison({
        principal,
        tier,
        users,
        withoutGenesisApy,
    }), [principal, tier, users, withoutGenesisApy])

    const onboardingImpact = useMemo(() => calculateOnboardingImpact({
        prospects,
        avgWalletBalance: avgBalance,
        kycPassRateWithGenesis: kycPassWith,
        kycPassRateWithoutGenesis: kycPassWithout,
        daysToFirstValueWithGenesis: daysToValueWith,
        daysToFirstValueWithoutGenesis: daysToValueWithout,
    }), [prospects, avgBalance, kycPassWith, kycPassWithout, daysToValueWith, daysToValueWithout])

    const retentionProjection = useMemo(() => buildUserBalanceProjection({
        startingUsers: users,
        monthlyNewUsers,
        monthlyChurnWithGenesis: monthlyChurnWith,
        monthlyChurnWithoutGenesis: monthlyChurnWithout,
        avgBalanceStart: avgBalance,
        monthlyBalanceGrowthWithGenesis: monthlyBalanceGrowthWith,
        monthlyBalanceGrowthWithoutGenesis: monthlyBalanceGrowthWithout,
        months: 12,
    }), [users, monthlyNewUsers, monthlyChurnWith, monthlyChurnWithout, avgBalance, monthlyBalanceGrowthWith, monthlyBalanceGrowthWithout])

    const retentionFinal = retentionProjection[retentionProjection.length - 1]
    const aumCurvePoints = useMemo(() => retentionProjection.map((point) => ({
        month: point.month,
        withGenesis: point.aumWithGenesis + (monthlyInflow * point.month * inflowCaptureWithGenesis),
        withoutGenesis: point.aumWithoutGenesis + (monthlyInflow * point.month * inflowCaptureWithoutGenesis),
    })), [retentionProjection, monthlyInflow, inflowCaptureWithGenesis, inflowCaptureWithoutGenesis])

    const aumStart = aumCurvePoints[0]
    const aumMonth6 = aumCurvePoints.find((p) => p.month === 6)
    const aumMonth12 = aumCurvePoints[aumCurvePoints.length - 1]
    const aumLiftMonth12 = aumMonth12 ? aumMonth12.withGenesis - aumMonth12.withoutGenesis : 0
    const growthMultiple = aumStart && aumMonth12 && aumStart.withGenesis > 0 ? aumMonth12.withGenesis / aumStart.withGenesis : 0

    const milestones = [10_000, 100_000, 1_000_000]
    const monthToMilestone = (target: number) => {
        const hit = aumCurvePoints.find((p) => p.withGenesis >= target)
        return hit ? `M${hit.month}` : '>12m'
    }
    const annualPartnerRevenueEstimate = (principal * currentApy * (1 - 0.015 - 0.01)) * 0.01
    const breakEven = calculateBreakEven({
        integrationCost,
        monthlyPartnerRevenue: annualPartnerRevenueEstimate / 12,
    })

    const applyScenario = (key: keyof typeof SCENARIOS) => {
        const scenario = SCENARIOS[key]
        setPrincipal(scenario.principal)
        setUsers(scenario.users)
        setAvgBalance(scenario.avgBalance)
        setMonthlyInflow(scenario.monthlyInflow)
        setMonthlyNewUsers(scenario.monthlyNewUsers)
        setMonthlyChurnWith(scenario.monthlyChurnWith)
        setMonthlyChurnWithout(scenario.monthlyChurnWithout)
    }

    const executiveBrief = [
        `Genesis Reserve Consultive Summary (${horizon}d)`,
        `- Tier: ${tier.toUpperCase()} at ${pct(currentApy)} APY`,
        `- With Genesis net yield: ${money(netToUsers)} | Without Genesis baseline APY ${pct(withoutGenesisApy)}`,
        `- Onboarding lift: +${onboardingImpact.activationLiftUsers.toLocaleString()} activated users (${pct(onboardingImpact.activationLiftPct)})`,
        `- Month 12 retained AUM lift: ${retentionFinal ? money(retentionFinal.aumWithGenesis - retentionFinal.aumWithoutGenesis) : '$0.00'}`,
        `- Estimated partner annual revenue share: ${money(breakEven.annualPartnerRevenue)} | Break-even: ${breakEven.monthsToBreakEven ? `${breakEven.monthsToBreakEven.toFixed(1)} months` : 'N/A'}`,
    ].join('\n')

    const copyExecutiveBrief = async () => {
        try {
            await navigator.clipboard.writeText(executiveBrief)
        } catch (_err) {
            // no-op fallback for locked clipboard contexts
        }
    }

    const corridorRate = CORRIDOR_RATES[corridor]
    const { txCount, platformCost, spreadCost, totalCost, costPer1k } = calculateCorridorCosts({
        monthlySendVolume,
        avgTxSize,
    })

    const exportCsv = () => {
        const rows = [
            ['Metric', 'Value'],
            ['Principal', principal.toString()],
            ['Tier APY', pct(currentApy)],
            ['Without Genesis APY', pct(withoutGenesisApy)],
            ['Horizon Days', horizon.toString()],
            ['Total Yield', totalYield.toFixed(2)],
            ['Genesis Fee (1.5%)', genesisFee.toFixed(2)],
            ['Partner Share (1.0%)', partnerRevenue.toFixed(2)],
            ['Net to Users', netToUsers.toFixed(2)],
            ['Per User Per Day', perUserDaily.toFixed(4)],
            ['Implied AUM', impliedAum.toFixed(2)],
            ['Monthly Inflow', monthlyInflow.toFixed(2)],
            ['Inflow Capture With Genesis', inflowCaptureWithGenesis.toFixed(4)],
            ['Inflow Capture Without Genesis', inflowCaptureWithoutGenesis.toFixed(4)],
            ['Corridor', corridor],
            ['Monthly Send Volume', monthlySendVolume.toFixed(2)],
            ['Average Tx Size', avgTxSize.toFixed(2)],
            ['Platform Cost', platformCost.toFixed(2)],
            ['Spread Cost', spreadCost.toFixed(2)],
            ['Total Corridor Cost', totalCost.toFixed(2)],
        ]

        comparisonRows.forEach((row) => {
            rows.push([`With vs Without (${row.horizon}d) - With Genesis`, row.withGenesisNetYield.toFixed(2)])
            rows.push([`With vs Without (${row.horizon}d) - Without Genesis`, row.withoutGenesisYield.toFixed(2)])
            rows.push([`With vs Without (${row.horizon}d) - Incremental`, row.incrementalYield.toFixed(2)])
        })

        rows.push(['Onboarding - Activated With Genesis', onboardingImpact.activatedWithGenesis.toString()])
        rows.push(['Onboarding - Activated Without Genesis', onboardingImpact.activatedWithoutGenesis.toString()])
        rows.push(['Onboarding - Speed Advantage (days)', onboardingImpact.speedAdvantageDays.toString()])

        retentionProjection.forEach((point) => {
            rows.push([`Month ${point.month} Users With Genesis`, point.usersWithGenesis.toFixed(0)])
            rows.push([`Month ${point.month} Users Without Genesis`, point.usersWithoutGenesis.toFixed(0)])
            rows.push([`Month ${point.month} AUM With Genesis`, point.aumWithGenesis.toFixed(2)])
            rows.push([`Month ${point.month} AUM Without Genesis`, point.aumWithoutGenesis.toFixed(2)])
        })

        aumCurvePoints.forEach((point) => {
            rows.push([`AUM Curve Month ${point.month} - With Genesis`, point.withGenesis.toFixed(2)])
            rows.push([`AUM Curve Month ${point.month} - Without Genesis`, point.withoutGenesis.toFixed(2)])
        })

        const csv = rows.map((r) => r.join(',')).join('\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `consultive-forecast-${Date.now()}.csv`
        link.click()
        URL.revokeObjectURL(url)
    }

    return (
        <div style={S.root}>
            <section style={S.panel}>
                <div style={S.title}>Consultive Modeling</div>
                <div style={S.sub}>Customer-first onboarding and performance story for partner sales, integration planning, and enterprise reviews.</div>
                <div style={S.actionsLeft}>
                    <button type="button" style={S.btnGhost} onClick={() => applyScenario('canary')}>{SCENARIOS.canary.label}</button>
                    <button type="button" style={S.btnGhost} onClick={() => applyScenario('growth')}>{SCENARIOS.growth.label}</button>
                    <button type="button" style={S.btnGhost} onClick={() => applyScenario('enterprise')}>{SCENARIOS.enterprise.label}</button>
                </div>
                <div style={S.grid3}>
                    <label style={S.field}><span>Principal ($)</span><input style={S.input} type="number" value={principal} onChange={(e) => setPrincipal(Number(e.target.value || 0))} /></label>
                    <label style={S.field}><span>Tier</span><select style={S.input} value={tier} onChange={(e) => setTier(e.target.value as TierKey)}><option value="flexible">Flexible (4.8%)</option><option value="income">Income (6.2%)</option><option value="growth">Growth (11.2%)</option></select></label>
                    <label style={S.field}><span>Horizon</span><select style={S.input} value={horizon} onChange={(e) => setHorizon(Number(e.target.value) as Horizon)}><option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option><option value={365}>365 days</option></select></label>
                </div>
                <div style={S.grid3}>
                    <label style={S.field}><span>Without Genesis APY (baseline)</span><input style={S.input} type="number" step="0.001" value={withoutGenesisApy} onChange={(e) => setWithoutGenesisApy(Number(e.target.value || 0))} /></label>
                    <label style={S.field}><span>Current Partner Users</span><input style={S.input} type="number" value={users} onChange={(e) => setUsers(Number(e.target.value || 0))} /></label>
                    <label style={S.field}><span>Average Wallet Balance ($)</span><input style={S.input} type="number" value={avgBalance} onChange={(e) => setAvgBalance(Number(e.target.value || 0))} /></label>
                </div>

                <div style={S.kpiGrid}>
                    <div style={S.kpi}><div style={S.kpiLabel}>Projected Yield</div><div style={S.kpiVal}>{money(totalYield)}</div></div>
                    <div style={S.kpi}><div style={S.kpiLabel}>Genesis Fee (1.5%)</div><div style={S.kpiVal}>{money(genesisFee)}</div></div>
                    <div style={S.kpi}><div style={S.kpiLabel}>Partner Share (1.0%)</div><div style={S.kpiVal}>{money(partnerRevenue)}</div></div>
                    <div style={S.kpi}><div style={S.kpiLabel}>Net to Users</div><div style={S.kpiVal}>{money(netToUsers)}</div></div>
                    <div style={S.kpi}><div style={S.kpiLabel}>Per User / Day</div><div style={S.kpiVal}>{money(perUserDaily, 4)}</div></div>
                </div>
            </section>

            <section style={S.panel}>
                <div style={S.title}>Partner ROI & Sales Brief</div>
                <div style={S.grid3}>
                    <label style={S.field}><span>Integration Cost ($)</span><input style={S.input} type="number" value={integrationCost} onChange={(e) => setIntegrationCost(Number(e.target.value || 0))} /></label>
                    <div style={S.field}><span>Annual Partner Revenue (Est.)</span><div style={S.infoBox}>{money(breakEven.annualPartnerRevenue)}</div></div>
                    <div style={S.field}><span>Break-even Timeline</span><div style={S.infoBox}>{breakEven.monthsToBreakEven ? `${breakEven.monthsToBreakEven.toFixed(1)} months` : 'N/A'}</div></div>
                </div>
                <div style={S.kpiGrid}>
                    <div style={S.kpi}><div style={S.kpiLabel}>ROI Year 1</div><div style={{ ...S.kpiVal, color: breakEven.roiYearOne >= 0 ? '#18C870' : '#E04040' }}>{pct(breakEven.roiYearOne)}</div></div>
                    <div style={S.kpi}><div style={S.kpiLabel}>Monthly Partner Rev.</div><div style={S.kpiVal}>{money(breakEven.annualPartnerRevenue / 12)}</div></div>
                    <div style={S.kpi}><div style={S.kpiLabel}>Lift vs Baseline (90d)</div><div style={S.kpiVal}>{money(comparisonRows.find((r) => r.horizon === 90)?.incrementalYield || 0)}</div></div>
                    <div style={S.kpi}><div style={S.kpiLabel}>Activation Speed Gain</div><div style={S.kpiVal}>{onboardingImpact.speedAdvantageDays} days</div></div>
                    <div style={S.kpi}><div style={S.kpiLabel}>Retained AUM Lift (12m)</div><div style={S.kpiVal}>{retentionFinal ? money(retentionFinal.aumWithGenesis - retentionFinal.aumWithoutGenesis) : '$0.00'}</div></div>
                </div>
                <label style={{ ...S.field, marginTop: 12 }}>
                    <span>Executive Brief (copy-ready)</span>
                    <textarea style={S.textarea} value={executiveBrief} readOnly />
                </label>
                <div style={S.actions}>
                    <button type="button" style={S.btnPrimary} onClick={copyExecutiveBrief}>Copy Brief</button>
                </div>
            </section>

            <section style={S.panel}>
                <div style={S.title}>Onboarding Impact (With vs Without Genesis)</div>
                <div style={S.grid4}>
                    <label style={S.field}><span>Prospects in Funnel</span><input style={S.input} type="number" value={prospects} onChange={(e) => setProspects(Number(e.target.value || 0))} /></label>
                    <label style={S.field}><span>KYC Pass Rate (With Genesis)</span><input style={S.input} type="number" step="0.01" value={kycPassWith} onChange={(e) => setKycPassWith(Number(e.target.value || 0))} /></label>
                    <label style={S.field}><span>KYC Pass Rate (Without Genesis)</span><input style={S.input} type="number" step="0.01" value={kycPassWithout} onChange={(e) => setKycPassWithout(Number(e.target.value || 0))} /></label>
                    <label style={S.field}><span>Days to First Value (With / Without)</span><div style={S.infoBox}>{daysToValueWith}d / {daysToValueWithout}d</div></label>
                </div>
                <div style={S.grid3}>
                    <label style={S.field}><span>With Genesis: Days to First Value</span><input style={S.input} type="number" value={daysToValueWith} onChange={(e) => setDaysToValueWith(Number(e.target.value || 0))} /></label>
                    <label style={S.field}><span>Without Genesis: Days to First Value</span><input style={S.input} type="number" value={daysToValueWithout} onChange={(e) => setDaysToValueWithout(Number(e.target.value || 0))} /></label>
                    <div style={S.field}><span>Activation Lift</span><div style={S.infoBox}>{onboardingImpact.activationLiftUsers.toLocaleString()} users ({pct(onboardingImpact.activationLiftPct)})</div></div>
                </div>
                <div style={S.kpiGrid}>
                    <div style={S.kpi}><div style={S.kpiLabel}>Activated (With Genesis)</div><div style={S.kpiVal}>{onboardingImpact.activatedWithGenesis.toLocaleString()}</div></div>
                    <div style={S.kpi}><div style={S.kpiLabel}>Activated (Without Genesis)</div><div style={S.kpiVal}>{onboardingImpact.activatedWithoutGenesis.toLocaleString()}</div></div>
                    <div style={S.kpi}><div style={S.kpiLabel}>Principal (With Genesis)</div><div style={S.kpiVal}>{money(onboardingImpact.principalWithGenesis)}</div></div>
                    <div style={S.kpi}><div style={S.kpiLabel}>Principal (Without Genesis)</div><div style={S.kpiVal}>{money(onboardingImpact.principalWithoutGenesis)}</div></div>
                    <div style={S.kpi}><div style={S.kpiLabel}>Speed Advantage</div><div style={S.kpiVal}>{onboardingImpact.speedAdvantageDays} days</div></div>
                </div>
            </section>

            <section style={S.panel}>
                <div style={S.title}>Performance Comparison — 30/60/90/365</div>
                <div style={S.tableWrap}>
                    <table style={S.table}>
                        <thead>
                            <tr>
                                <th style={S.th}>Window</th>
                                <th style={S.th}>With Genesis (Net)</th>
                                <th style={S.th}>Without Genesis</th>
                                <th style={S.th}>Incremental Lift</th>
                                <th style={S.th}>Per User / Day Lift</th>
                            </tr>
                        </thead>
                        <tbody>
                            {comparisonRows.map((row) => (
                                <tr key={row.horizon}>
                                    <td style={S.td}>{row.horizon} days</td>
                                    <td style={S.td}>{money(row.withGenesisNetYield)}</td>
                                    <td style={S.td}>{money(row.withoutGenesisYield)}</td>
                                    <td style={{ ...S.td, color: row.incrementalYield >= 0 ? '#18C870' : '#E04040' }}>{money(row.incrementalYield)}</td>
                                    <td style={S.td}>{money(row.perUserDailyLift, 4)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section style={S.panel}>
                <div style={S.title}>Partner AUM Projection Curve (With vs Without Genesis)</div>
                <div style={S.sub}>Built for partner commercial reviews: runway-to-target, retained AUM delta, and scenario realism from user growth + churn + balance behavior.</div>
                <div style={S.grid4}>
                    <label style={S.field}><span>Partner Users</span><input style={S.input} type="number" value={users} onChange={(e) => setUsers(Number(e.target.value || 0))} /></label>
                    <label style={S.field}><span>Avg Balance / User ($)</span><input style={S.input} type="number" value={avgBalance} onChange={(e) => setAvgBalance(Number(e.target.value || 0))} /></label>
                    <label style={S.field}><span>Monthly Inflow ($)</span><input style={S.input} type="number" value={monthlyInflow} onChange={(e) => setMonthlyInflow(Number(e.target.value || 0))} /></label>
                    <label style={S.field}><span>Inflow Capture (With / Without)</span><div style={S.infoBox}>{pct(inflowCaptureWithGenesis)} / {pct(inflowCaptureWithoutGenesis)}</div></label>
                </div>
                <div style={S.grid3}>
                    <label style={S.field}><span>Inflow Capture With Genesis</span><input style={S.input} type="number" step="0.01" min={0} max={1} value={inflowCaptureWithGenesis} onChange={(e) => setInflowCaptureWithGenesis(Number(e.target.value || 0))} /></label>
                    <label style={S.field}><span>Inflow Capture Without Genesis</span><input style={S.input} type="number" step="0.01" min={0} max={1} value={inflowCaptureWithoutGenesis} onChange={(e) => setInflowCaptureWithoutGenesis(Number(e.target.value || 0))} /></label>
                </div>
                <div style={S.kpiGrid}>
                    <div style={S.kpi}><div style={S.kpiLabel}>Month 1 AUM (With)</div><div style={S.kpiVal}>{aumStart ? money(aumStart.withGenesis) : '—'}</div></div>
                    <div style={S.kpi}><div style={S.kpiLabel}>Month 6 AUM (With)</div><div style={S.kpiVal}>{aumMonth6 ? money(aumMonth6.withGenesis) : '—'}</div></div>
                    <div style={S.kpi}><div style={S.kpiLabel}>Month 12 AUM (With)</div><div style={S.kpiVal}>{aumMonth12 ? money(aumMonth12.withGenesis) : '—'}</div></div>
                    <div style={S.kpi}><div style={S.kpiLabel}>Month 12 AUM (Without)</div><div style={S.kpiVal}>{aumMonth12 ? money(aumMonth12.withoutGenesis) : '—'}</div></div>
                    <div style={S.kpi}><div style={S.kpiLabel}>Month 12 Lift</div><div style={{ ...S.kpiVal, color: '#18C870' }}>{money(aumLiftMonth12)}</div></div>
                </div>
                <div style={S.legendRow}>
                    <span style={{ ...S.legend, color: '#18C870' }}>With Genesis</span>
                    <span style={{ ...S.legend, color: '#A8A49E' }}>Without Genesis</span>
                    <span style={{ ...S.legend, color: '#18C870' }}>Lift Area</span>
                </div>
                <AumCurveChart points={aumCurvePoints} milestones={milestones} />
                <div style={S.grid3}>
                    <div style={S.infoBox}>$10K Canary target: {monthToMilestone(10_000)}</div>
                    <div style={S.infoBox}>$100K Pilot target: {monthToMilestone(100_000)}</div>
                    <div style={S.infoBox}>12m Growth Multiple (With): {growthMultiple > 0 ? `${growthMultiple.toFixed(2)}x` : '—'}</div>
                </div>
            </section>

            <section style={S.panel}>
                <div style={S.title}>User Growth + Wallet Retention (With vs Without)</div>
                <div style={S.grid4}>
                    <label style={S.field}><span>Monthly New Users</span><input style={S.input} type="number" value={monthlyNewUsers} onChange={(e) => setMonthlyNewUsers(Number(e.target.value || 0))} /></label>
                    <label style={S.field}><span>Monthly Churn (With Genesis)</span><input style={S.input} type="number" step="0.001" value={monthlyChurnWith} onChange={(e) => setMonthlyChurnWith(Number(e.target.value || 0))} /></label>
                    <label style={S.field}><span>Monthly Churn (Without Genesis)</span><input style={S.input} type="number" step="0.001" value={monthlyChurnWithout} onChange={(e) => setMonthlyChurnWithout(Number(e.target.value || 0))} /></label>
                    <label style={S.field}><span>Balance Growth (With / Without)</span><div style={S.infoBox}>{pct(monthlyBalanceGrowthWith)} / {pct(monthlyBalanceGrowthWithout)}</div></label>
                </div>
                <div style={S.grid3}>
                    <label style={S.field}><span>Monthly Balance Growth (With Genesis)</span><input style={S.input} type="number" step="0.001" value={monthlyBalanceGrowthWith} onChange={(e) => setMonthlyBalanceGrowthWith(Number(e.target.value || 0))} /></label>
                    <label style={S.field}><span>Monthly Balance Growth (Without Genesis)</span><input style={S.input} type="number" step="0.001" value={monthlyBalanceGrowthWithout} onChange={(e) => setMonthlyBalanceGrowthWithout(Number(e.target.value || 0))} /></label>
                </div>
                <div style={S.kpiGrid}>
                    <div style={S.kpi}><div style={S.kpiLabel}>Month 12 Users (With)</div><div style={S.kpiVal}>{retentionFinal ? retentionFinal.usersWithGenesis.toFixed(0) : '—'}</div></div>
                    <div style={S.kpi}><div style={S.kpiLabel}>Month 12 Users (Without)</div><div style={S.kpiVal}>{retentionFinal ? retentionFinal.usersWithoutGenesis.toFixed(0) : '—'}</div></div>
                    <div style={S.kpi}><div style={S.kpiLabel}>Month 12 AUM (With)</div><div style={S.kpiVal}>{retentionFinal ? money(retentionFinal.aumWithGenesis) : '—'}</div></div>
                    <div style={S.kpi}><div style={S.kpiLabel}>Month 12 AUM (Without)</div><div style={S.kpiVal}>{retentionFinal ? money(retentionFinal.aumWithoutGenesis) : '—'}</div></div>
                    <div style={S.kpi}><div style={S.kpiLabel}>Retained AUM Lift</div><div style={S.kpiVal}>{retentionFinal ? money(retentionFinal.aumWithGenesis - retentionFinal.aumWithoutGenesis) : '—'}</div></div>
                </div>
                <div style={S.tableWrap}>
                    <table style={S.table}>
                        <thead>
                            <tr>
                                <th style={S.th}>Month</th>
                                <th style={S.th}>Users (With)</th>
                                <th style={S.th}>Users (Without)</th>
                                <th style={S.th}>Avg Balance (With)</th>
                                <th style={S.th}>Avg Balance (Without)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {retentionProjection.slice(0, 6).map((point) => (
                                <tr key={point.month}>
                                    <td style={S.td}>M{point.month}</td>
                                    <td style={S.td}>{point.usersWithGenesis.toFixed(0)}</td>
                                    <td style={S.td}>{point.usersWithoutGenesis.toFixed(0)}</td>
                                    <td style={S.td}>{money(point.avgBalanceWithGenesis)}</td>
                                    <td style={S.td}>{money(point.avgBalanceWithoutGenesis)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section style={S.panel}>
                <div style={S.title}>Corridor Cost Analysis</div>
                <div style={S.grid4}>
                    <label style={S.field}><span>Corridor</span><select style={S.input} value={corridor} onChange={(e) => setCorridor(e.target.value as Corridor)}><option value="US-PH">US-PH</option><option value="US-MX">US-MX</option><option value="US-IN">US-IN</option></select></label>
                    <label style={S.field}><span>Monthly Send Volume ($)</span><input style={S.input} type="number" value={monthlySendVolume} onChange={(e) => setMonthlySendVolume(Number(e.target.value || 0))} /></label>
                    <label style={S.field}><span>Average Tx Size ($)</span><input style={S.input} type="number" value={avgTxSize} onChange={(e) => setAvgTxSize(Number(e.target.value || 0))} /></label>
                    <div style={S.field}><span>FX Quote (live baseline)</span><div style={S.infoBox}>{corridorRate.rate.toFixed(2)} {corridorRate.currency}/USD</div></div>
                </div>

                <div style={S.kpiGrid}>
                    <div style={S.kpi}><div style={S.kpiLabel}>Est. Transactions / Month</div><div style={S.kpiVal}>{txCount.toFixed(0)}</div></div>
                    <div style={S.kpi}><div style={S.kpiLabel}>Platform Cost (0.42%)</div><div style={S.kpiVal}>{money(platformCost)}</div></div>
                    <div style={S.kpi}><div style={S.kpiLabel}>FX Spread Cost (0.25%)</div><div style={S.kpiVal}>{money(spreadCost)}</div></div>
                    <div style={S.kpi}><div style={S.kpiLabel}>Total Cost</div><div style={S.kpiVal}>{money(totalCost)}</div></div>
                    <div style={S.kpi}><div style={S.kpiLabel}>Cost per $1,000</div><div style={S.kpiVal}>{money(costPer1k)}</div></div>
                </div>

                <div style={S.actions}>
                    <button type="button" style={S.btnPrimary} onClick={() => window.print()}>Export PDF</button>
                    <button type="button" style={S.btnGhost} onClick={exportCsv}>Export CSV</button>
                </div>
            </section>
        </div>
    )
}

const S: Record<string, CSSProperties> = {
    root: { display: 'flex', flexDirection: 'column', gap: 14 },
    panel: { background: '#12141C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px' },
    title: { fontFamily: 'JetBrains Mono, monospace', color: '#C9A84C', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 11 },
    sub: { marginTop: 8, color: '#A8A49E', fontSize: 12 },
    grid3: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 12 },
    grid4: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginTop: 12 },
    field: { display: 'flex', flexDirection: 'column', gap: 6, color: '#A8A49E', fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
    input: { border: '1px solid rgba(255,255,255,0.14)', background: '#0D0E14', color: '#F0EDE8', borderRadius: 8, padding: '8px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 },
    infoBox: { border: '1px solid rgba(201,168,76,0.25)', background: 'rgba(201,168,76,0.08)', color: '#D4C4A0', borderRadius: 8, padding: '9px 10px', fontSize: 12 },
    kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10, marginTop: 14 },
    kpi: { border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 11px' },
    kpiLabel: { fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A5650', textTransform: 'uppercase' },
    kpiVal: { marginTop: 8, color: '#F0EDE8', fontWeight: 700, fontSize: 16 },
    legendRow: { display: 'flex', alignItems: 'center', gap: 16, marginTop: 14 },
    legend: { fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
    chartSvg: { width: '100%', height: 190, marginTop: 8, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, background: '#0D0E14' },
    tableWrap: { marginTop: 12, overflowX: 'auto' },
    table: { width: '100%', borderCollapse: 'collapse', minWidth: 640 },
    th: { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.12)', color: '#A8A49E', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' },
    td: { padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#F0EDE8', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 },
    textarea: { border: '1px solid rgba(255,255,255,0.14)', background: '#0D0E14', color: '#F0EDE8', borderRadius: 8, padding: '10px', minHeight: 130, resize: 'vertical', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 },
    actionsLeft: { display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-start' },
    actions: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 },
    btnPrimary: { border: 'none', background: '#C9A84C', color: '#1A1400', borderRadius: 8, padding: '8px 12px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, cursor: 'pointer' },
    btnGhost: { border: '1px solid rgba(255,255,255,0.14)', background: 'transparent', color: '#F0EDE8', borderRadius: 8, padding: '8px 12px', fontFamily: 'JetBrains Mono, monospace', cursor: 'pointer' },
}
