"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { notFound, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowLeft, Check, CheckCircle2, Columns3, GitMerge, Rocket, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { getData } from "@/lib/data";
import { lastReportedLabel } from "@/lib/data/calendar";
import type { Company } from "@/lib/data/types";
import { analyzeCompany, type CompanyAnalysis } from "@/lib/engine/company";
import { detectCompanyInsights, type Insight } from "@/lib/engine/insights";
import { comparisonLabel } from "@/lib/engine/periods";
import { companyQuarterly } from "@/lib/engine/series";
import { fmtPct, fmtPp, fmtUsd, formatDate, formatDateTime } from "@/lib/format";
import { useScope } from "@/lib/state/hooks";
import { SeriesChart, SERIES_HEX } from "../charts/charts";
import { ConnectionBadge, Delta, FreshnessDot, QualityBadge, StatusPill, WatchButton } from "../fin/fin";
import { InsightDrawer } from "../insights/InsightDrawer";
import { InsightCard } from "../insights/InsightFeed";
import { UploadDialog } from "../uploads/UploadDialog";
import { ExplorePanel, SharePanel, UploadsPanel } from "./DataPanels";
import { STAGE_LABEL } from "@/lib/workspace/migration";
import { useWorkspace } from "@/lib/workspace/store";
import { Badge, Button, CardHeader, MetricLabel } from "../ui/primitives";
import { Statements } from "./Statements";

function Kpi({ k, label, value, delta, deltaFormat = "pct", deltaKey, sub }: { k: string; label?: string; value: string; delta?: number | null; deltaFormat?: "pct" | "pp"; deltaKey?: string; sub?: string }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="text-xs text-muted">
        <MetricLabel k={k} label={label} />
      </div>
      <div className="num mt-0.5 text-lg font-semibold text-ink">{value}</div>
      <div className="flex items-center gap-1 text-xs text-muted">
        {delta !== undefined && <Delta value={delta} metricKey={deltaKey ?? k} format={deltaFormat} />}
        {sub && <span className="truncate">{sub}</span>}
      </div>
    </div>
  );
}

function ChartCard({ title, children, note, testId }: { title: string; children: React.ReactNode; note?: string; testId?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface shadow-card" data-testid={testId}>
      <div className="px-4 pt-3 text-sm font-semibold text-ink">{title}</div>
      {note && <div className="px-4 text-[11px] text-muted">{note}</div>}
      <div className="px-1 pb-2 pt-1">{children}</div>
    </div>
  );
}

function CostComposition({ a, company }: { a: CompanyAnalysis; company: Company }) {
  const m = a.current.metrics;
  const y = a.yoy?.base.metrics;
  // Exact split from monthly memo lines; called before any early return (rules of hooks).
  const rows = useCompositionRows(company.id, a);
  if (a.current.status !== "complete") return <p className="p-6 text-sm text-muted">No complete data for {a.current.period.label}.</p>;
  if (m.directLabor === null || m.operatingPersonnel === null)
    return <p className="p-6 text-sm text-muted">{company.name} does not report a labor split; cost composition by nature is unavailable. Total costs: {fmtUsd((m.cogs ?? 0) + (m.opex ?? 0))}.</p>;
  const total = rows.reduce((s, r) => s + r.cur, 0);
  const totalCheck = (m.cogs ?? 0) + (m.opex ?? 0);
  return (
    <div className="p-4" data-testid="cost-composition">
      <div className="mb-3 flex h-3 overflow-hidden rounded-full" aria-hidden>
        {rows.map((r, i) => (
          <div key={r.label} style={{ width: `${(r.cur / total) * 100}%`, background: COMP_COLORS[i] }} className="border-r-2 border-surface last:border-0" />
        ))}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            <th className="py-1.5 text-left font-medium">Cost component (mutually exclusive)</th>
            <th className="py-1.5 text-right font-medium">{a.current.period.label}</th>
            <th className="py-1.5 text-right font-medium">% of revenue</th>
            <th className="py-1.5 text-right font-medium">Δ vs PY (pp)</th>
            <th className="py-1.5 text-right font-medium">Growth</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.label} className="border-b border-line/60">
              <td className="py-1.5 text-ink-2">
                <span className="mr-2 inline-block h-2 w-2 rounded-sm" style={{ background: COMP_COLORS[i] }} />
                {r.label}
              </td>
              <td className="num py-1.5 text-right">{fmtUsd(r.cur, { decimals: 2 })}</td>
              <td className="num py-1.5 text-right">{fmtPct(r.cur / (m.revenue ?? 1))}</td>
              <td className="py-1.5 text-right">
                <Delta value={r.prev !== null && y?.revenue ? r.cur / (m.revenue ?? 1) - r.prev / y.revenue : null} metricKey="laborIntensity" format="pp" showIcon={false} />
              </td>
              <td className="py-1.5 text-right">
                <Delta value={r.prev ? r.cur / r.prev - 1 : null} metricKey="laborGrowth" showIcon={false} />
              </td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-2">Total operating costs (COGS + opex)</td>
            <td className="num py-2 text-right">{fmtUsd(total, { decimals: 2 })}</td>
            <td className="num py-2 text-right">{fmtPct(total / (m.revenue ?? 1))}</td>
            <td colSpan={2} className="py-2 text-right text-xs font-normal text-muted">
              {Math.abs(total - totalCheck) < 0.001 ? "Reconciles to COGS + opex ✓" : `Check: ${fmtUsd(totalCheck)}`}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-muted">Direct labor sits in COGS; operating personnel is the personnel portion of S&amp;M, R&amp;D and G&amp;A. Functional lines below are shown excluding their personnel so nothing is counted twice.</p>
    </div>
  );
}

