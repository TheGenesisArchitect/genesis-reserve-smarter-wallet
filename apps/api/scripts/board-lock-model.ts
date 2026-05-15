/**
 * scripts/board-lock-model.ts
 *
 * Genesis Reserve — Board-Lock Investor Model v1.0
 * ─────────────────────────────────────────────────
 * Locked pricing:  fee = max($0.25,  amount × 0.008%)
 * Ramp:            10K → 100K tx / mo  (12 months)
 * Cost scenarios:  $0.10 / tx (lean)  |  $0.20 / tx (conservative)
 * Yield scenarios: Bear 6% APY  |  Base 10% APY  |  Bull 14% APY
 * Traffic mixes:   Retail-heavy  |  Balanced  |  High-ticket
 *
 * Model mechanics
 * ───────────────
 * 1. Each month: gross tx revenue = txCount × avgFee(mix)
 * 2. Contribution margin = gross revenue − (txCount × cost/tx)
 * 3. Positive monthly margin compounds into retained deployable capital
 * 4. Treasury yield = retained capital × (APY / 12)  (month-over-month)
 * 5. Retained capital grows by positive contribution margin each month
 *
 * Run from genesis-privy-integration/genesis-privy/gr/gr:
 *   npx ts-node scripts/board-lock-model.ts
 */

// ─── Constants ──────────────────────────────────────────────────────────────
const RAMP_TX: number[] = [10_000, 15_000, 20_000, 25_000, 30_000, 40_000, 50_000, 60_000, 70_000, 80_000, 90_000, 100_000];
const STEADY_STATE_TX = 100_000;

// ─── Types ───────────────────────────────────────────────────────────────────
interface TrafficMix {
    name: string;
    label: string; // board-deck short label
    weights: Array<[amount: number, weight: number]>;
}

interface CostScenario {
    label: string;
    costPerTx: number;
}

interface YieldScenario {
    name: string;
    label: string;
    apy: number;
}

interface MonthlyRow {
    month: number;
    txCount: number;
    avgFee: number;
    grossRevenue: number;
    cost: number;
    contributionMargin: number;
    retainedCapital: number;
    treasuryYield: number;
    totalRevenue: number; // gross + treasury yield
}

interface AnnualSummary {
    mix: string;
    costLabel: string;
    yieldLabel: string;
    totalGrossRevenue: number;
    totalContributionMargin: number;
    totalTreasuryYield: number;
    totalCombinedRevenue: number;
    totalCombinedMargin: number;
    endingRetainedCapital: number;
    avgFeePerTx: number;
    breakEvenMonth: number | null; // first month contribution margin > 0
}

// ─── Traffic Mixes ───────────────────────────────────────────────────────────
const MIXES: TrafficMix[] = [
    {
        name: 'Retail-Heavy',
        label: 'RTL',
        weights: [
            [100, 0.35],
            [250, 0.25],
            [500, 0.20],
            [1_000, 0.15],
            [2_500, 0.05],
        ],
    },
    {
        name: 'Balanced',
        label: 'BAL',
        weights: [
            [250, 0.25],
            [500, 0.25],
            [1_000, 0.20],
            [2_500, 0.15],
            [5_000, 0.10],
            [10_000, 0.05],
        ],
    },
    {
        name: 'High-Ticket',
        label: 'HGH',
        weights: [
            [1_000, 0.20],
            [2_500, 0.25],
            [5_000, 0.25],
            [10_000, 0.20],
            [25_000, 0.10],
        ],
    },
];

// ─── Cost Scenarios ───────────────────────────────────────────────────────────
const COSTS: CostScenario[] = [
    { label: 'Lean  ($0.10)', costPerTx: 0.10 },
    { label: 'Cons  ($0.20)', costPerTx: 0.20 },
];

// ─── Yield Scenarios ─────────────────────────────────────────────────────────
const YIELDS: YieldScenario[] = [
    { name: 'Bear', label: 'Bear  6%', apy: 0.06 },
    { name: 'Base', label: 'Base 10%', apy: 0.10 },
    { name: 'Bull', label: 'Bull 14%', apy: 0.14 },
];

// ─── Fee Engine ──────────────────────────────────────────────────────────────
function txFee(amount: number): number {
    return Math.max(0.25, amount * 0.00008);
}

function avgFeeForMix(weights: Array<[number, number]>): number {
    return weights.reduce((sum, [amount, weight]) => sum + txFee(amount) * weight, 0);
}

