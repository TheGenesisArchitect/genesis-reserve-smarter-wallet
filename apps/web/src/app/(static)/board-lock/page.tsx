/**
 * /app/board-lock/page.tsx
 *
 * Genesis Reserve — Board Lock Investor Model
 * Locked pricing: fee = max($0.25, amount × 0.008%)
 * Scenarios: Bear / Base / Bull
 */
'use client';

import React, { useState } from 'react';

// ─── Fee Engine ──────────────────────────────────────────────────────────────
const txFee = (amount: number): number => Math.max(0.25, amount * 0.00008);

const MIXES = {
  retail:  [[100,0.35],[250,0.25],[500,0.20],[1000,0.15],[2500,0.05]] as [number,number][],
  balanced:[[250,0.25],[500,0.25],[1000,0.20],[2500,0.15],[5000,0.10],[10000,0.05]] as [number,number][],
  high:    [[1000,0.20],[2500,0.25],[5000,0.25],[10000,0.20],[25000,0.10]] as [number,number][],
};

const avgFee = (weights: [number, number][]): number =>
  weights.reduce((s, [a, w]) => s + txFee(a) * w, 0);

const RAMP = [10_000,15_000,20_000,25_000,30_000,40_000,50_000,60_000,70_000,80_000,90_000,100_000];

interface MonthRow {
  month: number;
  txCount: number;
  grossRevenue: number;
  contributionMargin: number;
  retainedCapital: number;
  treasuryYield: number;
}

interface ScenarioResult {
  avgFeePerTx: number;
  year1GrossRevenue: number;
  year1TxMargin: number;
  year1Treasury: number;
  year1Combined: number;
  endingRetained: number;
  ssAnnualTxRev: number;
  ssAnnualTxMargin: number;
  ssTreasuryYield: number;
  ssARR: number;
  ssCMRate: number;
  rows: MonthRow[];
}

function runScenario(
  mix: [number,number][],
  costPerTx: number,
  apy: number,
): ScenarioResult {
  const af = avgFee(mix);
  let retained = 0;
  let y1Gross = 0, y1Margin = 0, y1Treasury = 0;
  const rows: MonthRow[] = [];

  for (const [i, txCount] of RAMP.entries()) {
    const gross = txCount * af;
    const margin = gross - txCount * costPerTx;
    const yield_ = retained * (apy / 12);
    if (margin > 0) retained += margin;
    y1Gross += gross;
    y1Margin += margin;
    y1Treasury += yield_;
    rows.push({ month: i + 1, txCount, grossRevenue: gross, contributionMargin: margin, retainedCapital: retained, treasuryYield: yield_ });
  }

  // Steady-state 100K tx/mo annualized, starting from ending retained
  const monthlyMargin = 100_000 * (af - costPerTx);
  let ssDeployed = retained;
  let ssTreasury = 0;
  for (let m = 0; m < 12; m++) {
    ssTreasury += ssDeployed * (apy / 12);
    if (monthlyMargin > 0) ssDeployed += monthlyMargin;
  }
  const ssTxRev   = 100_000 * af * 12;
  const ssTxMargin = 100_000 * (af - costPerTx) * 12;

  return {
    avgFeePerTx: af,
    year1GrossRevenue: y1Gross,
    year1TxMargin: y1Margin,
    year1Treasury: y1Treasury,
    year1Combined: y1Gross + y1Treasury,
    endingRetained: retained,
    ssAnnualTxRev: ssTxRev,
    ssAnnualTxMargin: ssTxMargin,
    ssTreasuryYield: ssTreasury,
    ssARR: ssTxRev + ssTreasury,
    ssCMRate: ssTxRev > 0 ? (ssTxMargin / ssTxRev) * 100 : 0,
    rows,
  };
}

// ─── Canonical Scenarios ─────────────────────────────────────────────────────
const SCENARIOS = [
  {
    key: 'bear',
    label: 'Bear',
    subtitle: 'Retail mix · $0.20/tx cost · 6% APY',
    mix: MIXES.retail,
    costPerTx: 0.20,
    apy: 0.06,
    color: 'bg-red-950 border-red-700',
    badge: 'bg-red-700',
    accent: 'text-red-300',
  },
  {
    key: 'base',
    label: 'Base',
    subtitle: 'Balanced mix · $0.20/tx cost · 10% APY',
    mix: MIXES.balanced,
    costPerTx: 0.20,
    apy: 0.10,
    color: 'bg-slate-900 border-slate-600',
    badge: 'bg-slate-600',
    accent: 'text-sky-300',
  },
  {
    key: 'bull',
    label: 'Bull',
    subtitle: 'High-ticket mix · $0.10/tx cost · 14% APY',
    mix: MIXES.high,
    costPerTx: 0.10,
    apy: 0.14,
    color: 'bg-emerald-950 border-emerald-700',
    badge: 'bg-emerald-700',
    accent: 'text-emerald-300',
  },
] as const;

