"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Download, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { median, type N } from "@/lib/engine/core";
import { analyzeCompany } from "@/lib/engine/company";
import { benchmarkMetric, buildBenchmark, defaultDimension, DIMENSION_LABELS, type CohortDimension } from "@/lib/engine/benchmark";
import { COMPARE_METRICS, CM, type CompareMetric } from "@/lib/engine/compareMetrics";
import { favorability } from "@/lib/engine/metrics";
import { comparisonLabel, trendQuarters } from "@/lib/engine/periods";
import { useScope } from "@/lib/state/hooks";
import { buildCsv, downloadText, slug } from "@/lib/export";
import { fmtMetric } from "@/lib/format";
import { MultiLine, RankBars, SERIES_HEX } from "../charts/charts";
import { Delta } from "../fin/fin";
import { Badge, CardHeader, MetricLabel, Button, Segmented, Select, Tip } from "../ui/primitives";

const TREND_METRICS = ["revenueGrowth", "ebitdaMargin", "grossMargin", "laborIntensity", "gaRatio", "cashConversion", "revenue"];
const PEER_GROUPS: CompareMetric["group"][] = ["Growth", "Profitability", "Cost efficiency", "Cash flow", "Budget"];
/** A deviation from the peer median larger than this is highlighted (pct/pp metrics). */
const NOTABLE = 0.05;

function deltaFormat(m: CompareMetric) {
  return m.format === "pct" || m.format === "pp" ? "pp" : m.format;
}

type PeerSource = "portfolio" | "filters";

/** One company against similar companies: peer rule, n, medians, rank, trend vs peer median. */
export function PeersMode() {
  const { companies, period, basis, data } = useScope();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const gb = basis === "prior" ? "prior" : "yoy";
  const withData = useMemo(() => data.companies.filter((c) => c.lastReportedMonth >= 0), [data.companies]);
  const subjectParam = params.get("subject");
  const company = withData.find((c) => c.id === subjectParam) ?? withData.find((c) => c.id === "meridian-services") ?? withData[0];
  const source: PeerSource = params.get("peers") === "filters" ? "filters" : "portfolio";
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const [dim, setDim] = useState<CohortDimension>(() => defaultDimension(company));
  const [trendKey, setTrendKey] = useState("ebitdaMargin");
  const [barKey, setBarKey] = useState("laborIntensity");
  // Default: peers from every company with figures. Optionally limit peers to the companies in the current filters.
  const universe = useMemo(() => {
    if (source === "portfolio") return withData;
    const inScope = companies.filter((c) => c.lastReportedMonth >= 0);
    return inScope.some((c) => c.id === company.id) ? inScope : [...inScope, company];
  }, [source, withData, companies, company]);
  const bm = useMemo(() => buildBenchmark(company.id, dim, universe, period), [company.id, dim, universe, period]);
  const metrics = COMPARE_METRICS.filter((m) => PEER_GROUPS.includes(m.group));
  const exportCsv = () =>
    downloadText(
      `peer-comparison-${slug(company.name)}-${slug(period.label)}.csv`,
      buildCsv(
        metrics,
        [
          { header: "Metric", format: "text", get: (m) => m.label },
          { header: company.name, format: "text", get: (m) => fmtMetric(m.get(bm.subject, gb), m.format) },
          { header: "Peer median", format: "text", get: (m) => fmtMetric(benchmarkMetric(bm, m.key, (a) => m.get(a, gb)).stats.median, m.format) },
          { header: "Peer average", format: "text", get: (m) => fmtMetric(benchmarkMetric(bm, m.key, (a) => m.get(a, gb)).stats.mean, m.format) },
          { header: "n", format: "text", get: (m) => String(benchmarkMetric(bm, m.key, (a) => m.get(a, gb)).stats.n) },
        ],
        { title: `DualEntry Portfolio Intelligence - ${company.name} vs ${bm.cohortLabel} peers`, period: period.label, comparison: comparisonLabel(gb, period), scope: `Peers: ${bm.peers.map((p) => p.company.name).join(", ")}. Rule: ${bm.rule}` },
      ),
    );
  return (
    <section className="space-y-3" data-testid="peer-section">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 shadow-card" data-testid="peer-controls">
        <Select ariaLabel="Company" prefix="Company" value={company.id} onChange={(v) => set({ subject: v })} options={withData.map((c) => ({ value: c.id, label: c.name }))} />
        <Select
          ariaLabel="Peer cohort"
          prefix="Peers by"
          value={dim}
          onChange={(v) => setDim(v as CohortDimension)}
          options={(["sector", "businessModel", "revenueBand", "fund", "vintage", "portfolio"] as CohortDimension[]).map((d) => ({ value: d, label: DIMENSION_LABELS[d] }))}
        />
        <Segmented<PeerSource>
          ariaLabel="Peers from"
          value={source}
          onChange={(v) => set({ peers: v })}
          options={[
            { value: "portfolio", label: "Whole portfolio", title: "Peers from every company with figures" },
            { value: "filters", label: "Current filters", title: "Peers only from the companies in the filter bar" },
          ]}
        />
        <span className="text-xs text-muted">
          {period.label} · growth {comparisonLabel(gb, period)}
        </span>
        <Button size="sm" onClick={exportCsv} className="no-print ml-auto" data-testid="peer-export">
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>
      <CohortMode bm={bm} metrics={metrics} gb={gb} trendKey={trendKey} setTrendKey={setTrendKey} barKey={barKey} setBarKey={setBarKey} periodEnd={period.end} />
    </section>
  );
}