// ─── 12-Month Ramp Model ─────────────────────────────────────────────────────
function buildRampModel(
    mix: TrafficMix,
    cost: CostScenario,
    yield_: YieldScenario,
): { rows: MonthlyRow[]; summary: AnnualSummary } {
    const avgFee = avgFeeForMix(mix.weights);
    let retainedCapital = 0;
    let totalGross = 0;
    let totalMargin = 0;
    let totalTreasury = 0;
    let breakEvenMonth: number | null = null;

    const rows: MonthlyRow[] = RAMP_TX.map((txCount, i) => {
        const month = i + 1;
        const grossRevenue = txCount * avgFee;
        const cost_ = txCount * cost.costPerTx;
        const contributionMargin = grossRevenue - cost_;

        // Treasury yield earned on capital deployed at START of month
        const treasuryYield = retainedCapital * (yield_.apy / 12);

        // Grow retained capital by positive contribution margin
        if (contributionMargin > 0) {
            retainedCapital += contributionMargin;
        }

        if (breakEvenMonth === null && contributionMargin > 0) {
            breakEvenMonth = month;
        }

        totalGross += grossRevenue;
        totalMargin += contributionMargin;
        totalTreasury += treasuryYield;

        return {
            month,
            txCount,
            avgFee,
            grossRevenue,
            cost: cost_,
            contributionMargin,
            retainedCapital,
            treasuryYield,
            totalRevenue: grossRevenue + treasuryYield,
        };
    });

    const summary: AnnualSummary = {
        mix: mix.name,
        costLabel: cost.label,
        yieldLabel: yield_.label,
        totalGrossRevenue: totalGross,
        totalContributionMargin: totalMargin,
        totalTreasuryYield: totalTreasury,
        totalCombinedRevenue: totalGross + totalTreasury,
        totalCombinedMargin: totalMargin + totalTreasury,
        endingRetainedCapital: retainedCapital,
        avgFeePerTx: avgFee,
        breakEvenMonth,
    };

    return { rows, summary };
}

// ─── Steady-State ARR (100K tx/mo, annualized) ───────────────────────────────
function steadyStateARR(
    mix: TrafficMix,
    cost: CostScenario,
    yield_: YieldScenario,
    startingRetained: number,
): {
    annualTxRevenue: number;
    annualTxMargin: number;
    annualTreasuryYield: number;
    arr: number; // tx revenue + treasury yield
    contributionMarginRate: number; // %
} {
    const avgFee = avgFeeForMix(mix.weights);
    const annualTxRevenue = STEADY_STATE_TX * avgFee * 12;
    const annualTxMargin = STEADY_STATE_TX * (avgFee - cost.costPerTx) * 12;

    // Treasury deployed = starting retained + avg of new monthly margin flows
    const monthlyMargin = STEADY_STATE_TX * (avgFee - cost.costPerTx);
    let treasuryYield = 0;
    let deployed = startingRetained;
    for (let m = 0; m < 12; m++) {
        treasuryYield += deployed * (yield_.apy / 12);
        if (monthlyMargin > 0) deployed += monthlyMargin;
    }

    return {
        annualTxRevenue,
        annualTxMargin,
        annualTreasuryYield: treasuryYield,
        arr: annualTxRevenue + treasuryYield,
        contributionMarginRate: annualTxRevenue > 0 ? (annualTxMargin / annualTxRevenue) * 100 : 0,
    };
}

