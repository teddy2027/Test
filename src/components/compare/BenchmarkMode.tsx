"use client";
import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, Info } from "lucide-react";
import { cn } from "@/lib/cn";
import { cohortKey, DIMENSION_LABELS, MIN_COHORT, statsOf } from "@/lib/engine/benchmark";
import { CM } from "@/lib/engine/compareMetrics";
import { THRESHOLDS } from "@/lib/engine/insights";
import { comparisonLabel } from "@/lib/engine/periods";
import { buildCsv, downloadText, slug } from "@/lib/export";
import { fmtMetric, fmtPp } from "@/lib/format";
import { usePortfolio } from "@/lib/state/hooks";
import { Button, CardHeader, MetricLabel } from "../ui/primitives";
import { CompareChart, GROUP_BY, METRIC_OPTIONS, type GroupBy } from "./CompareChart";

/** Cost and profitability measures shown side by side for every group. */
const TABLE_METRICS = ["revenueGrowth", "laborGrowth", "laborIntensity", "cogsRatio", "gaRatio", "smRatio", "ebitdaMargin", "operatingLeverage"];
const ALL_METRICS = METRIC_OPTIONS.flatMap((g) => g.keys);

/** Benchmarking: one measure across companies (grouped), plus the medians of every cost measure for each group. */
export function BenchmarkMode() {
  const { summary, period, basis } = usePortfolio();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const gb = basis === "prior" ? "prior" : "yoy";
  const metric = ALL_METRICS.includes(params.get("metric") ?? "") ? params.get("metric")! : "laborIntensity";
  const groupParam = params.get("group") as GroupBy | null;
  const groupBy: GroupBy = groupParam && GROUP_BY.includes(groupParam) ? groupParam : "businessModel";
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const complete = useMemo(() => summary.analyses.filter((a) => a.current.status === "complete"), [summary.analyses]);
  const tableDim = groupBy === "none" ? "sector" : groupBy;
  const groups = useMemo(() => {
    const map = new Map<string, typeof complete>();
    for (const a of complete) {
      const k = cohortKey(a.company, tableDim, period);
      map.set(k, [...(map.get(k) ?? []), a]);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [complete, tableDim, period]);
  const withLabor = complete.filter((a) => CM.laborGap.get(a, gb) !== null);
  const outpacing = withLabor.filter((a) => (CM.laborGap.get(a, gb) ?? 0) > 0);
  const flagged = withLabor.filter((a) => (CM.laborGap.get(a, gb) ?? 0) > THRESHOLDS.laborGapPp);

  const exportCsv = () =>
    downloadText(
      `benchmark-by-${slug(DIMENSION_LABELS[tableDim])}-${slug(period.label)}.csv`,
      buildCsv(
        groups,
        [
          { header: DIMENSION_LABELS[tableDim], format: "text", get: ([g]) => g },
          { header: "Companies (n)", format: "text", get: ([, l]) => String(l.length) },
          { header: "Benchmark meaningful", format: "text", get: ([, l]) => (l.length >= MIN_COHORT ? "Yes" : `No (fewer than ${MIN_COHORT})`) },
          ...TABLE_METRICS.map((k) => ({ header: `${CM[k].label} (median)`, format: CM[k].format, get: ([, l]: [string, typeof complete]) => statsOf(l.map((a) => CM[k].get(a, gb))).median })),
        ],
        { title: `DualEntry Portfolio Intelligence - Cost and profitability benchmarks by ${DIMENSION_LABELS[tableDim].toLowerCase()}`, period: period.label, comparison: comparisonLabel(gb, period), scope: `${complete.length} companies with complete data` },
      ),
    );

  return (
    <div className="space-y-3" data-testid="benchmark-mode">
      <p className="rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-ink-2 shadow-card" data-testid="benchmark-summary">
        Labor cost grew faster than revenue at <span className="font-semibold text-ink">{outpacing.length} of {withLabor.length}</span> companies with labor data; <span className="font-semibold text-ink">{flagged.length}</span> exceed the {fmtPp(THRESHOLDS.laborGapPp, { signed: false, decimals: 0 })} attention threshold
        {flagged.length ? ` (${flagged.map((a) => `${a.company.name} ${fmtPp(CM.laborGap.get(a, gb))}`).join(", ")})` : ""}.
      </p>
      <CompareChart analyses={summary.analyses} period={period} gb={gb} metric={metric} setMetric={(k) => set({ metric: k })} groupBy={groupBy} setGroupBy={(g) => set({ group: g })} />
      <div className="rounded-lg border border-line bg-surface shadow-card" data-testid="group-benchmark">
        <CardHeader
          title={`Medians by ${DIMENSION_LABELS[tableDim].toLowerCase()}`}
          description={`Every cost and profitability measure at once · median of companies with complete ${period.label} data · groups below ${MIN_COHORT} companies are shown but not benchmarked`}
          actions={
            <Button size="sm" onClick={exportCsv} className="no-print" data-testid="benchmark-export">
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          }
        />
        <div className="thin-scroll overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-line bg-subtle text-xs text-muted">
                <th className="px-4 py-2 text-left font-medium">{DIMENSION_LABELS[tableDim]}</th>
                <th className="px-3 py-2 text-right font-medium">n</th>
                {TABLE_METRICS.map((k) => (
                  <th key={k} className={cn("px-3 py-2 text-right font-medium", k === metric && "text-brand-ink")}>
                    <MetricLabel k={k} label={CM[k].label} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(([g, list]) => {
                const small = list.length < MIN_COHORT;
                const mixed = new Set(list.map((a) => a.company.sector)).size > 1;
                return (
                  <tr key={g} className={cn("border-b border-line/60", small && "text-faint")} data-testid="group-row">
                    <td className="px-4 py-2">
                      <div className="font-medium text-ink">{g}</div>
                      <div className="text-[11px] text-muted">
                        {list.map((a) => a.company.name).join(", ")}
                        {small && <span className="ml-1 text-warn">· too small to benchmark</span>}
                        {mixed && <span className="ml-1 text-warn">· mixes software and services</span>}
                      </div>
                    </td>
                    <td className="num px-3 py-2 text-right">{list.length}</td>
                    {TABLE_METRICS.map((k) => (
                      <td key={k} className={cn("num px-3 py-2 text-right", small ? "text-faint" : "text-ink-2", k === metric && !small && "bg-brand-soft/30 font-medium text-ink")}>
                        {small ? "—" : fmtMetric(statsOf(list.map((a) => CM[k].get(a, gb))).median, CM[k].format, { signed: CM[k].format === "pp" })}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-start gap-1.5 border-t border-line px-4 py-2 text-[11px] text-muted">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          Cost ratios differ structurally between software and services businesses — compare within a sector or business model. Growth for acquisition-affected companies is reported, not organic, unless entity-level data exists.
        </div>
      </div>
    </div>
  );
}
