"use client";
import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Company } from "@/lib/data/types";
import { getData } from "@/lib/data";
import { growth, type N } from "@/lib/engine/core";
import type { CompanyAnalysis, Metrics } from "@/lib/engine/company";
import type { MetricFormat } from "@/lib/engine/metrics";
import type { Period } from "@/lib/engine/periods";
import { companyStatementPeriods, type Granularity } from "@/lib/engine/series";
import { buildCsv, downloadText, slug } from "@/lib/export";
import { csvValue, fmtMetric, fmtPct, fmtPp, fmtUsd } from "@/lib/format";
import { Waterfall } from "../charts/charts";
import { Badge, Button, Segmented, Tabs, TabsContent, TabsList, TabsTrigger, Tip } from "../ui/primitives";
import { Delta } from "../fin/fin";
import { Download } from "lucide-react";

type Line = {
  id: string;
  label: string;
  get: (m: Metrics, a: CompanyAnalysis) => N;
  format?: MetricFormat;
  bold?: boolean;
  indent?: number;
  children?: Line[];
  ratio?: boolean;
  costLine?: boolean;
  note?: string;
};

const INCOME: Line[] = [
  {
    id: "rev",
    label: "Revenue",
    get: (m) => m.revenue,
    bold: true,
    children: [
      { id: "sub", label: "Subscription revenue", get: (m) => m.subscriptionRevenue },
      { id: "svc", label: "Services revenue", get: (m) => m.servicesRevenue },
    ],
  },
  {
    id: "cogs",
    label: "Cost of revenue (COGS)",
    get: (m) => (m.cogs === null ? null : -m.cogs),
    costLine: true,
    children: [
      { id: "dl", label: "Direct labor", get: (m) => (m.directLabor === null ? null : -m.directLabor), costLine: true },
      { id: "oc", label: "Other cost of revenue", get: (m) => (m.otherCogs === null ? null : -m.otherCogs), costLine: true },
    ],
  },
  { id: "gp", label: "Gross profit", get: (m) => m.grossProfit, bold: true },
  { id: "gm", label: "Gross margin", get: (m) => m.grossMargin, format: "pct", ratio: true },
  {
    id: "opex",
    label: "Operating expenses",
    get: (m) => (m.opex === null ? null : -m.opex),
    costLine: true,
    children: [
      { id: "sm", label: "Sales & marketing", get: (m) => -(m.salesMarketing ?? 0), costLine: true },
      { id: "rd", label: "Research & development", get: (m) => (m.researchDevelopment === null ? null : -m.researchDevelopment), costLine: true },
      { id: "ga", label: "General & administrative", get: (m) => -(m.generalAdmin ?? 0), costLine: true },
      { id: "oo", label: "Other operating expenses", get: (m) => -(m.otherOpex ?? 0), costLine: true },
    ],
  },
  { id: "ebitda", label: "EBITDA", get: (m) => m.ebitda, bold: true },
  { id: "em", label: "EBITDA margin", get: (m) => m.ebitdaMargin, format: "pct", ratio: true },
  {
    id: "memo",
    label: "Memo: total labor",
    get: (m) => m.laborExpense,
    note: "Direct labor (in COGS) + operating personnel (within S&M, R&D, G&A). Memo only — already included above.",
    children: [
      { id: "dl2", label: "Direct labor (COGS)", get: (m) => m.directLabor },
      { id: "op", label: "Operating personnel (opex)", get: (m) => m.operatingPersonnel },
      { id: "li", label: "Labor intensity", get: (m) => m.laborIntensity, format: "pct", ratio: true },
      { id: "hc", label: "Headcount (period end)", get: (m) => m.employees, format: "count" },
    ],
  },
];

