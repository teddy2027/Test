"use client";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, Columns3, Database, ExternalLink, Lightbulb, ShieldAlert } from "lucide-react";
import { getData } from "@/lib/data";
import { lastReportedLabel } from "@/lib/data/calendar";
import { analyzeCompany } from "@/lib/engine/company";
import { benchmarkMetric, buildBenchmark } from "@/lib/engine/benchmark";
import type { Insight } from "@/lib/engine/insights";
import { METRICS, type MetricFormat } from "@/lib/engine/metrics";
import { resolvePeriod, type Period } from "@/lib/engine/periods";
import { companyQuarterly } from "@/lib/engine/series";
import { fmtMetric, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useScope } from "@/lib/state/hooks";
import { SeriesChart, SERIES_HEX } from "../charts/charts";
import { ConnectionBadge, Delta, SeverityBadge, WatchButton } from "../fin/fin";
import { Badge, Button, MetricLabel, Sheet } from "../ui/primitives";

function figureText(v: number | null, f: MetricFormat, label: string) {
  if (f === "count") return v === null ? "N/A" : String(v);
  return fmtMetric(v, f, { signed: f === "pp" || /growth|variance|change|gap/i.test(label) });
}

export function FigureGrid({ figures }: { figures: Insight["figures"] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
      {figures.map((f) => (
        <div key={f.label} className="bg-surface px-3 py-2">
          <div className="text-[11px] text-muted">{f.label}</div>
          <div className="num text-sm font-semibold text-ink">{figureText(f.value, f.format, f.label)}</div>
        </div>
      ))}
    </div>
  );
}

/** History chart for the insight's metrics: same-unit amounts are indexed to 100 so they share one axis honestly. */
function InsightHistory({ insight, period }: { insight: Insight; period: Period }) {
  const rows = useMemo(() => companyQuarterly(insight.companyId, period.end, 11), [insight.companyId, period.end]);
  const keys = insight.chartMetrics.filter((k) => METRICS[k]);
  const usdKeys = keys.filter((k) => METRICS[k].format === "usd").slice(0, 2);
  const pctKeys = keys.filter((k) => METRICS[k].format === "pct").slice(0, 2);
  const blocks: React.ReactNode[] = [];
  if (usdKeys.length === 2) {
    const base = rows.find((r) => usdKeys.every((k) => (r as unknown as Record<string, number | null>)[k] !== null));
    const data = rows.map((r) => {
      const rec = r as unknown as Record<string, number | null>;
      const b = base as unknown as Record<string, number | null>;
      return { label: r.label, fullLabel: r.fullLabel, ...Object.fromEntries(usdKeys.map((k) => [k, rec[k] !== null && b?.[k] ? ((rec[k] as number) / (b[k] as number)) * 100 : null])) };
    });
    blocks.push(
      <div key="idx">
        <div className="mb-1 text-xs font-medium text-ink-2">
          {usdKeys.map((k) => METRICS[k].label).join(" vs ")} — indexed ({base?.fullLabel} = 100)
        </div>
        <SeriesChart data={data} series={usdKeys.map((k, i) => ({ key: k, name: METRICS[k].label, color: SERIES_HEX[i === 0 ? 1 : 0] }))} format="ratio" indexed height={200} />
      </div>,
    );
  } else if (usdKeys.length === 1) {
    blocks.push(
      <div key="amt">
        <div className="mb-1 text-xs font-medium text-ink-2">{METRICS[usdKeys[0]].label} by quarter</div>
        <SeriesChart data={rows as unknown as Record<string, unknown>[]} series={[{ key: usdKeys[0], name: METRICS[usdKeys[0]].label }]} format="usd" kind="bar" height={190} />
      </div>,
    );
  }
  if (pctKeys.length) {
    blocks.push(
      <div key="pct">
        <div className="mb-1 text-xs font-medium text-ink-2">{pctKeys.map((k) => METRICS[k].label).join(" and ")} by quarter</div>
        <SeriesChart data={rows as unknown as Record<string, unknown>[]} series={pctKeys.map((k, i) => ({ key: k, name: METRICS[k].label, color: SERIES_HEX[i] }))} format="pct" height={190} />
      </div>,
    );
  }
  return <div className="space-y-4">{blocks}</div>;
}

const COMPONENTS: { key: string; label: string; format: MetricFormat }[] = [
  { key: "revenue", label: "Revenue", format: "usd" },
  { key: "directLabor", label: "Direct labor (COGS)", format: "usd" },
  { key: "operatingPersonnel", label: "Operating personnel (opex)", format: "usd" },
  { key: "laborExpense", label: "Total labor", format: "usd" },
  { key: "cogs", label: "COGS", format: "usd" },
  { key: "generalAdmin", label: "G&A", format: "usd" },
  { key: "opex", label: "Operating expenses", format: "usd" },
  { key: "ebitda", label: "EBITDA", format: "usd" },
  { key: "cfo", label: "Operating cash flow", format: "usd" },
  { key: "employees", label: "Headcount (period end)", format: "count" },
];

