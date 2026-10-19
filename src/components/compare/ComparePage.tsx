"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Download, Plus, Users, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Company } from "@/lib/data/types";
import { median, type N } from "@/lib/engine/core";
import { analyzeCompany, type CompanyAnalysis } from "@/lib/engine/company";
import { benchmarkMetric, buildBenchmark, DIMENSION_LABELS, type CohortDimension } from "@/lib/engine/benchmark";
import { COMPARE_METRICS, CM, type CompareMetric } from "@/lib/engine/compareMetrics";
import { favorability } from "@/lib/engine/metrics";
import { comparisonLabel, trendQuarters } from "@/lib/engine/periods";
import { buildCsv, downloadText, slug } from "@/lib/export";
import { fmtMetric, fmtPct } from "@/lib/format";
import { useScope } from "@/lib/state/hooks";
import { MultiLine, RankBars, SERIES_HEX } from "../charts/charts";
import { ConnectionBadge, Delta } from "../fin/fin";
import { PageHeader } from "../overview/OverviewPage";
import { Badge, Button, CardHeader, MetricLabel, Popover, PopoverContent, PopoverTrigger, Segmented, Select, Tip } from "../ui/primitives";

type Mode = "companies" | "cohort";
const GROUPS: CompareMetric["group"][] = ["Growth", "Profitability", "Cost efficiency", "Cash flow", "Budget", "SaaS", "Scale"];
const TREND_METRICS = ["revenueGrowth", "ebitdaMargin", "grossMargin", "laborIntensity", "gaRatio", "cashConversion", "revenue"];
const KPI_KEYS = ["revenue", "revenueGrowth", "ebitdaMargin", "grossMargin", "laborGrowth", "laborIntensity", "cashConversion"];
/** A deviation from the group median larger than this is highlighted (pct/pp metrics). */
const NOTABLE = 0.05;

function deltaFormat(m: CompareMetric) {
  return m.format === "pct" || m.format === "pp" ? "pp" : m.format;
}

function metricSeries(ids: string[], key: string, end: number, basis: "prior" | "yoy") {
  const m = CM[key];
  return trendQuarters(end, 9).map((q) => {
    const row: Record<string, unknown> = { label: q.label.replace(" 20", " ’"), fullLabel: q.label };
    for (const id of ids) {
      const a = analyzeCompany(id, q);
      row[id] = a.current.status === "complete" ? m.get(a, basis) : null;
    }
    return row;
  });
}

