"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Company } from "@/lib/data/types";
import { analyzeCompany } from "@/lib/engine/company";
import { buildBenchmark, benchmarkMetric, cohortKey, DIMENSION_LABELS, MIN_COHORT, statsOf, type CohortDimension } from "@/lib/engine/benchmark";
import { CM } from "@/lib/engine/compareMetrics";
import { favorability, METRICS } from "@/lib/engine/metrics";
import type { ComparisonBasis, Period } from "@/lib/engine/periods";
import { fmtMetric, fmtPct } from "@/lib/format";
import { RankBars } from "../charts/charts";
import { CardHeader, MetricLabel, Select, Tip } from "../ui/primitives";
import { Delta } from "../fin/fin";

const BENCH_METRICS = ["laborGrowth", "laborIntensity", "laborGap", "gaRatio", "cogsRatio", "ebitdaMargin", "revenueGrowth", "operatingLeverage", "smRatio", "cashConversion"];
const TABLE_METRICS = ["revenueGrowth", "laborGrowth", "laborIntensity", "gaRatio", "cogsRatio", "ebitdaMargin", "operatingLeverage"];

export function CostBenchmark({ companies, period, basis, initialSubject }: { companies: Company[]; period: Period; basis: ComparisonBasis; initialSubject?: string }) {
  const router = useRouter();
  const gb = basis === "prior" ? "prior" : "yoy";
  const [dim, setDim] = useState<CohortDimension>("sector");
  const [metricKey, setMetricKey] = useState("laborGrowth");
  const [subject, setSubject] = useState<string>(initialSubject && companies.some((c) => c.id === initialSubject) ? initialSubject : companies.find((c) => c.id === "meridian-services")?.id ?? "none");
  const m = CM[metricKey];
  const analyses = useMemo(() => companies.map((c) => analyzeCompany(c.id, period)).filter((a) => a.current.status === "complete"), [companies, period]);
  const groups = useMemo(() => {
    const map = new Map<string, typeof analyses>();
    for (const a of analyses) {
      const k = cohortKey(a.company, dim, period);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(a);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [analyses, dim, period]);
  const bm = subject !== "none" ? buildBenchmark(subject, dim, companies, period) : null;
  const subjectGroup = bm ? bm.cohortLabel : null;
  const rank = analyses
    .map((a) => ({ label: a.company.name, id: a.company.id, value: m.get(a, gb), inCohort: subjectGroup ? cohortKey(a.company, dim, period) === subjectGroup : true }))
    .filter((r) => r.value !== null)
    .sort((x, y) => (y.value as number) - (x.value as number));
  const peerStats = bm ? benchmarkMetric(bm, metricKey, (a) => m.get(a, gb)) : null;
  const overall = statsOf(rank.map((r) => r.value));
  const highlight = bm ? rank.filter((r) => r.inCohort).map((r) => r.id) : undefined;

  return (
    <div className="space-y-3" data-testid="cost-benchmark">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 shadow-card">
        <Select ariaLabel="Benchmark metric" prefix="Metric" value={metricKey} onChange={setMetricKey} options={BENCH_METRICS.map((k) => ({ value: k, label: CM[k].label }))} />
        <Select ariaLabel="Cohort dimension" prefix="Compare by" value={dim} onChange={(v) => setDim(v as CohortDimension)} options={(["sector", "businessModel", "fund", "revenueBand", "vintage", "portfolio"] as CohortDimension[]).map((d) => ({ value: d, label: DIMENSION_LABELS[d] }))} />
        <Select
          ariaLabel="Focus company"
          prefix="Focus company"
          value={subject}
          onChange={setSubject}
          options={[{ value: "none", label: "None" }, ...companies.map((c) => ({ value: c.id, label: c.name }))]}
        />
        <span className="ml-auto text-xs text-muted">
          {period.label} · growth {gb === "yoy" ? "year-over-year" : "vs prior quarter"} · {analyses.length} companies with complete data
        </span>
      </div>

      <div className="grid gap-3 xl:grid-cols-5">
        <div className="rounded-lg border border-line bg-surface shadow-card xl:col-span-3">
          <CardHeader
            title={<MetricLabel k={metricKey} label={`${m.label} by company`} />}
            description={
              bm
                ? `Highlighted: ${bm.subject.company.name}'s ${DIMENSION_LABELS[dim].toLowerCase()} cohort (${bm.cohortLabel}). Line = peer median excl. ${bm.subject.company.name}.`
                : `Line = median of all ${rank.length} companies shown.`
            }
          />
          <div className="p-2">
            <RankBars
              data={rank}
              format={m.format}
              highlight={highlight}
              reference={bm ? peerStats?.stats.median ?? null : overall.median}
              referenceLabel={bm ? "Peer median" : "Median"}
              onSelect={(id) => router.push(`/companies/${id}`)}
            />
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface shadow-card xl:col-span-2" data-testid="cohort-panel">
          <CardHeader title={bm ? `${bm.subject.company.name} vs ${bm.cohortLabel} peers` : "Select a focus company"} description={bm ? bm.rule : "Choose a company to benchmark it against its cohort."} />
          {bm && (
            <div className="p-4">
              {bm.warnings.length > 0 && (
                <div className={cn("mb-3 space-y-1 rounded-md px-3 py-2 text-xs", bm.meaningful ? "bg-warn-soft text-warn" : "bg-neg-soft text-neg")} data-testid="cohort-warning">
                  {bm.warnings.map((w) => (
                    <div key={w} className="flex gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {w}
                    </div>
                  ))}
                </div>
              )}
              <div className="mb-3 text-xs text-muted">
                Peers ({bm.peers.length}): {bm.peers.map((p) => p.company.name).join(", ") || "none"}
                {bm.ineligible.length > 0 && <span> · Not eligible: {bm.ineligible.map((x) => `${x.company.name} (${x.reason.toLowerCase()})`).join(", ")}</span>}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-muted">
                    <th className="py-1.5 text-left font-medium">Metric</th>
                    <th className="py-1.5 text-right font-medium">Company</th>
                    <th className="py-1.5 text-right font-medium">Median</th>
                    <th className="py-1.5 text-right font-medium">vs median</th>
                  </tr>
                </thead>
                <tbody>
                  {TABLE_METRICS.map((k) => {
                    const mm = CM[k];
                    const mb = benchmarkMetric(bm, k, (a) => mm.get(a, gb));
                    const dFormat = mm.format === "pct" || mm.format === "pp" ? "pp" : mm.format;
                    return (
                      <tr key={k} className={cn("border-b border-line/60 last:border-0", k === metricKey && "bg-brand-soft/40")}>
                        <td className="py-1.5 text-ink-2">
                          <MetricLabel k={k} label={mm.label} />
                        </td>
                        <td className="num py-1.5 text-right font-medium text-ink">{fmtMetric(mb.subject, mm.format)}</td>
                        <td className="num py-1.5 text-right text-ink-2">{bm.meaningful ? fmtMetric(mb.stats.median, mm.format) : <Tip content={`Fewer than ${MIN_COHORT} eligible peers`}><span className="text-faint">n &lt; {MIN_COHORT}</span></Tip>}</td>
                        <td className="py-1.5 text-right">{bm.meaningful ? <Delta value={mb.deltaVsMedian} metricKey={METRICS[k] ? k : "ebitdaMargin"} format={dFormat} showIcon={false} /> : <span className="text-faint">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {peerStats && bm.meaningful && (
                <p className="mt-3 text-xs text-muted">
                  {m.label}: {bm.subject.company.name} ranks above {fmtPct(peerStats.percentile, { decimals: 0 })} of peers (peer range {fmtMetric(peerStats.stats.min, m.format)} to {fmtMetric(peerStats.stats.max, m.format)}).{" "}
                  {favorability(metricKey, peerStats.deltaVsMedian) === "neg" ? "Unfavorable versus the median." : favorability(metricKey, peerStats.deltaVsMedian) === "pos" ? "Favorable versus the median." : ""}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface shadow-card" data-testid="group-benchmark">
        <CardHeader
          title={`Cost and profitability benchmarks by ${DIMENSION_LABELS[dim].toLowerCase()}`}
          description="Median per group (n = companies with complete data). Groups with fewer than 3 companies are shown but marked as not meaningful."
        />
        <div className="thin-scroll overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-line bg-subtle text-xs text-muted">
                <th className="px-4 py-2 text-left font-medium">{DIMENSION_LABELS[dim]}</th>
                <th className="px-3 py-2 text-right font-medium">n</th>
                {TABLE_METRICS.map((k) => (
                  <th key={k} className="px-3 py-2 text-right font-medium">
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
                  <tr key={g} className={cn("border-b border-line/60", small && "text-faint")}>
                    <td className="px-4 py-2">
                      <div className="font-medium text-ink">{g}</div>
                      <div className="text-[11px] text-muted">
                        {list.map((a) => a.company.name).join(", ")}
                        {small && <span className="ml-1 text-warn">· too small</span>}
                        {mixed && <span className="ml-1 text-warn">· mixed sectors</span>}
                      </div>
                    </td>
                    <td className="num px-3 py-2 text-right">{list.length}</td>
                    {TABLE_METRICS.map((k) => {
                      const st = statsOf(list.map((a) => CM[k].get(a, gb)));
                      return (
                        <td key={k} className={cn("num px-3 py-2 text-right", small ? "text-faint" : "text-ink-2")}>
                          {fmtMetric(st.median, CM[k].format)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-start gap-1.5 border-t border-line px-4 py-2 text-[11px] text-muted">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          Cost ratios differ structurally between software and services businesses; compare within a sector or business model. Growth metrics for acquisition-affected companies are reported (not organic) unless entity-level data exists.
        </div>
      </div>
    </div>
  );
}