// ─── Sensitivity Grid Data ────────────────────────────────────────────────────
const GRID_MIXES: { label: string; mix: [number,number][] }[] = [
  { label: 'Retail-Heavy', mix: MIXES.retail },
  { label: 'Balanced',     mix: MIXES.balanced },
  { label: 'High-Ticket',  mix: MIXES.high },
];
const GRID_YIELDS = [
  { label: 'Bear 6%',  apy: 0.06 },
  { label: 'Base 10%', apy: 0.10 },
  { label: 'Bull 14%', apy: 0.14 },
];

// ─── Utilities ────────────────────────────────────────────────────────────────
const fmt$ = (n: number, dec = 0): string =>
  '$' + n.toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmtPct = (n: number): string => n.toFixed(1) + '%';

// ─── Sub-components ───────────────────────────────────────────────────────────
function KPICard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-widest text-white/40">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-white/40">{sub}</p>}
    </div>
  );
}

function MonthTable({ rows }: { rows: MonthRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-right text-sm">
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-white/40">
            <th className="pb-2 text-left">Mo</th>
            <th className="pb-2">Tx Count</th>
            <th className="pb-2">Gross Rev</th>
            <th className="pb-2">Contrib Margin</th>
            <th className="pb-2">Retained Capital</th>
            <th className="pb-2">Treasury Yield</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.month} className="border-b border-white/5 hover:bg-white/5">
              <td className="py-1.5 text-left text-white/60">{r.month}</td>
              <td className="py-1.5 text-white/80">{r.txCount.toLocaleString()}</td>
              <td className="py-1.5 text-white">{fmt$(r.grossRevenue)}</td>
              <td className={`py-1.5 font-medium ${r.contributionMargin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmt$(r.contributionMargin)}
              </td>
              <td className="py-1.5 text-sky-300">{fmt$(r.retainedCapital)}</td>
              <td className="py-1.5 text-yellow-300">{fmt$(r.treasuryYield, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BoardLockPage() {
  const [activeScenario, setActiveScenario] = useState<string>('base');
  const [showDetail, setShowDetail] = useState(false);

  const results = Object.fromEntries(
    SCENARIOS.map(s => [s.key, runScenario(s.mix, s.costPerTx, s.apy)])
  ) as Record<string, ScenarioResult>;

  const base = results.base;
  const active = results[activeScenario];
  const activeS = SCENARIOS.find(s => s.key === activeScenario)!;

  // ARR bridge (base scenario)
  const arrUplift = base.ssARR - base.year1Combined;
  const arrUpliftPct = (arrUplift / base.year1Combined) * 100;

  return (
    <div className="min-h-screen bg-black p-6 text-white">
      <div className="mx-auto max-w-5xl space-y-8">

        {/* ── Header ── */}
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold uppercase tracking-widest">Board Lock</span>
            <span className="text-xs text-white/30">v1.0 · {new Date().toISOString().slice(0, 10)}</span>
          </div>
          <h1 className="text-3xl font-bold">Genesis Reserve — Investor Model</h1>
          <p className="text-sm text-white/50">
            Pricing lock: <code className="rounded bg-white/10 px-1">fee = max($0.25, amount × 0.008%)</code>
            &nbsp;·&nbsp; Ramp: 10K → 100K tx/mo over 12 months &nbsp;·&nbsp; Treasury: positive margin deployed on-chain
          </p>
        </div>

        {/* ── Scenario Selector ── */}
        <div className="flex gap-3">
          {SCENARIOS.map(s => (
            <button
              key={s.key}
              onClick={() => setActiveScenario(s.key)}
              className={`flex-1 rounded-xl border p-4 text-left transition-all ${
                activeScenario === s.key ? s.color + ' opacity-100' : 'border-white/10 bg-white/5 opacity-50 hover:opacity-75'
              }`}
            >
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold uppercase ${s.badge} text-white`}>
                {s.label}
              </span>
              <p className="mt-1 text-xs text-white/50">{s.subtitle}</p>
              <p className={`mt-2 text-xl font-bold ${s.accent}`}>{fmt$(results[s.key].ssARR)}</p>
              <p className="text-xs text-white/30">Year-2 ARR</p>
            </button>
          ))}
        </div>

        {/* ── KPI Grid ── */}
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
            {activeS.label} Scenario — Key Performance Indicators
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KPICard label="Avg fee / tx"        value={fmt$(active.avgFeePerTx, 4)} sub="max($0.25, amt×0.008%)" />
            <KPICard label="Year-1 Tx Revenue"   value={fmt$(active.year1GrossRevenue)} sub="ramp 10K→100K tx/mo" />
            <KPICard label="Year-1 Tx Margin"    value={fmt$(active.year1TxMargin)} sub={fmtPct(active.year1TxMargin / active.year1GrossRevenue * 100) + ' of gross rev'} />
            <KPICard label="Year-1 Treasury"     value={fmt$(active.year1Treasury, 2)} sub={`${fmtPct(activeS.apy * 100)} APY on retained capital`} />
            <KPICard label="Ending Retained"     value={fmt$(active.endingRetained)} sub="deployable capital Y1 exit" />
            <KPICard label="Year-2 ARR (tx)"     value={fmt$(active.ssAnnualTxRev)} sub="100K tx/mo steady-state" />
            <KPICard label="Year-2 ARR (total)"  value={fmt$(active.ssARR)} sub="tx rev + treasury yield" />
            <KPICard label="Contribution Margin" value={fmtPct(active.ssCMRate)} sub="at steady-state" />
          </div>
        </div>

        {/* ── ARR Bridge ── */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/40">ARR Bridge (Base Scenario)</h2>
          <div className="space-y-2">
            {[
              { label: 'Year-1 gross tx revenue', value: fmt$(base.year1GrossRevenue), indent: false, highlight: false },
              { label: '+ Year-1 treasury yield',  value: fmt$(base.year1Treasury, 2),  indent: true,  highlight: false },
              { label: '= Year-1 combined',         value: fmt$(base.year1Combined),     indent: false, highlight: true  },
              { label: 'Year-2 run-rate tx revenue', value: fmt$(base.ssAnnualTxRev),   indent: false, highlight: false },
              { label: '+ Year-2 treasury yield',   value: fmt$(base.ssTreasuryYield),  indent: true,  highlight: false },
              { label: '= Year-2 ARR',              value: fmt$(base.ssARR),             indent: false, highlight: true  },
              { label: 'ARR uplift Y1→Y2',          value: fmt$(arrUplift) + '  (' + fmtPct(arrUpliftPct) + ')', indent: false, highlight: false },
            ].map(item => (
              <div key={item.label} className={`flex justify-between rounded px-3 py-1.5 ${item.highlight ? 'bg-sky-900/40 font-semibold' : ''}`}>
                <span className={`text-sm ${item.indent ? 'pl-4 text-white/50' : 'text-white/80'}`}>{item.label}</span>
                <span className={`text-sm tabular-nums ${item.highlight ? 'text-sky-300' : 'text-white'}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Sensitivity Grid ── */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-white/40">
            Sensitivity Grid — Steady-State ARR at 100K tx/mo
          </h2>

          {[
            { costLabel: '$0.20 / tx (conservative)', costPerTx: 0.20 },
            { costLabel: '$0.10 / tx (lean)',          costPerTx: 0.10 },
          ].map(costRow => {
            return (
              <div key={costRow.costLabel} className="mt-4">
                <p className="mb-2 text-xs text-white/40">{costRow.costLabel}</p>
                <table className="w-full text-right text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wider text-white/30">
                      <th className="pb-2 text-left">Mix</th>
                      {GRID_YIELDS.map(y => <th key={y.label} className="pb-2">{y.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {GRID_MIXES.map(m => {
                      const rowVals = GRID_YIELDS.map(y => {
                        const { endingRetained } = runScenario(m.mix, costRow.costPerTx, y.apy);
                        const af2 = avgFee(m.mix);
                        const mMonthlyMargin = 100_000 * (af2 - costRow.costPerTx);
                        let dep = endingRetained;
                        let tr2 = 0;
                        for (let mo = 0; mo < 12; mo++) {
                          tr2 += dep * (y.apy / 12);
                          if (mMonthlyMargin > 0) dep += mMonthlyMargin;
                        }
                        return 100_000 * af2 * 12 + tr2;
                      });
                      return (
                        <tr key={m.label} className="border-b border-white/5">
                          <td className="py-1.5 text-left text-white/60">{m.label}</td>
                          {rowVals.map((v, i) => (
                            <td key={i} className="py-1.5 font-semibold text-white">{fmt$(v)}</td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>

        {/* ── Monthly Detail Toggle ── */}
        <div>
          <button
            onClick={() => setShowDetail(v => !v)}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60 hover:bg-white/10 hover:text-white"
          >
            {showDetail ? '▲ Hide' : '▼ Show'} Monthly Ramp Detail — {activeS.label} Scenario
          </button>

          {showDetail && (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-5">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/40">
                {activeS.label} · Monthly Detail (10K → 100K tx/mo)
              </h2>
              <MonthTable rows={active.rows} />
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-white/10 pt-4 text-center text-xs text-white/20">
          Genesis Reserve Board Lock Model v1.0 · Confidential · Not for distribution
          &nbsp;·&nbsp; All figures in USD · APY = on-chain treasury deployment yield
        </div>
      </div>
    </div>
  );
}