const CASH: Line[] = [
  { id: "ebitda", label: "EBITDA", get: (m) => m.ebitda, bold: true },
  { id: "int", label: "Cash interest", get: (m) => (m.cashInterest === null ? null : -m.cashInterest), costLine: true },
  { id: "tax", label: "Cash taxes", get: (m) => (m.cashTaxes === null ? null : -m.cashTaxes), costLine: true },
  { id: "nwc", label: "(Increase) / decrease in net working capital", get: (m) => (m.changeInNwc === null ? null : -m.changeInNwc) },
  { id: "cfo", label: "Cash from operations", get: (m) => m.cfo, bold: true },
  { id: "cc", label: "Cash conversion (CFO ÷ EBITDA)", get: (m) => m.cashConversion, format: "pct", ratio: true },
  { id: "capex", label: "Capital expenditure", get: (m) => (m.capex === null ? null : -m.capex), costLine: true },
  { id: "fcf", label: "Free cash flow", get: (m) => m.fcf, bold: true },
  { id: "cash", label: "Cash balance (period end)", get: (m) => m.cashEnd },
];

function useCollapsed() {
  const [closed, setClosed] = useState<Record<string, boolean>>({ memo: true });
  return { closed, toggle: (id: string) => setClosed((s) => ({ ...s, [id]: !s[id] })) };
}