function CohortMode({
  bm,
  metrics,
  gb,
  trendKey,
  setTrendKey,
  barKey,
  setBarKey,
  periodEnd,
}: {
  bm: ReturnType<typeof buildBenchmark>;
  metrics: CompareMetric[];
  gb: "prior" | "yoy";
  trendKey: string;
  setTrendKey: (k: string) => void;
  barKey: string;
  setBarKey: (k: string) => void;
  periodEnd: number;
}) {
  const s = bm.subject;
  const peerIds = bm.peers.map((p) => p.company.id);
  const series = (key: string) => {
    const m = CM[key];
    return trendQuarters(periodEnd, 9).map((q) => {
      const sa = analyzeCompany(s.company.id, q);
      const peerVals: N[] = peerIds.map((id) => {
        const a = analyzeCompany(id, q);
        return a.current.status === "complete" ? m.get(a, gb) : null;
      });
      return { label: q.label.replace(" 20", " ’"), fullLabel: q.label, subject: sa.current.status === "complete" ? m.get(sa, gb) : null, median: median(peerVals) };
    });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const trend = useMemo(() => series(trendKey), [s.company.id, peerIds.join(), trendKey, periodEnd, gb]);
  const barData = [s, ...bm.peers].map((a) => ({ label: a.company.name, value: CM[barKey].get(a, gb), id: a.company.id })).sort((x, y) => (y.value ?? -9) - (x.value ?? -9));
  const barMed = benchmarkMetric(bm, barKey, (a) => CM[barKey].get(a, gb));
  return (
    <>
      <div className="grid gap-3 xl:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface p-4 shadow-card" data-testid="peer-rules">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Users className="h-4 w-4 text-muted" /> Peer selection
          </div>
          <div className="mt-2 text-sm text-ink-2">
            <span className="font-medium">{s.company.name}</span> vs <span className="font-medium">{bm.cohortLabel}</span> peers
          </div>
          <div className="mt-1 text-xs text-muted">{bm.rule}</div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="num text-2xl font-semibold text-ink" data-testid="peer-count">
              {bm.peers.length}
            </span>
            <span className="text-sm text-muted">eligible peers · subject excluded from baseline</span>
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {bm.peers.map((p) => (
              <li key={p.company.id} className="flex items-center justify-between gap-2">
                <Link href={`/companies/${p.company.id}`} className="text-ink-2 hover:text-brand">
                  {p.company.name}
                </Link>
                <span className="text-xs text-faint">{p.company.businessModel}</span>
              </li>
            ))}
            {bm.ineligible.map((x) => (
              <li key={x.company.id} className="flex items-center justify-between gap-2 text-faint">
                <span className="line-through">{x.company.name}</span>
                <span className="text-xs">{x.reason}</span>
              </li>
            ))}
          </ul>
          {bm.warnings.length > 0 && (
            <div className={cn("mt-3 space-y-1 rounded-md px-3 py-2 text-xs", bm.meaningful ? "bg-warn-soft text-warn" : "bg-neg-soft text-neg")} data-testid="small-cohort-warning">
              {bm.warnings.map((w) => (
                <div key={w} className="flex gap-1.5">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {w}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-lg border border-line bg-surface shadow-card xl:col-span-2">
          <CardHeader
            title={`${CM[barKey].label}: ${s.company.name} vs peers`}
            description={`Line = peer median (${fmtMetric(barMed.stats.median, CM[barKey].format)}, n = ${barMed.stats.n}); subject highlighted`}
            actions={<Select ariaLabel="Peer bar metric" value={barKey} onChange={setBarKey} options={metrics.filter((m) => m.normalized).map((m) => ({ value: m.key, label: m.label }))} />}
          />
          <div className="p-2">
            <RankBars data={barData} format={CM[barKey].format} highlight={[s.company.id]} reference={barMed.stats.median} referenceLabel="Peer median" height={Math.max(200, barData.length * 34 + 50)} />
          </div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-5">
        <div className="rounded-lg border border-line bg-surface shadow-card xl:col-span-3" data-testid="peer-table">
          <CardHeader title="Relative performance" description="Company value vs peer median and average; difference vs median in percentage points for ratios" />
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line bg-subtle text-xs text-muted">
                  <th className="px-4 py-2 text-left font-medium">Metric</th>
                  <th className="px-3 py-2 text-right font-medium">{s.company.name}</th>
                  <th className="px-3 py-2 text-right font-medium">Peer median</th>
                  <th className="px-3 py-2 text-right font-medium">Peer average</th>
                  <th className="px-3 py-2 text-right font-medium">vs median</th>
                  <th className="px-4 py-2 text-right font-medium">Rank</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => {
                  const mb = benchmarkMetric(bm, m.key, (a) => m.get(a, gb));
                  const all = [mb.subject, ...bm.peers.map((p) => m.get(p, gb))].filter((v): v is number => v !== null);
                  const higherBetter = favorability(m.key, 1) !== "neg";
                  const rank = mb.subject === null ? null : all.filter((v) => (higherBetter ? v > mb.subject! : v < mb.subject!)).length + 1;
                  const notable = m.normalized && mb.deltaVsMedian !== null && (m.format === "pct" || m.format === "pp") && Math.abs(mb.deltaVsMedian) > NOTABLE;
                  return (
                    <tr key={m.key} className={cn("border-b border-line/60", notable && "bg-subtle/60")}>
                      <td className="px-4 py-1.5 text-ink-2">
                        <MetricLabel k={m.key} label={m.label} />
                        {!m.normalized && (
                          <Tip content="Absolute amount — reflects scale, not performance.">
                            <span className="ml-1 cursor-help text-[10px] text-faint">scale</span>
                          </Tip>
                        )}
                      </td>
                      <td className="num px-3 py-1.5 text-right font-medium text-ink">{fmtMetric(mb.subject, m.format, { signed: m.format === "pp" })}</td>
                      <td className="num px-3 py-1.5 text-right text-ink-2">{bm.meaningful ? fmtMetric(mb.stats.median, m.format) : <span className="text-faint">n &lt; 3</span>}</td>
                      <td className="num px-3 py-1.5 text-right text-muted">{bm.meaningful ? fmtMetric(mb.stats.mean, m.format) : "—"}</td>
                      <td className="px-3 py-1.5 text-right">{bm.meaningful && m.normalized ? <Delta value={mb.deltaVsMedian} metricKey={m.key} format={deltaFormat(m) as "pp"} showIcon={notable} /> : <span className="text-faint">—</span>}</td>
                      <td className="num whitespace-nowrap px-4 py-1.5 text-right text-muted">{rank !== null && all.length ? `${rank} of ${all.length}` : "N/A"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface shadow-card xl:col-span-2">
          <CardHeader
            title="Trend vs peer median"
            actions={<Select ariaLabel="Peer trend metric" value={trendKey} onChange={setTrendKey} options={TREND_METRICS.map((k) => ({ value: k, label: CM[k].label }))} />}
          />
          <div className="p-2">
            <MultiLine
              data={trend}
              series={[
                { key: "subject", name: s.company.name, color: SERIES_HEX[0] },
                { key: "median", name: `Peer median (n=${bm.peers.length})`, color: "#8a93a3" },
              ]}
              format={CM[trendKey].format}
            />
          </div>
          <div className="px-4 pb-3">
            <Badge tone="outline">Median recomputed each quarter over the same peers</Badge>
          </div>
        </div>
      </div>
    </>
  );
}