function CompanyPicker({ all, selected, onAdd }: { all: Company[]; selected: string[]; onAdd: (id: string) => void }) {
  const avail = all.filter((c) => !selected.includes(c.id));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" disabled={selected.length >= 5 || avail.length === 0} data-testid="add-company">
          <Plus className="h-3.5 w-3.5" /> Add company
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-h-80 w-64 overflow-y-auto">
        {avail.map((c) => (
          <button key={c.id} onClick={() => onAdd(c.id)} className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-subtle">
            <span className="text-ink">{c.name}</span>
            <span className="text-xs text-faint">{c.subsector}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function ComparePage() {
  const { companies, period, basis, data, filters } = useScope();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const gb = basis === "prior" ? "prior" : "yoy";
  const subjectParam = params.get("subject");
  const idsParam = params.get("ids");
  // Companies still awaiting their first figures can't be compared yet.
  const comparable = useMemo(() => data.companies.filter((c) => c.lastReportedMonth >= 0), [data.companies]);
  const canCompare = (id: string | null): id is string => !!id && (data.companyById.get(id)?.lastReportedMonth ?? -1) >= 0;
  const [mode, setMode] = useState<Mode>(subjectParam ? "cohort" : "companies");
  const [ids, setIds] = useState<string[]>(() => (idsParam ? idsParam.split(",").filter(canCompare) : ["meridian-services", "harbor-operations", "summit-compliance"]));
  const [slots, setSlots] = useState<Record<string, number>>(() => Object.fromEntries(ids.map((id, i) => [id, i])));
  const [subject, setSubject] = useState<string>(canCompare(subjectParam) ? subjectParam : "meridian-services");
  const [dim, setDim] = useState<CohortDimension>("sector");
  const [groups, setGroups] = useState<CompareMetric["group"][]>(["Growth", "Profitability", "Cost efficiency", "Cash flow", "Budget"]);
  const [trendKey, setTrendKey] = useState("ebitdaMargin");
  const [barKey, setBarKey] = useState("laborIntensity");

  useEffect(() => {
    if (canCompare(subjectParam)) {
      setSubject(subjectParam);
      setMode("cohort");
    }
    if (idsParam) {
      const next = idsParam.split(",").filter(canCompare);
      if (next.length) {
        setIds(next);
        setSlots(Object.fromEntries(next.map((id, i) => [id, i])));
        setMode("companies");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- canCompare only reads data.companyById
  }, [subjectParam, idsParam, data.companyById]);

  const syncUrl = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const addId = (id: string) => {
    const used = new Set(Object.values(slots));
    let slot = 0;
    while (used.has(slot)) slot++;
    setSlots({ ...slots, [id]: slot });
    const next = [...ids, id];
    setIds(next);
    syncUrl({ ids: next.join(","), subject: null });
  };
  const removeId = (id: string) => {
    const next = ids.filter((x) => x !== id);
    setIds(next);
    syncUrl({ ids: next.join(",") || null });
  };

  const universe = (companies.length ? companies : data.companies).filter((c) => c.lastReportedMonth >= 0);
  const analyses = useMemo(() => ids.map((id) => analyzeCompany(id, period)), [ids, period]);
  const metrics = COMPARE_METRICS.filter((m) => groups.includes(m.group));
  const colorOf = (id: string) => SERIES_HEX[(slots[id] ?? 0) % SERIES_HEX.length];

  const bm = useMemo(() => buildBenchmark(subject, dim, universe.some((c) => c.id === subject) ? universe : [...universe, data.companyById.get(subject)!], period), [subject, dim, universe, period, data.companyById]);

  const exportCsv = () => {
    if (mode === "companies") {
      const csv = buildCsv(
        metrics,
        [{ header: "Metric", format: "text", get: (m) => m.label }, ...analyses.map((a) => ({ header: a.company.name, format: "text" as const, get: (m: CompareMetric) => fmtMetric(m.get(a, gb), m.format) })), { header: "Group median", format: "text", get: (m) => fmtMetric(median(analyses.map((a) => m.get(a, gb))), m.format) }],
        { title: "DualEntry Portfolio Intelligence - Company comparison", period: period.label, comparison: comparisonLabel(gb, period), scope: analyses.map((a) => a.company.name).join(" vs ") },
      );
      downloadText(`company-comparison-${slug(period.label)}.csv`, csv);
    } else {
      const csv = buildCsv(
        metrics,
        [
          { header: "Metric", format: "text", get: (m) => m.label },
          { header: bm.subject.company.name, format: "text", get: (m) => fmtMetric(m.get(bm.subject, gb), m.format) },
          { header: "Peer median", format: "text", get: (m) => fmtMetric(benchmarkMetric(bm, m.key, (a) => m.get(a, gb)).stats.median, m.format) },
          { header: "Peer average", format: "text", get: (m) => fmtMetric(benchmarkMetric(bm, m.key, (a) => m.get(a, gb)).stats.mean, m.format) },
          { header: "n", format: "text", get: (m) => String(benchmarkMetric(bm, m.key, (a) => m.get(a, gb)).stats.n) },
        ],
        { title: `DualEntry Portfolio Intelligence - ${bm.subject.company.name} vs ${bm.cohortLabel} peers`, period: period.label, comparison: comparisonLabel(gb, period), scope: `Peers: ${bm.peers.map((p) => p.company.name).join(", ")}. Rule: ${bm.rule}` },
      );
      downloadText(`peer-comparison-${slug(bm.subject.company.name)}-${slug(period.label)}.csv`, csv);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Company Comparison" subtitle={`${period.label} · growth ${comparisonLabel(gb, period)} · normalized metrics first — scale is not performance`}>
        <Segmented<Mode>
          ariaLabel="Comparison mode"
          value={mode}
          onChange={(m) => {
            setMode(m);
            syncUrl(m === "cohort" ? { subject, ids: null } : { ids: ids.join(","), subject: null });
          }}
          options={[
            { value: "companies", label: "Companies side by side" },
            { value: "cohort", label: "Company vs peer cohort" },
          ]}
        />
        <Button size="sm" onClick={exportCsv} data-testid="compare-export">
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 shadow-card" data-testid="compare-controls">
        {mode === "companies" ? (
          <>
            {analyses.map((a) => (
              <span key={a.company.id} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-subtle py-1 pl-2 pr-1 text-sm" data-testid="compare-chip">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(a.company.id) }} />
                <span className="font-medium text-ink">{a.company.name}</span>
                <button onClick={() => removeId(a.company.id)} disabled={ids.length <= 2} className="rounded p-0.5 text-muted hover:bg-line disabled:opacity-30" aria-label={`Remove ${a.company.name}`}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <CompanyPicker all={comparable} selected={ids} onAdd={addId} />
            <span className="text-xs text-muted">2–5 companies</span>
          </>
        ) : (
          <>
            <Select ariaLabel="Subject company" prefix="Company" value={subject} onChange={(v) => { setSubject(v); syncUrl({ subject: v, ids: null }); }} options={comparable.map((c) => ({ value: c.id, label: c.name }))} />
            <Select
              ariaLabel="Peer cohort"
              prefix="Peers by"
              value={dim}
              onChange={(v) => setDim(v as CohortDimension)}
              options={(["sector", "businessModel", "revenueBand", "fund", "vintage", "portfolio"] as CohortDimension[]).map((d) => ({ value: d, label: DIMENSION_LABELS[d] }))}
            />
            <span className="text-xs text-muted">Peer universe respects global filters ({universe.length} companies)</span>
          </>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {GROUPS.map((g) => (
            <button
              key={g}
              onClick={() => setGroups(groups.includes(g) ? groups.filter((x) => x !== g) : [...groups, g])}
              className={cn("rounded-md border px-2 py-0.5 text-xs", groups.includes(g) ? "border-brand/40 bg-brand-soft text-brand-ink" : "border-line text-muted hover:bg-subtle")}
              aria-pressed={groups.includes(g)}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {mode === "companies" ? (
        <CompaniesMode analyses={analyses} metrics={metrics} gb={gb} colorOf={colorOf} trendKey={trendKey} setTrendKey={setTrendKey} barKey={barKey} setBarKey={setBarKey} periodEnd={period.end} />
      ) : (
        <CohortMode bm={bm} metrics={metrics} gb={gb} trendKey={trendKey} setTrendKey={setTrendKey} barKey={barKey} setBarKey={setBarKey} periodEnd={period.end} />
      )}
      <p className="text-xs text-muted">Scope: {filters.funds.length || filters.sectors.length ? "global filters apply to peer universes; explicitly selected companies are always shown." : "all portfolio companies."}</p>
    </div>
  );
}

function CompaniesMode({
  analyses,
  metrics,
  gb,
  colorOf,
  trendKey,
  setTrendKey,
  barKey,
  setBarKey,
  periodEnd,
}: {
  analyses: CompanyAnalysis[];
  metrics: CompareMetric[];
  gb: "prior" | "yoy";
  colorOf: (id: string) => string;
  trendKey: string;
  setTrendKey: (k: string) => void;
  barKey: string;
  setBarKey: (k: string) => void;
  periodEnd: number;
}) {
  const ids = analyses.map((a) => a.company.id);
  const trend = useMemo(() => metricSeries(ids, trendKey, periodEnd, gb), [ids, trendKey, periodEnd, gb]);
  const sectors = new Set(analyses.map((a) => a.company.sector));
  return (
    <>
      {sectors.size > 1 && (
        <div className="flex items-center gap-2 rounded-md border border-warn/30 bg-warn-soft/50 px-3 py-2 text-xs text-warn">
          <AlertTriangle className="h-3.5 w-3.5" /> Selected companies span software and services — gross margin and labor intensity are structurally different across these business models.
        </div>
      )}
      <div className={cn("grid gap-3", analyses.length <= 3 ? "md:grid-cols-3" : analyses.length === 4 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3 xl:grid-cols-5")} data-testid="compare-kpi-cards">
        {analyses.map((a) => (
          <div key={a.company.id} className="rounded-lg border border-line bg-surface shadow-card" style={{ borderTop: `3px solid ${colorOf(a.company.id)}` }}>
            <div className="flex items-start justify-between gap-2 px-4 pt-3">
              <div className="min-w-0">
                <Link href={`/companies/${a.company.id}`} className="font-semibold text-ink hover:text-brand">
                  {a.company.name}
                </Link>
                <div className="truncate text-xs text-muted">{a.company.subsector}</div>
              </div>
              <ConnectionBadge company={a.company} compact />
            </div>
            {a.current.status !== "complete" ? (
              <p className="px-4 py-6 text-sm text-muted">No complete data for this period.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 px-4 py-3">
                {KPI_KEYS.map((k) => {
                  const m = CM[k];
                  return (
                    <div key={k} className="min-w-0">
                      <dt className="truncate text-[11px] text-muted">{m.label}</dt>
                      <dd className="num text-sm font-semibold text-ink">{fmtMetric(m.get(a, gb), m.format, { signed: m.key.includes("Growth") })}</dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface shadow-card">
          <CardHeader
            title="Performance trend"
            description="Quarterly, same metric for every company"
            actions={<Select ariaLabel="Trend metric" value={trendKey} onChange={setTrendKey} options={TREND_METRICS.map((k) => ({ value: k, label: CM[k].label }))} />}
          />
          <div className="p-2">
            <MultiLine data={trend} series={analyses.map((a) => ({ key: a.company.id, name: a.company.name, color: colorOf(a.company.id) }))} format={CM[trendKey].format} />
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface shadow-card">
          <CardHeader
            title="Comparison bars"
            description="Selected metric for each company"
            actions={<Select ariaLabel="Bar metric" value={barKey} onChange={setBarKey} options={metrics.filter((m) => m.normalized).map((m) => ({ value: m.key, label: m.label }))} />}
          />
          <div className="p-2">
            <RankBars data={analyses.map((a) => ({ label: a.company.name, value: CM[barKey].get(a, gb), id: a.company.id }))} format={CM[barKey].format} reference={median(analyses.map((a) => CM[barKey].get(a, gb)))} referenceLabel="Median" height={Math.max(200, analyses.length * 40 + 50)} />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface shadow-card" data-testid="compare-diff-table">
        <CardHeader title="Company-to-company differences" description={`Highlighted cells deviate from the group median by more than ${fmtPct(NOTABLE, { decimals: 0 })} points (green favorable, red unfavorable). Spread = max − min.`} />
        <div className="thin-scroll overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line bg-subtle text-xs text-muted">
                <th className="px-4 py-2 text-left font-medium">Metric</th>
                {analyses.map((a) => (
                  <th key={a.company.id} className="px-3 py-2 text-right font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: colorOf(a.company.id) }} />
                      {a.company.name}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Median</th>
                <th className="px-4 py-2 text-right font-medium">Spread</th>
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((g) => {
                const ms = metrics.filter((m) => m.group === g);
                if (!ms.length) return null;
                return [
                  <tr key={g} className="bg-subtle/50">
                    <td colSpan={analyses.length + 3} className="px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                      {g}
                    </td>
                  </tr>,
                  ...ms.map((m) => {
                    const vals = analyses.map((a) => m.get(a, gb));
                    const med = median(vals);
                    const present = vals.filter((v): v is number => v !== null);
                    const spread = present.length >= 2 ? Math.max(...present) - Math.min(...present) : null;
                    return (
                      <tr key={m.key} className="border-b border-line/60">
                        <td className="px-4 py-1.5 text-ink-2">
                          <MetricLabel k={m.key} label={m.label} />
                        </td>
                        {vals.map((v, i) => {
                          const d = v !== null && med !== null ? v - med : null;
                          const notable = m.normalized && d !== null && (m.format === "pct" || m.format === "pp") && Math.abs(d) > NOTABLE;
                          const fav = notable ? favorability(m.key, d) : "neutral";
                          return (
                            <td key={i} className={cn("num px-3 py-1.5 text-right", notable && fav === "pos" && "bg-pos-soft text-pos", notable && fav === "neg" && "bg-neg-soft text-neg", v === null && "text-faint")}>
                              {fmtMetric(v, m.format, { signed: m.format === "pp" || m.key.includes("Growth") || m.key.includes("Budget") })}
                            </td>
                          );
                        })}
                        <td className="num px-3 py-1.5 text-right text-muted">{fmtMetric(med, m.format)}</td>
                        <td className="num px-4 py-1.5 text-right text-muted">{fmtMetric(spread, deltaFormat(m), { signed: false })}</td>
                      </tr>
                    );
                  }),
                ];
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
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
  const secondKey = trendKey === "laborIntensity" ? "ebitdaMargin" : "laborIntensity";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const trend = useMemo(() => series(trendKey), [s.company.id, peerIds.join(), trendKey, periodEnd, gb]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const trend2 = useMemo(() => series(secondKey), [s.company.id, peerIds.join(), secondKey, periodEnd, gb]);
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
          <div className="border-t border-line px-4 pt-3 text-sm font-semibold text-ink">{CM[secondKey].label} vs peer median</div>
          <div className="p-2">
            <MultiLine
              data={trend2}
              series={[
                { key: "subject", name: s.company.name, color: SERIES_HEX[0] },
                { key: "median", name: `Peer median (n=${bm.peers.length})`, color: "#8a93a3" },
              ]}
              format={CM[secondKey].format}
              height={240}
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