// ─── Formatting Helpers ───────────────────────────────────────────────────────
function $n(n: number, decimals = 0): string {
    return '$' + n.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function pct(n: number): string {
    return n.toFixed(1) + '%';
}
function sep(ch = '─', len = 80): string {
    return ch.repeat(len);
}

// ─── Main Output ─────────────────────────────────────────────────────────────
function main(): void {
    const line = sep();
    const thin = sep('·');

    console.log(line);
    console.log('  GENESIS RESERVE — BOARD LOCK MODEL  v1.0   |   ' + new Date().toISOString().slice(0, 10));
    console.log('  Pricing: fee = max($0.25, amount × 0.008%)  |  Ramp: 10K→100K tx/mo (12 mo)');
    console.log(line);

    // ── Section 1: 12-Month Ramp Summaries (all scenarios) ──────────────────
    console.log('\n┌─ SECTION 1 · YEAR-1 RAMP SUMMARY (all scenario combinations) ─────────────────┐');
    console.log('│ Mix          Cost       Yield    │  GrossTxRev  │  TxMargin   │  Treasury  │  Combined │ RetainedCap │ Break-even │');
    console.log('├──────────────────────────────────┼──────────────┼─────────────┼────────────┼───────────┼─────────────┼────────────┤');

    const allSummaries: AnnualSummary[] = [];

    for (const mix of MIXES) {
        for (const cost of COSTS) {
            for (const yield_ of YIELDS) {
                const { summary } = buildRampModel(mix, cost, yield_);
                allSummaries.push(summary);
                const be = summary.breakEvenMonth !== null ? `Mo ${summary.breakEvenMonth}` : 'N/A';
                console.log(
                    `│ ${mix.name.padEnd(12)} ${cost.label.padEnd(14)} ${yield_.label.padEnd(8)} │` +
                    `  ${$n(summary.totalGrossRevenue).padStart(10)}  │` +
                    `  ${$n(summary.totalContributionMargin).padStart(9)}  │` +
                    `  ${$n(summary.totalTreasuryYield).padStart(8)}  │` +
                    `  ${$n(summary.totalCombinedRevenue).padStart(7)}  │` +
                    `  ${$n(summary.endingRetainedCapital).padStart(9)}  │` +
                    `  ${be.padStart(8)}  │`
                );
            }
            console.log(thin);
        }
    }
    console.log('└─────────────────────────────────────────────────────────────────────────────────┘');

    // ── Section 2: Board-Deck KPI Summary (3 canonical scenarios) ───────────
    console.log('\n┌─ SECTION 2 · BOARD KPIs — 3 CANONICAL SCENARIOS ──────────────────────────────┐');

    const canonical = [
        { mixName: 'Retail-Heavy', costPTx: 0.20, yieldApy: 0.06, scenarioName: 'BEAR  (Retail + $0.20 cost + 6% yield)' },
        { mixName: 'Balanced', costPTx: 0.20, yieldApy: 0.10, scenarioName: 'BASE  (Balanced + $0.20 cost + 10% yield)' },
        { mixName: 'High-Ticket', costPTx: 0.10, yieldApy: 0.14, scenarioName: 'BULL  (High-ticket + $0.10 cost + 14% yield)' },
    ];

    for (const c of canonical) {
        const mix = MIXES.find(m => m.name === c.mixName)!;
        const cost = COSTS.find(x => x.costPerTx === c.costPTx)!;
        const yld = YIELDS.find(y => y.apy === c.yieldApy)!;
        const { rows, summary } = buildRampModel(mix, cost, yld);
        const ss = steadyStateARR(mix, cost, yld, summary.endingRetainedCapital);

        console.log('\n' + sep('═'));
        console.log(`  SCENARIO: ${c.scenarioName}`);
        console.log(sep('═'));

        // KPI block
        console.log(`  Avg fee / tx:             ${$n(summary.avgFeePerTx, 4)}`);
        console.log(`  Cost / tx:                ${$n(c.costPTx, 2)}`);
        console.log(`  Contribution margin / tx: ${$n(summary.avgFeePerTx - c.costPTx, 4)}`);
        console.log(`  Break-even month:         ${summary.breakEvenMonth !== null ? 'Month ' + summary.breakEvenMonth : 'N/A (loss throughout Year 1)'}`);
        console.log('');
        console.log(`  ── Year-1 Ramp (10K→100K tx/mo) ──`);
        console.log(`  Gross tx revenue:         ${$n(summary.totalGrossRevenue)}`);
        console.log(`  Contribution margin:      ${$n(summary.totalContributionMargin)}`);
        console.log(`  Treasury yield:           ${$n(summary.totalTreasuryYield)}`);
        console.log(`  Combined revenue+yield:   ${$n(summary.totalCombinedRevenue)}`);
        console.log(`  Ending retained capital:  ${$n(summary.endingRetainedCapital)}`);
        console.log('');
        console.log(`  ── Steady-State ARR (100K tx/mo, Year-2 run-rate) ──`);
        console.log(`  Annual tx revenue:        ${$n(ss.annualTxRevenue)}`);
        console.log(`  Annual tx margin:         ${$n(ss.annualTxMargin)}   (${pct(ss.contributionMarginRate)} of tx rev)`);
        console.log(`  Treasury yield on corpus: ${$n(ss.annualTreasuryYield)}`);
        console.log(`  ARR (tx rev + treasury):  ${$n(ss.arr)}`);

        // Monthly ramp table
        console.log('');
        console.log(`  ── Monthly Detail ──`);
        console.log(`  Mo  | TxCount | GrossRev  | ContribMgn | Retained   | TreasYield`);
        console.log(`  ────┼─────────┼───────────┼────────────┼────────────┼───────────`);
        for (const row of rows) {
            const pos = row.contributionMargin >= 0 ? ' ' : '';
            console.log(
                `  ${String(row.month).padStart(2)}  │ ${String(row.txCount).padStart(7)} │` +
                ` ${$n(row.grossRevenue).padStart(8)}  │` +
                ` ${(pos + $n(row.contributionMargin)).padStart(10)}  │` +
                ` ${$n(row.retainedCapital).padStart(10)} │` +
                ` ${$n(row.treasuryYield, 2).padStart(9)}`
            );
        }
    }

    // ── Section 3: ARR Bridge ────────────────────────────────────────────────
    console.log('\n' + sep('═'));
    console.log('  SECTION 3 · ARR BRIDGE  (Year-1 → Year-2 run-rate, Base scenario)');
    console.log(sep('═'));

    const bridgeMix = MIXES.find(m => m.name === 'Balanced')!;
    const bridgeCost = COSTS.find(x => x.costPerTx === 0.20)!;
    const bridgeYld = YIELDS.find(y => y.apy === 0.10)!;
    const { summary: bs } = buildRampModel(bridgeMix, bridgeCost, bridgeYld);
    const bss = steadyStateARR(bridgeMix, bridgeCost, bridgeYld, bs.endingRetainedCapital);

    const bridgeItems: Array<[string, number]> = [
        ['Year-1 gross tx revenue', bs.totalGrossRevenue],
        ['+ Year-1 treasury yield', bs.totalTreasuryYield],
        ['= Year-1 combined revenue+yield', bs.totalCombinedRevenue],
        ['', 0],
        ['Year-2 run-rate tx revenue (ARR)', bss.annualTxRevenue],
        ['+ Year-2 treasury yield (on corpus)', bss.annualTreasuryYield],
        ['= Year-2 ARR', bss.arr],
        ['', 0],
        ['ARR uplift Y1→Y2', bss.arr - bs.totalCombinedRevenue],
        ['ARR uplift %', ((bss.arr - bs.totalCombinedRevenue) / bs.totalCombinedRevenue) * 100],
    ];

    for (const [label, value] of bridgeItems) {
        if (!label) { console.log(''); continue; }
        const isUpliftPct = label.includes('%');
        const valStr = isUpliftPct ? pct(value) : $n(value);
        console.log(`  ${label.padEnd(42)} ${valStr.padStart(12)}`);
    }

    // ── Section 4: Sensitivity Grid ──────────────────────────────────────────
    console.log('\n' + sep('═'));
    console.log('  SECTION 4 · SENSITIVITY GRID  — Steady-State ARR at 100K tx/mo');
    console.log('  (rows = traffic mix, cols = yield scenario, at $0.20 cost/tx)');
    console.log(sep('═'));

    const headers = ['Mix \\ Yield', ...YIELDS.map(y => y.label.padStart(14))];
    console.log('  ' + headers.join('  |  '));
    console.log('  ' + sep('─', 60));

    for (const mix of MIXES) {
        const row: string[] = [mix.name.padEnd(12)];
        for (const yld of YIELDS) {
            const { summary: s } = buildRampModel(mix, COSTS[1], yld);
            const ss2 = steadyStateARR(mix, COSTS[1], yld, s.endingRetainedCapital);
            row.push($n(ss2.arr).padStart(14));
        }
        console.log('  ' + row.join('  |  '));
    }

    console.log('\n  ' + sep('─', 60));
    console.log('  (same grid at $0.10 cost/tx)');
    console.log('  ' + sep('─', 60));

    for (const mix of MIXES) {
        const row: string[] = [mix.name.padEnd(12)];
        for (const yld of YIELDS) {
            const { summary: s } = buildRampModel(mix, COSTS[0], yld);
            const ss2 = steadyStateARR(mix, COSTS[0], yld, s.endingRetainedCapital);
            row.push($n(ss2.arr).padStart(14));
        }
        console.log('  ' + row.join('  |  '));
    }

    console.log('\n' + line);
    console.log('  END OF BOARD LOCK MODEL — Genesis Reserve v1.0');
    console.log(line + '\n');
}

main();
