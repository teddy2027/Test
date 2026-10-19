"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, Download, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Company } from "@/lib/data/types";
import { median } from "@/lib/engine/core";
import { analyzeCompany, type CompanyAnalysis } from "@/lib/engine/company";
import { COMPARE_METRICS, CM, type CompareMetric } from "@/lib/engine/compareMetrics";
import { favorability } from "@/lib/engine/metrics";
import { comparisonLabel, trendQuarters } from "@/lib/engine/periods";
import { buildCsv, downloadText, slug } from "@/lib/export";
import { fmtMetric, fmtPct } from "@/lib/format";
import { useScope } from "@/lib/state/hooks";
import { MultiLine, RankBars, SERIES_HEX } from "../charts/charts";
import { ConnectionBadge } from "../fin/fin";
import { PageHeader } from "../overview/OverviewPage";
import { Button, CardHeader, MetricLabel, Popover, PopoverContent, PopoverTrigger, Select } from "../ui/primitives";

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
        <Button size="sm" disabled={selected.length >= 5 || avail.length === 0} data-testid="compare-add">
          <Plus className="h-3.5 w-3.5" /> Add to comparison
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
  const { period, basis, data } = useScope();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const gb = basis === "prior" ? "prior" : "yoy";
  const subjectParam = params.get("subject");
  const idsParam = params.get("ids");
  // Companies still awaiting their first figures can't be compared yet.
  const comparable = useMemo(() => data.companies.filter((c) => c.lastReportedMonth >= 0), [data.companies]);
  const canCompare = (id: string | null): id is string => !!id && (data.companyById.get(id)?.lastReportedMonth ?? -1) >= 0;
  const [ids, setIds] = useState<string[]>(() => (idsParam ? idsParam.split(",").filter(canCompare) : ["meridian-services", "harbor-operations", "summit-compliance"]));
  const [slots, setSlots] = useState<Record<string, number>>(() => Object.fromEntries(ids.map((id, i) => [id, i])));
  const [groups, setGroups] = useState<CompareMetric["group"][]>(["Growth", "Profitability", "Cost efficiency", "Cash flow", "Budget"]);
  const [trendKey, setTrendKey] = useState("ebitdaMargin");
  const [barKey, setBarKey] = useState("laborIntensity");

  useEffect(() => {
    // Old "company vs peers" links now live on the company page.
    if (subjectParam && data.companyById.has(subjectParam)) {
      router.replace(`/companies/${subjectParam}#peers`);
      return;
    }
    if (idsParam) {
      const next = idsParam.split(",").filter(canCompare);
      if (next.length) {
        setIds(next);
        setSlots(Object.fromEntries(next.map((id, i) => [id, i])));
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
    syncUrl({ ids: next.join(",") });
  };
  const removeId = (id: string) => {
    const next = ids.filter((x) => x !== id);
    setIds(next);
    syncUrl({ ids: next.join(",") || null });
  };

  const analyses = useMemo(() => ids.map((id) => analyzeCompany(id, period)), [ids, period]);
  const metrics = COMPARE_METRICS.filter((m) => groups.includes(m.group));
  const colorOf = (id: string) => SERIES_HEX[(slots[id] ?? 0) % SERIES_HEX.length];

  const exportCsv = () => {
    const csv = buildCsv(
      metrics,
      [{ header: "Metric", format: "text", get: (m) => m.label }, ...analyses.map((a) => ({ header: a.company.name, format: "text" as const, get: (m: CompareMetric) => fmtMetric(m.get(a, gb), m.format) })), { header: "Group median", format: "text", get: (m) => fmtMetric(median(analyses.map((a) => m.get(a, gb))), m.format) }],
      { title: "DualEntry Portfolio Intelligence - Company comparison", period: period.label, comparison: comparisonLabel(gb, period), scope: analyses.map((a) => a.company.name).join(" vs ") },
    );
    downloadText(`company-comparison-${slug(period.label)}.csv`, csv);
  };

  return (
    <div className="space-y-4">
      <Link href="/" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
        <ArrowLeft className="h-3 w-3" /> Portfolio
      </Link>
      <PageHeader title="Compare companies" subtitle={`${period.label} · growth ${comparisonLabel(gb, period)} · normalized metrics first — scale is not performance`}>
        <Button size="sm" onClick={exportCsv} data-testid="compare-export">
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 shadow-card" data-testid="compare-controls">
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

      <CompaniesMode analyses={analyses} metrics={metrics} gb={gb} colorOf={colorOf} trendKey={trendKey} setTrendKey={setTrendKey} barKey={barKey} setBarKey={setBarKey} periodEnd={period.end} />
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