export function InsightDrawer({ insight, onClose }: { insight: Insight | null; onClose: () => void }) {
  const { companies, data } = useScope();
  const open = !!insight;
  return (
    <Sheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      width={760}
      title={insight ? insight.title : ""}
      description={insight ? `${insight.companyName} · ${insight.category} · ${insight.period}${insight.comparison ? ` · ${insight.comparison}` : ""}` : undefined}
      headerExtra={insight ? <div className="mt-2 flex items-center gap-2"><SeverityBadge severity={insight.severity} /><Badge tone="outline">{insight.category}</Badge></div> : null}
    >
      {insight && <DrawerBody insight={insight} universe={companies.length ? companies : data.companies} onClose={onClose} />}
    </Sheet>
  );
}

function DrawerBody({ insight, universe, onClose }: { insight: Insight; universe: ReturnType<typeof getData>["companies"]; onClose: () => void }) {
  const data = getData();
  const { selection } = useScope();
  const period = resolvePeriod(selection);
  const c = data.companyById.get(insight.companyId)!;
  const a = analyzeCompany(c.id, period);
  const bm = buildBenchmark(c.id, "sector", universe.some((x) => x.id === c.id) ? universe : [...universe, c], period);
  const peerRows: { key: string; label: string; get: (x: typeof a) => number | null; format: MetricFormat }[] = [
    { key: "revenueGrowth", label: "Revenue growth (YoY)", get: (x) => x.yoy?.revenueGrowth ?? null, format: "pct" },
    { key: "laborGrowth", label: "Labor cost growth (YoY)", get: (x) => x.yoy?.laborGrowth ?? null, format: "pct" },
    { key: "laborIntensity", label: "Labor / revenue", get: (x) => x.current.metrics.laborIntensity, format: "pct" },
    { key: "grossMargin", label: "Gross margin", get: (x) => x.current.metrics.grossMargin, format: "pct" },
    { key: "ebitdaMargin", label: "EBITDA margin", get: (x) => x.current.metrics.ebitdaMargin, format: "pct" },
    { key: "gaRatio", label: "G&A / revenue", get: (x) => x.current.metrics.gaRatio, format: "pct" },
    { key: "cashConversion", label: "Cash conversion", get: (x) => x.current.metrics.cashConversion, format: "pct" },
  ];
  const hasCurrent = a.current.status === "complete";
  const y = a.yoy;
  return (
    <div className="space-y-5 p-5" data-testid="insight-drawer">
      {/* 1. Company */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-3">
        <WatchButton id={c.id} />
        <Link href={`/companies/${c.id}`} onClick={onClose} className="text-base font-semibold text-ink hover:text-brand">
          {c.name}
        </Link>
        <span className="text-sm text-muted">
          {c.subsector} · {data.funds.find((f) => f.id === c.fund)!.shortName} · {c.businessModel}
        </span>
        <span className="ml-auto">
          <ConnectionBadge company={c} />
        </span>
      </div>

      {/* Finding */}
      <section>
        <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <Lightbulb className="h-3.5 w-3.5" /> Computed finding
        </h4>
        <p className="text-[15px] leading-relaxed text-ink">{insight.finding}</p>
        {insight.figures.length > 0 && <div className="mt-3"><FigureGrid figures={insight.figures} /></div>}
      </section>

      {/* 2. KPI history */}
      {hasCurrent && (
        <section className="rounded-lg border border-line bg-surface p-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">KPI history · last 11 quarters</h4>
          <InsightHistory insight={insight} period={period} />
        </section>
      )}

      {/* 3. Cohort comparison */}
      {hasCurrent && (
        <section className="rounded-lg border border-line bg-surface">
          <div className="border-b border-line px-4 py-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Comparison with {c.sector.toLowerCase()} peers</h4>
            <p className="mt-0.5 text-xs text-muted">{bm.rule}</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-4 py-1.5 text-left font-medium">Metric</th>
                <th className="px-3 py-1.5 text-right font-medium">{c.name}</th>
                <th className="px-3 py-1.5 text-right font-medium">Peer median</th>
                <th className="px-4 py-1.5 text-right font-medium">Difference</th>
              </tr>
            </thead>
            <tbody>
              {peerRows.map((r) => {
                const mb = benchmarkMetric(bm, r.key, r.get);
                return (
                  <tr key={r.key} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-1.5 text-ink-2">
                      <MetricLabel k={r.key} label={r.label} />
                    </td>
                    <td className="num px-3 py-1.5 text-right font-medium text-ink">{fmtMetric(mb.subject, r.format)}</td>
                    <td className="num px-3 py-1.5 text-right text-ink-2">
                      {fmtMetric(mb.stats.median, r.format)} <span className="text-[11px] text-faint">n={mb.stats.n}</span>
                    </td>
                    <td className="px-4 py-1.5 text-right">
                      <Delta value={mb.deltaVsMedian} metricKey={r.key} format="pp" showIcon={false} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {bm.warnings.length > 0 && (
            <div className="space-y-1 border-t border-line bg-warn-soft/50 px-4 py-2 text-xs text-warn">
              {bm.warnings.map((w) => (
                <div key={w} className="flex gap-1.5">
                  <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
                  {w}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 4. Component metrics */}
      {hasCurrent && y && (
        <section className="rounded-lg border border-line bg-surface">
          <div className="border-b border-line px-4 py-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Underlying components · {period.label} vs {y.period.label}</h4>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {COMPONENTS.map((r) => {
                const cur = (a.current.metrics as unknown as Record<string, number | null>)[r.key];
                const prev = (y.base.metrics as unknown as Record<string, number | null>)[r.key];
                const g = cur !== null && prev !== null && prev > 0 ? cur / prev - 1 : null;
                return (
                  <tr key={r.key} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-1.5 text-ink-2">{r.label}</td>
                    <td className="num px-3 py-1.5 text-right text-ink-2">{fmtMetric(prev, r.format)}</td>
                    <td className="num px-3 py-1.5 text-right font-medium text-ink">{fmtMetric(cur, r.format)}</td>
                    <td className="px-4 py-1.5 text-right">
                      <Delta value={g} metricKey={["revenue", "ebitda", "cfo"].includes(r.key) ? "revenueGrowth" : r.key === "employees" ? "employees" : "laborGrowth"} showIcon={false} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* 5. Possible reasons */}
      <section className="rounded-lg border border-line bg-surface p-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Possible explanations worth investigating</h4>
        <ul className="space-y-1.5 text-sm text-ink-2">
          {insight.explanations.map((e) => (
            <li key={e} className="flex gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" />
              {e}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">These are hypotheses for the operating partner and management to test. A detected difference or correlation does not establish its cause.</p>
        {insight.caveats.length > 0 && (
          <div className="mt-3 space-y-1 rounded-md bg-warn-soft/60 px-3 py-2 text-xs text-warn">
            {insight.caveats.map((cv) => (
              <div key={cv}>{cv}</div>
            ))}
          </div>
        )}
      </section>

      {/* 6. Data context */}
      <section className="rounded-lg border border-line bg-surface p-4">
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <Database className="h-3.5 w-3.5" /> Data source & period context
        </h4>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          <dt className="text-muted">Source</dt>
          <dd className="text-ink-2">{c.dataSource}</dd>
          <dt className="text-muted">Finance system</dt>
          <dd className="text-ink-2">{c.accountingSystem}</dd>
          <dt className="text-muted">Last refreshed</dt>
          <dd className="text-ink-2">{formatDateTime(c.lastUpdated)}</dd>
          <dt className="text-muted">Data through</dt>
          <dd className="text-ink-2">{lastReportedLabel(c.lastReportedMonth)}</dd>
          <dt className="text-muted">Analysis period</dt>
          <dd className="text-ink-2">
            {insight.period}
            {insight.comparison ? ` · ${insight.comparison}` : ""}
          </dd>
          <dt className="text-muted">Drill-down depth</dt>
          <dd className={cn(c.connection === "dualentry" ? "text-brand-ink" : "text-ink-2")}>
            {c.connection === "dualentry" ? "Entity, account and balance-sheet level (DualEntry ledger)" : "Consolidated lines as submitted"}
          </dd>
        </dl>
      </section>

      <div className="flex flex-wrap gap-2 pb-4">
        <Link href={`/companies/${c.id}`} onClick={onClose}>
          <Button variant="primary">
            Inspect company data <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
        {c.lastReportedMonth >= 0 && (
          <>
            <Link href={`/companies/${c.id}#peers`} onClick={onClose}>
              <Button>
                <Columns3 className="h-3.5 w-3.5" /> Compare with peers
              </Button>
            </Link>
            <Link href={`/insights?tab=ask&q=${encodeURIComponent(`Compare ${c.name} with other ${c.sector === "Software" ? "software" : "services"} businesses`)}`} onClick={onClose}>
              <Button variant="ghost">
                <ExternalLink className="h-3.5 w-3.5" /> Ask about {c.name}
              </Button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
