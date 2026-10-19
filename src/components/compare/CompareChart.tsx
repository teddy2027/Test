"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { cohortKey, DIMENSION_LABELS, MIN_COHORT, statsOf, type CohortDimension } from "@/lib/engine/benchmark";
import type { CompanyAnalysis } from "@/lib/engine/company";
import { CM } from "@/lib/engine/compareMetrics";
import type { Period } from "@/lib/engine/periods";
import { fmtMetric } from "@/lib/format";
import { RankBars } from "../charts/charts";
import { CardHeader, MetricLabel, Select } from "../ui/primitives";

/** Performance and cost measures that are comparable across companies of different size. */
export const METRIC_OPTIONS: { group: string; keys: string[] }[] = [
  { group: "Performance", keys: ["revenueGrowth", "ebitdaMargin", "ebitdaMarginChange", "grossMargin", "cashConversion"] },
  { group: "Cost", keys: ["laborIntensity", "laborGrowth", "laborGap", "cogsRatio", "gaRatio", "smRatio", "revenuePerEmployee"] },
];
export type GroupBy = "none" | CohortDimension;
export const GROUP_BY: GroupBy[] = ["none", "sector", "businessModel", "fund", "revenueBand", "vintage"];

/**
 * One chart for comparing every company on one measure, optionally grouped into peer cohorts
 * (cost benchmarking). Groups share one axis; a group median is shown only from MIN_COHORT companies.
 */
export function CompareChart({
  analyses,
  period,
  gb,
  metric,
  setMetric,
  groupBy,
  setGroupBy,
}: {
  analyses: CompanyAnalysis[];
  period: Period;
  gb: "prior" | "yoy";
  metric: string;
  setMetric: (k: string) => void;
  groupBy: GroupBy;
  setGroupBy: (g: GroupBy) => void;
}) {
  const router = useRouter();
  const m = CM[metric];
  const complete = useMemo(() => analyses.filter((a) => a.current.status === "complete"), [analyses]);
  const rows = complete.map((a) => ({ a, label: a.company.name, id: a.company.id, value: m.get(a, gb) })).filter((r) => r.value !== null);
  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "All companies", rows }];
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = cohortKey(r.a.company, groupBy, period);
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    return [...map.entries()].map(([key, list]) => ({ key, rows: list })).sort((x, y) => y.rows.length - x.rows.length || x.key.localeCompare(y.key));
  }, [rows, groupBy, period]);
  const values = rows.map((r) => r.value as number);
  const domain: [number, number] = [Math.min(0, ...values), Math.max(0, ...values)];
  const signed = m.format === "pp";
  const missing = complete.length - rows.length;
  const growthNote = metric.includes("Growth") || metric === "laborGap" || metric === "ebitdaMarginChange" ? ` · ${gb === "yoy" ? "year-over-year" : "vs prior quarter"}` : "";

  return (
    <div className="rounded-lg border border-line bg-surface shadow-card" data-testid="compare-chart">
      <CardHeader
        title={<MetricLabel k={metric} label={`${m.label} by company`} />}
        description={`${period.label}${growthNote} · line = median · click a bar to open${missing ? ` · ${missing} without this measure` : ""}`}
      />
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        <Select
          ariaLabel="Compare measure"
          prefix="Compare"
          value={metric}
          onChange={setMetric}
          options={METRIC_OPTIONS.flatMap((g) => g.keys.map((k) => ({ value: k, label: CM[k].label, group: g.group })))}
        />
        <Select
          ariaLabel="Group companies by"
          prefix="Group by"
          value={groupBy}
          onChange={(v) => setGroupBy(v as GroupBy)}
          options={GROUP_BY.map((d) => ({ value: d, label: d === "none" ? "No grouping" : DIMENSION_LABELS[d] }))}
        />
      </div>
      <div className="divide-y divide-line/70">
        {rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted">No companies with this measure for {period.label}.</p>}
        {groups.map((g) => {
          const small = groupBy !== "none" && g.rows.length < MIN_COHORT;
          const med = small ? null : statsOf(g.rows.map((r) => r.value)).median;
          const mixed = groupBy !== "none" && groupBy !== "sector" && new Set(g.rows.map((r) => r.a.company.sector)).size > 1 && m.group === "Cost efficiency";
          const sorted = [...g.rows].sort((x, y) => (y.value as number) - (x.value as number));
          return (
            <div key={g.key} className="px-2 pb-1 pt-2" data-testid="compare-group-block">
              {groupBy !== "none" && (
                <div className="flex flex-wrap items-baseline gap-x-2 px-2 text-sm">
                  <span className="font-semibold text-ink">{g.key}</span>
                  <span className="text-xs text-muted">
                    {g.rows.length} {g.rows.length === 1 ? "company" : "companies"}
                    {med !== null && ` · median ${fmtMetric(med, m.format, { signed })}`}
                  </span>
                  {small && <span className="text-xs text-warn">too small to benchmark (fewer than {MIN_COHORT})</span>}
                  {mixed && (
                    <span className="inline-flex items-center gap-1 text-xs text-warn">
                      <AlertTriangle className="h-3 w-3" /> mixes software and services
                    </span>
                  )}
                </div>
              )}
              <RankBars
                data={sorted.map(({ label, id, value }) => ({ label, id, value }))}
                format={m.format}
                reference={med}
                referenceLabel="Median"
                colorBySign={signed}
                domain={domain}
                onSelect={(id) => router.push(`/companies/${id}`)}
                height={Math.max(groupBy === "none" ? 268 : 90, sorted.length * 26 + 40)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