const COMP_COLORS = ["#eb6834", "#f3a37f", "#2a78d6", "#86b6ef", "#1baf7a", "#8a93a3", "#c3c9d4"];

function useCompositionRows(companyId: string, a: CompanyAnalysis) {
  return useMemo(() => {
    const data = getData();
    const rows = data.monthlyByCompany.get(companyId) ?? [];
    const sumOver = (start: number, end: number, f: (r: NonNullable<(typeof rows)[number]>) => number) => {
      let s = 0;
      for (let m = start; m <= end; m++) {
        const r = rows[m];
        if (!r) return null;
        s += f(r);
      }
      return s;
    };
    const p = a.current.period;
    const yp = a.yoy?.period;
    const defs: { label: string; f: (r: NonNullable<(typeof rows)[number]>) => number }[] = [
      { label: "Direct labor", f: (r) => r.directLabor ?? 0 },
      { label: "Other cost of revenue", f: (r) => r.otherCogs ?? 0 },
      { label: "Operating personnel (S&M, R&D, G&A staff)", f: (r) => r.operatingPersonnel ?? 0 },
      { label: "Sales & marketing (non-personnel)", f: (r) => r.salesMarketing - (r.smPersonnel ?? 0) },
      { label: "R&D (non-personnel)", f: (r) => (r.researchDevelopment ?? 0) - (r.rdPersonnel ?? 0) },
      { label: "G&A (non-personnel)", f: (r) => r.generalAdmin - (r.gaPersonnel ?? 0) },
      { label: "Other operating expenses", f: (r) => r.otherOpex },
    ];
    return defs
      .map((d) => ({ label: d.label, cur: sumOver(p.start, p.end, d.f) ?? 0, prev: yp ? sumOver(yp.start, yp.end, d.f) : null }))
      .filter((r) => r.cur > 0.0005 || (r.prev ?? 0) > 0.0005);
  }, [companyId, a]);
}