function StatementTable({ lines, cols, testId }: { lines: Line[]; cols: { label: string; a: CompanyAnalysis; partial: boolean }[]; testId: string }) {
  const { closed, toggle } = useCollapsed();
  const last = cols[cols.length - 1];
  const yoyBase = last?.a.yoy?.base;
  const render = (l: Line, depth: number): React.ReactNode => {
    const hasKids = !!l.children?.length;
    const fmt = l.format ?? "usd";
    const vals = cols.map((c) => (c.a.current.status === "complete" ? l.get(c.a.current.metrics, c.a) : null));
    if (depth > 0 && vals.every((v) => v === null) && (l.id === "sub" || l.id === "rd")) return null;
    const lastV = vals[vals.length - 1];
    const prevV = yoyBase && yoyBase.status === "complete" ? l.get(yoyBase.metrics, last.a) : null;
    const change = l.ratio ? (lastV !== null && prevV !== null ? lastV - prevV : null) : l.format === "count" ? growth(lastV, prevV) : lastV !== null && prevV !== null && prevV !== 0 ? (lastV - prevV) / Math.abs(prevV) : null;
    return (
      <Fragment key={l.id}>
        <tr className={cn("border-b border-line/60", l.bold && "bg-subtle/60", l.ratio && "text-muted")}>
          <td className={cn("sticky left-0 z-[1] whitespace-nowrap bg-surface py-1.5 pr-3", l.bold && "bg-subtle font-semibold text-ink")} style={{ paddingLeft: 12 + depth * 18 }}>
            <span className="inline-flex items-center gap-1">
              {hasKids ? (
                <button onClick={() => toggle(l.id)} className="rounded p-0.5 text-muted hover:bg-line/60" aria-label={closed[l.id] ? `Expand ${l.label}` : `Collapse ${l.label}`} aria-expanded={!closed[l.id]}>
                  {closed[l.id] ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
              ) : (
                <span className="w-4" />
              )}
              {l.note ? (
                <Tip content={l.note}>
                  <span className="cursor-help border-b border-dotted border-line-strong">{l.label}</span>
                </Tip>
              ) : (
                l.label
              )}
            </span>
          </td>
          {vals.map((v, i) => (
            <td key={i} className={cn("num whitespace-nowrap px-3 py-1.5 text-right", l.bold && "font-semibold text-ink", v === null && "text-faint", cols[i].partial && "bg-warn-soft/30")}>
              {fmt === "usd" ? fmtUsd(v, { decimals: 2 }) : fmtMetric(v, fmt)}
            </td>
          ))}
          <td className="whitespace-nowrap px-3 py-1.5 text-right text-xs">
            {l.ratio ? (
              <span className={cn("num", change === null ? "text-faint" : "text-ink-2")}>{fmtPp(change)}</span>
            ) : (
              <Delta value={change} metricKey={l.costLine ? "revenueGrowth" : l.id === "hc" ? "employees" : "revenueGrowth"} showIcon={false} />
            )}
          </td>
        </tr>
        {hasKids && !closed[l.id] && l.children!.map((k) => render(k, depth + 1))}
      </Fragment>
    );
  };
  return (
    <div className="thin-scroll overflow-x-auto" data-testid={testId}>
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-subtle text-xs text-muted">
            <th className="sticky left-0 z-[1] bg-subtle px-3 py-2 text-left font-medium">USD millions</th>
            {cols.map((c) => (
              <th key={c.label} className="whitespace-nowrap px-3 py-2 text-right font-medium">
                {c.label}
                {c.partial && (
                  <Badge tone="warn" className="ml-1">
                    {c.a.current.status === "missing" ? "No data" : `Partial ${c.a.current.monthsAvailable}/${c.a.current.monthsExpected}`}
                  </Badge>
                )}
              </th>
            ))}
            <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
              <Tip content="Latest column vs the same period one year earlier. Cost lines are shown as negatives, so a more negative value is a cost increase.">
                <span className="cursor-help">YoY Δ</span>
              </Tip>
            </th>
          </tr>
        </thead>
        <tbody>{lines.map((l) => render(l, 0))}</tbody>
      </table>
    </div>
  );
}

function BudgetVsActual({ a, company }: { a: CompanyAnalysis; company: Company }) {
  const b = a.budget;
  const m = a.current.metrics;
  if (b.status !== "complete")
    return (
      <div className="p-8 text-center text-sm text-muted" data-testid="bva">
        No complete budget for {a.current.period.label}. {company.missingFields.find((f) => f.toLowerCase().includes("budget")) ? `Missing: ${company.missingFields.find((f) => f.toLowerCase().includes("budget"))}.` : ""}
      </div>
    );
  if (a.current.status !== "complete") return <div className="p-8 text-center text-sm text-muted">Actuals are incomplete for {a.current.period.label}; variances are not computed from partial data.</div>;
  const rows: { label: string; act: N; bud: N; cost?: boolean; bold?: boolean; fmt?: MetricFormat }[] = [
    { label: "Revenue", act: m.revenue, bud: b.revenue, bold: true },
    { label: "COGS", act: m.cogs, bud: b.cogs, cost: true },
    { label: "Operating expenses", act: m.opex, bud: b.opex, cost: true },
    { label: "EBITDA", act: m.ebitda, bud: b.ebitda, bold: true },
    { label: "EBITDA margin", act: m.ebitdaMargin, bud: b.ebitdaMargin, fmt: "pct" },
    { label: "Operating cash flow", act: m.cfo, bud: b.cfo, bold: true },
  ];
  const revVar = b.revenueVar ?? 0;
  const cogsVar = -(b.cogsVar ?? 0);
  const opexVar = -((m.opex ?? 0) - (b.opex ?? 0));
  return (
    <div className="grid gap-4 p-4 xl:grid-cols-2" data-testid="bva">
      <div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="py-1.5 text-left font-medium">{a.current.period.label}</th>
              <th className="py-1.5 text-right font-medium">Actual</th>
              <th className="py-1.5 text-right font-medium">Budget</th>
              <th className="py-1.5 text-right font-medium">Variance</th>
              <th className="py-1.5 text-right font-medium">Var %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isPct = r.fmt === "pct";
              const v = r.act !== null && r.bud !== null ? r.act - r.bud : null;
              const vp = !isPct && v !== null && r.bud ? v / Math.abs(r.bud) : null;
              const favorable = v === null ? null : r.cost ? v < 0 : v > 0;
              return (
                <tr key={r.label} className={cn("border-b border-line/60", r.bold && "font-semibold")}>
                  <td className="py-1.5 text-ink">{r.label}</td>
                  <td className="num py-1.5 text-right">{isPct ? fmtPct(r.act) : fmtUsd(r.act, { decimals: 2 })}</td>
                  <td className="num py-1.5 text-right text-ink-2">{isPct ? fmtPct(r.bud) : fmtUsd(r.bud, { decimals: 2 })}</td>
                  <td className={cn("num py-1.5 text-right", favorable === null ? "text-faint" : favorable ? "text-pos" : "text-neg")}>{isPct ? fmtPp(v) : fmtUsd(v, { signed: true, decimals: 2 })}</td>
                  <td className={cn("num py-1.5 text-right", favorable === null ? "text-faint" : favorable ? "text-pos" : "text-neg")}>{isPct ? "" : fmtPct(vp, { signed: true })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">
          Variance = Actual − Budget. For cost lines a positive variance (overspend) is unfavorable. {b.acquisitions.length ? "Budget excludes an acquisition closed during the budget year." : ""}
          {b.cfo === null ? " Budget cash flow not provided." : ""}
        </p>
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-ink-2">EBITDA bridge: budget → actual</div>
        <Waterfall
          steps={[
            { label: "Budget EBITDA", value: b.ebitda ?? 0, kind: "total" },
            { label: "Revenue", value: revVar, kind: "delta" },
            { label: "COGS", value: cogsVar, kind: "delta" },
            { label: "Opex", value: opexVar, kind: "delta" },
            { label: "Actual EBITDA", value: m.ebitda ?? 0, kind: "total" },
          ]}
        />
      </div>
    </div>
  );
}

function KpiTable({ company, cols }: { company: Company; cols: { label: string; a: CompanyAnalysis; partial: boolean }[] }) {
  const data = getData();
  const ops = data.operationalByCompany.get(company.id) ?? [];
  const at = (a: CompanyAnalysis) => (a.current.status === "complete" ? ops[a.current.period.end] : undefined);
  const rows: { label: string; get: (a: CompanyAnalysis) => N; fmt: MetricFormat; show: boolean; note?: string }[] = [
    { label: "Employees (period end)", get: (a) => a.current.metrics.employees, fmt: "count", show: true },
    { label: "Revenue per employee (annualized)", get: (a) => a.current.metrics.revenuePerEmployee, fmt: "usdk", show: true },
    { label: "ARR (period end)", get: (a) => a.current.metrics.arr, fmt: "usd", show: company.hasArr, note: "12 × month-end subscription MRR. Not recognized revenue." },
    { label: "Customers", get: (a) => a.current.metrics.customers, fmt: "count", show: company.hasArr },
    { label: "Net revenue retention (reported)", get: (a) => at(a)?.netRevenueRetention ?? null, fmt: "pct", show: company.hasArr },
    { label: "Billable headcount", get: (a) => at(a)?.billableHeadcount ?? null, fmt: "count", show: ops.some((o) => o?.billableHeadcount !== null) },
    { label: "Utilization (billable)", get: (a) => at(a)?.utilization ?? null, fmt: "pct", show: ops.some((o) => o?.utilization !== null) },
  ];
  return (
    <div className="thin-scroll overflow-x-auto" data-testid="kpi-table">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-line bg-subtle text-xs text-muted">
            <th className="px-3 py-2 text-left font-medium">Operating KPI</th>
            {cols.map((c) => (
              <th key={c.label} className="px-3 py-2 text-right font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows
            .filter((r) => r.show)
            .map((r) => (
              <tr key={r.label} className="border-b border-line/60">
                <td className="px-3 py-1.5 text-ink-2">{r.note ? <Tip content={r.note}><span className="cursor-help border-b border-dotted border-line-strong">{r.label}</span></Tip> : r.label}</td>
                {cols.map((c) => (
                  <td key={c.label} className="num px-3 py-1.5 text-right">
                    {fmtMetric(r.get(c.a), r.fmt)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
      {!company.hasArr && <p className="px-3 py-2 text-xs text-muted">ARR and customer metrics are not shown: {company.name} is not a subscription business.</p>}
    </div>
  );
}

export function EntityPanel({ company, period }: { company: Company; period: Period }) {
  const data = getData();
  const ents = data.entitiesByCompany.get(company.id) ?? [];
  const rows = (data.entityMonthlyByCompany.get(company.id) ?? []).filter((r) => r.month >= period.start && r.month <= period.end);
  if (company.connection !== "dualentry")
    return (
      <div className="flex flex-col items-center gap-2 p-10 text-center" data-testid="entity-locked">
        <Lock className="h-6 w-6 text-faint" />
        <p className="text-sm font-medium text-ink">Entity-level ledgers are not available for {company.name}</p>
        <p className="max-w-lg text-sm text-muted">
          {company.name} reports consolidated figures from {company.accountingSystem} ({company.entityCount} legal entit{company.entityCount === 1 ? "y" : "ies"}). Entity P&amp;L, intercompany eliminations and organic/acquired splits require an authorized ledger connection.
        </p>
      </div>
    );
  if (rows.length === 0)
    return (
      <div className="flex flex-col items-center gap-2 p-10 text-center" data-testid="entity-unavailable">
        <Lock className="h-6 w-6 text-faint" />
        <p className="text-sm font-medium text-ink">No entity-level books for {period.label}</p>
        <p className="max-w-lg text-sm text-muted">
          {company.dataSource.includes("migrated")
            ? `${company.name} moved to DualEntry recently; entity-level books start with its first DualEntry close. Earlier periods were uploaded by Northbridge as consolidated figures.`
            : `${company.name}'s sharing scope does not include entity-level books for this period. Only the company can change that, in DualEntry.`}
        </p>
      </div>
    );
  const agg = ents.filter((e) => rows.some((r) => r.entityId === e.id)).map((e) => {
    const r = rows.filter((x) => x.entityId === e.id);
    return {
      e,
      ext: r.reduce((s, x) => s + x.externalRevenue, 0),
      icR: r.reduce((s, x) => s + x.intercompanyRevenue, 0),
      icC: r.reduce((s, x) => s + x.intercompanyCost, 0),
      ebitda: r.reduce((s, x) => s + x.ebitda, 0),
      months: new Set(r.map((x) => x.month)).size,
    };
  });
  const totExt = agg.reduce((s, x) => s + x.ext, 0);
  const totIc = agg.reduce((s, x) => s + x.icR, 0);
  const totE = agg.reduce((s, x) => s + x.ebitda, 0);
  return (
    <div className="p-4" data-testid="entity-panel">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        <Badge tone="brand">DualEntry ledger</Badge> {agg.length} legal entities · {period.label} ·{" "}
        {company.entityShare === "partial" ? "the company shares only these entities' books, so totals are not the consolidated figures" : "intercompany eliminated automatically · reconciles to consolidated P&L"}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            <th className="py-1.5 text-left font-medium">Entity</th>
            <th className="py-1.5 text-left font-medium">Role</th>
            <th className="py-1.5 text-left font-medium">Country / ccy</th>
            <th className="py-1.5 text-right font-medium">Gross revenue</th>
            <th className="py-1.5 text-right font-medium">Intercompany</th>
            <th className="py-1.5 text-right font-medium">External revenue</th>
            <th className="py-1.5 text-right font-medium">EBITDA</th>
          </tr>
        </thead>
        <tbody>
          {agg.map((x) => (
            <tr key={x.e.id} className="border-b border-line/60">
              <td className="py-1.5 font-medium text-ink">
                {x.e.name}
                {x.e.role === "Acquired" && <Badge tone="warn" className="ml-1.5">Acquired</Badge>}
              </td>
              <td className="py-1.5 text-ink-2">{x.e.role}</td>
              <td className="py-1.5 text-ink-2">
                {x.e.country} · {x.e.currency}
              </td>
              <td className="num py-1.5 text-right">{fmtUsd(x.ext + x.icR, { decimals: 2 })}</td>
              <td className="num py-1.5 text-right text-muted">{x.icR ? fmtUsd(-x.icR, { decimals: 2 }) : "—"}</td>
              <td className="num py-1.5 text-right">{fmtUsd(x.ext, { decimals: 2 })}</td>
              <td className="num py-1.5 text-right">{fmtUsd(x.ebitda, { decimals: 2 })}</td>
            </tr>
          ))}
          <tr className="border-b border-line/60 text-muted">
            <td className="py-1.5" colSpan={3}>
              Intercompany eliminations
            </td>
            <td className="num py-1.5 text-right">{fmtUsd(-totIc, { decimals: 2 })}</td>
            <td />
            <td className="num py-1.5 text-right">—</td>
            <td className="num py-1.5 text-right">$0 (nets to zero)</td>
          </tr>
          <tr className="bg-subtle font-semibold">
            <td className="py-2" colSpan={3}>
              {company.entityShare === "partial" ? "Total of shared entities" : "Consolidated"}
            </td>
            <td className="num py-2 text-right">{fmtUsd(totExt, { decimals: 2 })}</td>
            <td />
            <td className="num py-2 text-right">{fmtUsd(totExt, { decimals: 2 })}</td>
            <td className="num py-2 text-right">{fmtUsd(totE, { decimals: 2 })}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function Statements({ company, period, current }: { company: Company; period: Period; current: CompanyAnalysis }) {
  const [g, setG] = useState<Granularity>("quarter");
  const [tab, setTab] = useState("is");
  const cols = useMemo(
    () => companyStatementPeriods(company.id, period.end, g).map((x) => ({ label: x.label, a: x.a, partial: x.a.current.status !== "complete" })),
    [company.id, period.end, g],
  );
  const exportCsv = () => {
    const lines = tab === "cf" ? CASH : INCOME;
    const flat: Line[] = [];
    const walk = (ls: Line[]) => ls.forEach((l) => (flat.push(l), l.children && walk(l.children)));
    walk(lines);
    const csv = buildCsv(
      flat,
      [
        { header: "Line item", format: "text", get: (l: Line) => l.label },
        { header: "Unit", format: "text", get: (l: Line) => (l.format === "pct" ? "%" : l.format === "count" ? "count" : "USD M") },
        ...cols.map((c) => ({
          header: c.label + (c.partial ? " (incomplete)" : ""),
          format: "text" as const,
          get: (l: Line) => {
            const v = c.a.current.status === "complete" ? l.get(c.a.current.metrics, c.a) : null;
            return csvValue(v, l.format ?? "usd");
          },
        })),
      ],
      { title: `${company.name} - ${tab === "cf" ? "Cash flow" : "Income statement"}`, period: `${g === "month" ? "Monthly" : g === "quarter" ? "Quarterly" : "Annual"} view ending ${period.label}`, scope: company.name },
    );
    downloadText(`${slug(company.name)}-${tab === "cf" ? "cash-flow" : "income-statement"}-${g}.csv`, csv);
  };
  return (
    <div className="rounded-lg border border-line bg-surface shadow-card" data-testid="statements">
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 pt-2">
          <TabsList className="border-0">
            <TabsTrigger value="is" data-testid="tab-is">Income Statement</TabsTrigger>
            <TabsTrigger value="cf" data-testid="tab-cf">Cash Flow</TabsTrigger>
            <TabsTrigger value="bva" data-testid="tab-bva">Budget vs Actual</TabsTrigger>
            <TabsTrigger value="kpi" data-testid="tab-kpi">Operating KPIs</TabsTrigger>
            <TabsTrigger value="ent" data-testid="tab-ent">Entities &amp; consolidation</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2 pb-2">
            {tab !== "bva" && tab !== "ent" && (
              <Segmented<Granularity>
                ariaLabel="Granularity"
                value={g}
                onChange={setG}
                options={[
                  { value: "month", label: "Monthly" },
                  { value: "quarter", label: "Quarterly" },
                  { value: "year", label: "Annual" },
                ]}
              />
            )}
            {(tab === "is" || tab === "cf") && (
              <Button size="sm" onClick={exportCsv}>
                <Download className="h-3.5 w-3.5" /> CSV
              </Button>
            )}
          </div>
        </div>
        <TabsContent value="is">
          <StatementTable lines={INCOME} cols={cols} testId="income-statement" />
          <p className="border-t border-line px-4 py-2 text-[11px] text-muted">Costs shown as negatives. EBITDA = gross profit − operating expenses. Expand line items with the chevrons. Partial periods are flagged and not annualized.</p>
        </TabsContent>
        <TabsContent value="cf">
          <StatementTable lines={CASH} cols={cols} testId="cash-flow" />
          <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
            {company.connection === "dualentry"
              ? "Full cash bridge from the DualEntry ledger (interest, taxes and working capital by account)."
              : `Interest, tax and working-capital lines are not part of ${company.name}'s submission (N/A); operating cash flow is reported as a total.`}
          </p>
        </TabsContent>
        <TabsContent value="bva">
          <BudgetVsActual a={current} company={company} />
        </TabsContent>
        <TabsContent value="kpi">
          <KpiTable company={company} cols={cols} />
        </TabsContent>
        <TabsContent value="ent">
          <EntityPanel company={company} period={period} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