function DataQuality({ company, a }: { company: Company; a: CompanyAnalysis }) {
  const caps: { label: string; dualentry: boolean; upload: boolean; manual: boolean }[] = [
    { label: "Consolidated P&L and cash flow", dualentry: true, upload: true, manual: true },
    { label: "Monthly granularity", dualentry: true, upload: true, manual: true },
    { label: "Labor split (direct vs operating personnel)", dualentry: true, upload: true, manual: company.id !== "bluepeak-solutions" },
    { label: "Working-capital and cash bridge", dualentry: true, upload: false, manual: false },
    { label: "Entity-level P&L and intercompany eliminations", dualentry: true, upload: false, manual: false },
    { label: "Organic vs acquired revenue split", dualentry: true, upload: false, manual: false },
    { label: "Account-level drill-down", dualentry: true, upload: false, manual: false },
    { label: "Daily refresh (no manual submission)", dualentry: true, upload: false, manual: false },
  ];
  const has = (c: (typeof caps)[number]) => (company.connection === "dualentry" ? c.dualentry : company.connection === "upload" ? c.upload : c.manual);
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-2" data-testid="data-quality">
      <dl className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">Source system</dt>
        <dd className="text-ink">{company.accountingSystem}</dd>
        <dt className="text-muted">Connection</dt>
        <dd>
          <ConnectionBadge company={company} />
        </dd>
        <dt className="text-muted">Data source</dt>
        <dd className="text-ink-2">{company.dataSource}</dd>
        <dt className="text-muted">Last refresh</dt>
        <dd className="flex items-center gap-2 text-ink-2">
          {formatDateTime(company.lastUpdated)} <FreshnessDot company={company} />
        </dd>
        <dt className="text-muted">Data through</dt>
        <dd className="text-ink-2">{lastReportedLabel(company.lastReportedMonth)}</dd>
        <dt className="text-muted">Period status</dt>
        <dd>
          <StatusPill status={a.current.status} months={a.current.monthsAvailable} expected={a.current.monthsExpected} awaiting={company.lastReportedMonth < 0} />
        </dd>
        <dt className="text-muted">Budget coverage</dt>
        <dd className="text-ink-2">{a.budget.status === "complete" ? `Complete for ${a.current.period.label}${a.budget.cfo === null ? " (no cash-flow budget)" : ""}` : "No budget for period"}</dd>
        <dt className="text-muted">Confidence</dt>
        <dd>
          <QualityBadge q={company.dataQuality} />
        </dd>
        <dt className="text-muted">Close timeline</dt>
        <dd className="text-ink-2">{company.closeDays ? `${company.closeDays} business days` : "—"}</dd>
        <dt className="text-muted">Missing fields</dt>
        <dd className="text-ink-2">{company.missingFields.length ? company.missingFields.join("; ") : "None"}</dd>
        <dt className="text-muted">Definition notes</dt>
        <dd className="text-ink-2">{company.definitionNotes.length ? company.definitionNotes.map((n) => n.text).join(" ") : "Consistent with portfolio reporting standard"}</dd>
      </dl>
      <div className="rounded-lg border border-line">
        <div className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">Available depth for this company</div>
        <ul className="divide-y divide-line/60">
          {caps.map((c) => (
            <li key={c.label} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              {has(c) ? <Check className="h-3.5 w-3.5 text-pos" /> : <X className="h-3.5 w-3.5 text-faint" />}
              <span className={cn(has(c) ? "text-ink-2" : "text-faint")}>{c.label}</span>
              {!has(c) && c.dualentry && <Badge tone="brand" className="ml-auto">With DualEntry</Badge>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function CompanyPage({ id }: { id: string }) {
  const { period, basis, companies, data } = useScope();
  const company = data.companyById.get(id);
  const [openInsight, setOpenInsight] = useState<Insight | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const params = useSearchParams();
  const migration = useWorkspace((s) => s.migration[id]);
  const a = useMemo(() => (company ? analyzeCompany(company.id, period) : null), [company, period]);
  const series = useMemo(() => (company ? companyQuarterly(company.id, period.end, 11) : []), [company, period.end]);
  const insights = useMemo(() => (company && a ? detectCompanyInsights(a, companies.length ? companies : data.companies, period) : []), [company, a, companies, data.companies, period]);
  if (!company || !a) return notFound();
  const fund = data.funds.find((f) => f.id === company.fund)!;
  const m = a.current.metrics;
  const gb = basis === "prior" ? "prior" : "yoy";
  const c = gb === "prior" ? a.prior : a.yoy;
  const txs = data.transactionsByCompany.get(company.id) ?? [];
  const firstWithLabor = series.find((r) => r.laborExpense !== null && r.revenue !== null);
  const indexed = series.map((r) => ({
    label: r.label,
    fullLabel: r.fullLabel,
    revenueIdx: r.revenue !== null && firstWithLabor?.revenue ? (r.revenue / firstWithLabor.revenue) * 100 : null,
    laborIdx: r.laborExpense !== null && firstWithLabor?.laborExpense ? (r.laborExpense / firstWithLabor.laborExpense) * 100 : null,
  }));

  return (
    <div className="space-y-4" data-testid="company-page">
      <Link href="/" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
        <ArrowLeft className="h-3 w-3" /> Portfolio Overview
      </Link>

      {/* Header */}
      <div className="rounded-lg border border-line bg-surface shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <WatchButton id={company.id} />
              <h1 className="text-[22px] font-semibold tracking-tight text-ink" data-testid="company-name">
                {company.name}
              </h1>
              <ConnectionBadge company={company} />
              <StatusPill status={a.current.status} months={a.current.monthsAvailable} expected={a.current.monthsExpected} awaiting={company.lastReportedMonth < 0} />
              <QualityBadge q={company.dataQuality} />
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted">{company.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/compare?subject=${company.id}`}>
              <Button>
                <Columns3 className="h-3.5 w-3.5" /> Compare with peers
              </Button>
            </Link>
            {company.connection === "upload" && (
              <a href="#explore" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-brand/15 bg-brand-soft px-3 text-sm font-medium text-brand-ink hover:bg-brand-soft/70" data-testid="explore-dualentry">
                <Rocket className="h-3.5 w-3.5" /> Explore DualEntry · {STAGE_LABEL[migration?.stage ?? "not_started"]} <ArrowDown className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-line px-5 py-3 text-sm sm:grid-cols-4 2xl:grid-cols-8">
          {[
            ["Sector", company.sector],
            ["Subsector", company.subsector],
            ["Business model", company.businessModel],
            ["Fund", `${fund.shortName} (${fund.vintage})`],
            ["Investment date", formatDate(company.investmentDate)],
            ["Ownership", `${company.ownership} · ${company.ownershipPct}%`],
            ["Finance system", company.accountingSystem],
            ["Legal entities", String(company.entityCount)],
            ["Reporting status", company.lastReportedMonth < 0 ? "Awaiting first data" : a.current.status === "complete" ? `Complete · ${period.label}` : a.current.status === "partial" ? `Partial · ${period.label}` : `Missing · ${period.label}`],
            ["Last reported period", lastReportedLabel(company.lastReportedMonth)],
          ].map(([k, v]) => (
            <div key={k} className="min-w-0">
              <div className="text-[11px] text-muted">{k}</div>
              <div className="truncate font-medium text-ink-2" title={v}>
                {v}
              </div>
            </div>
          ))}
        </div>
        {txs.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-warn-soft/30 px-5 py-2 text-xs text-ink-2">
            <GitMerge className="h-3.5 w-3.5 text-warn" />
            {txs.map((t) => (
              <span key={t.id}>
                <span className="font-medium text-ink">{t.target}</span> · {t.type} · {t.closed ? `closed ${formatDate(t.closed)}` : `announced ${formatDate(t.announced)}, pending close`} · {t.integrationStatus} · ~${t.annualizedRevenueUsdM.toFixed(1)}M revenue. {t.perimeterImpact}
              </span>
            ))}
          </div>
        )}
        {company.baseCurrency !== "USD" && (
          <div className="border-t border-line px-5 py-2 text-xs text-muted">Functional currency {company.baseCurrency}; figures translated to USD (P&amp;L at monthly average rates, balances at month-end rates). USD growth includes FX movement.</div>
        )}
      </div>

      {params.get("onboarding") === "1" && company.userAdded && (
        <div className="flex items-start gap-2 rounded-lg border border-pos/30 bg-pos-soft/60 px-5 py-3 text-sm text-ink-2" data-testid="onboarding-banner">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-pos" />
          <span>
            <span className="font-semibold text-ink">{company.name} added to the portfolio.</span>{" "}
            {company.connection === "dualentry"
              ? `A data-sharing request was sent to ${company.financeLead.name}. Figures appear once the company approves the scope in DualEntry.`
              : "Next: download the template and upload the first monthly pack below."}
          </span>
        </div>
      )}

      {company.lastReportedMonth < 0 ? (
        <>
          {company.connection === "dualentry" ? <SharePanel company={company} /> : <UploadsPanel company={company} onUpload={() => setUploadOpen(true)} />}
          {company.connection === "upload" && <ExplorePanel company={company} />}
          <div className="rounded-lg border border-line bg-surface px-5 py-8 text-center text-sm text-muted" data-testid="awaiting-data">
            Financial views, insights and benchmarks for {company.name} appear here as soon as the first figures arrive. Until then it is counted in the portfolio as “awaiting data” and left out of totals.
          </div>
        </>
      ) : (
        <>
      {/* KPI strip */}
      {a.current.status !== "complete" ? (
        <div className="rounded-lg border border-warn/30 bg-warn-soft/40 px-5 py-4 text-sm text-ink-2" data-testid="company-incomplete">
          <span className="font-semibold text-ink">{period.label} data is {a.current.status === "missing" ? "missing" : "incomplete"}.</span> {company.name} has reported through {lastReportedLabel(company.lastReportedMonth)}. Period metrics are not computed from partial data — select an earlier period in the filter bar or view trends below.
        </div>
      ) : (
        <div className="grid grid-cols-2 divide-x divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface shadow-card sm:grid-cols-4 2xl:grid-cols-8 2xl:divide-y-0" data-testid="company-kpis">
          <Kpi k="revenue" value={fmtUsd(m.revenue)} delta={c?.revenueGrowth} deltaKey="revenueGrowth" sub={gb === "yoy" ? "YoY" : "QoQ"} />
          <Kpi k="ebitda" value={fmtUsd(m.ebitda)} delta={c?.ebitdaGrowth} deltaKey="ebitdaGrowth" sub={gb === "yoy" ? "YoY" : "QoQ"} />
          <Kpi k="ebitdaMargin" value={fmtPct(m.ebitdaMargin)} delta={c?.ebitdaMarginChange} deltaKey="ebitdaMarginChange" deltaFormat="pp" />
          <Kpi k="grossMargin" value={fmtPct(m.grossMargin)} delta={c?.grossMarginChange} deltaKey="grossMarginChange" deltaFormat="pp" />
          <Kpi k="laborGrowth" label="Labor cost growth" value={fmtPct(c?.laborGrowth ?? null, { signed: true })} sub={c?.laborGap !== null && c?.laborGap !== undefined ? `vs revenue ${fmtPp(c.laborGap)}` : "N/A"} />
          <Kpi k="cfo" value={fmtUsd(m.cfo)} sub={`Conversion ${fmtPct(m.cashConversion, { decimals: 0 })}`} />
          <Kpi k="revenueVsBudget" label="Revenue vs budget" value={fmtPct(a.budget.revenueVarPct, { signed: true })} sub={a.budget.status === "complete" ? `EBITDA ${fmtPct(a.budget.ebitdaVarPct, { signed: true })}` : "No budget"} />
          <Kpi k={company.hasArr ? "arr" : "laborIntensity"} value={company.hasArr ? fmtUsd(m.arr) : fmtPct(m.laborIntensity)} delta={company.hasArr ? c?.arrGrowth : c?.laborIntensityChange} deltaKey={company.hasArr ? "arrGrowth" : "laborIntensity"} deltaFormat={company.hasArr ? "pct" : "pp"} />
        </div>
      )}
      {c && c.acquisitions.length > 0 && a.current.status === "complete" && (
        <div className="flex items-center gap-2 rounded-md border border-warn/30 bg-warn-soft/40 px-4 py-2 text-xs text-ink-2">
          <GitMerge className="h-3.5 w-3.5 text-warn" /> Growth {comparisonLabel(gb, period)} is acquisition-affected.{" "}
          {c.organicAvailable && c.organicRevenueGrowth !== null ? (
            <span>
              Organic revenue growth (constant perimeter, from DualEntry entity ledgers): <span className="font-semibold text-ink">{fmtPct(c.organicRevenueGrowth, { signed: true })}</span> vs reported {fmtPct(c.revenueGrowth, { signed: true })}.
            </span>
          ) : (
            <span>Organic growth cannot be determined from the submitted consolidated data and is not shown.</span>
          )}
        </div>
      )}

      {/* Financial overview charts */}
      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3" data-testid="company-charts">
        <ChartCard title="Revenue vs budget — quarterly" note="Bars: actual revenue · line: budget (where approved)">
          <SeriesChart data={series as unknown as Record<string, unknown>[]} series={[{ key: "revenue", name: "Revenue" }, { key: "budgetRevenue", name: "Budget", color: "#8a93a3" }]} format="usd" kind="line" height={210} />
        </ChartCard>
        <ChartCard title="Labor cost vs revenue — indexed" note={firstWithLabor ? `Both series indexed to ${firstWithLabor.fullLabel} = 100 (same axis, same base)` : "Labor split not reported"} testId="chart-labor">
          <SeriesChart data={indexed} series={[{ key: "laborIdx", name: "Labor expense", color: SERIES_HEX[1] }, { key: "revenueIdx", name: "Revenue", color: SERIES_HEX[0] }]} format="ratio" indexed height={210} />
        </ChartCard>
        <ChartCard title="EBITDA and gross margin" testId="chart-margins">
          <SeriesChart data={series as unknown as Record<string, unknown>[]} series={[{ key: "ebitdaMargin", name: "EBITDA margin" }, { key: "grossMargin", name: "Gross margin", color: SERIES_HEX[2] }]} format="pct" height={210} />
        </ChartCard>
        <ChartCard title="EBITDA vs operating cash flow">
          <SeriesChart data={series as unknown as Record<string, unknown>[]} series={[{ key: "ebitda", name: "EBITDA" }, { key: "cfo", name: "Operating cash flow", color: SERIES_HEX[2] }]} format="usd" kind="bar" height={210} />
        </ChartCard>
        <ChartCard title="Labor intensity" note="Labor expense ÷ revenue">
          <SeriesChart data={series as unknown as Record<string, unknown>[]} series={[{ key: "laborIntensity", name: "Labor intensity", color: SERIES_HEX[1] }]} format="pct" height={210} />
        </ChartCard>
        <ChartCard title="Budget variance" note="Revenue and EBITDA vs budget (%)">
          <SeriesChart data={series as unknown as Record<string, unknown>[]} series={[{ key: "revenueVsBudget", name: "Revenue vs budget" }, { key: "ebitdaVsBudget", name: "EBITDA vs budget", color: SERIES_HEX[1] }]} format="pct" kind="bar" height={210} />
        </ChartCard>
      </div>

      <Statements company={company} period={period} current={a} />

      {company.connection === "upload" ? (
        <>
          <UploadsPanel company={company} onUpload={() => setUploadOpen(true)} />
          <ExplorePanel company={company} />
        </>
      ) : (
        <SharePanel company={company} />
      )}

      <div className="rounded-lg border border-line bg-surface shadow-card" data-testid="company-insights">
        <CardHeader title="Company insights" description={`${insights.length} findings for ${period.label} from the insight engine · click to inspect supporting calculations`} />
        <div className="grid gap-3 p-3 lg:grid-cols-2 2xl:grid-cols-3">
          {insights.length === 0 && <p className="p-4 text-sm text-muted">No findings crossed the configured thresholds.</p>}
          {insights.map((i) => (
            <InsightCard key={i.id} i={i} onOpen={setOpenInsight} />
          ))}
        </div>
      </div>

      <div className="grid gap-3 2xl:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface shadow-card">
          <CardHeader title="Cost composition" description={`${period.label} · by nature, no double counting`} />
          <CostComposition a={a} company={company} />
        </div>
        <div className="rounded-lg border border-line bg-surface shadow-card">
          <CardHeader title="Data quality & source" description="What is known about this company's reporting, and what depth is available" />
          <DataQuality company={company} a={a} />
        </div>
      </div>
        </>
      )}
      <InsightDrawer insight={openInsight} onClose={() => setOpenInsight(null)} />
      {company.connection === "upload" && <UploadDialog company={company} open={uploadOpen} onOpenChange={setUploadOpen} />}
    </div>
  );
}
