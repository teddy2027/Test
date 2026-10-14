"use client";
import { useMemo, useState } from "react";
import { Download, FileText, Printer } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CompanyAnalysis } from "@/lib/engine/company";
import { CM } from "@/lib/engine/compareMetrics";
import { median } from "@/lib/engine/core";
import { buildBenchmark, benchmarkMetric } from "@/lib/engine/benchmark";
import { describeFilters } from "@/lib/engine/filters";
import { detectInsights, THRESHOLDS } from "@/lib/engine/insights";
import { comparisonLabel } from "@/lib/engine/periods";
import { buildCsv, downloadText, slug, type CsvColumn } from "@/lib/export";
import { fmtMetric, fmtPct, fmtPp, fmtUsd } from "@/lib/format";
import { usePortfolio } from "@/lib/state/hooks";
import { PageHeader } from "../overview/OverviewPage";
import { Button, Select } from "../ui/primitives";

type ReportId = "summary" | "comparison" | "cost";
const REPORTS: { id: ReportId; title: string; desc: string }[] = [
  { id: "summary", title: "Quarterly portfolio operating summary", desc: "KPIs, company table, flagged findings, data coverage" },
  { id: "comparison", title: "Company comparison summary", desc: "One company against its peer cohort" },
  { id: "cost", title: "Cross-portfolio cost insight summary", desc: "Labor, G&A and cost-of-service benchmarks" },
];

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={cn("border-b border-ink/70 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-2", right ? "text-right" : "text-left")}>{children}</th>;
}
function Td({ children, right, className }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={cn("border-b border-line px-2 py-1.5", right && "num text-right", className)}>{children}</td>;
}

export function ReportingPage() {
  const { summary, companies, period, basis, filters, data } = usePortfolio();
  const [report, setReport] = useState<ReportId>("summary");
  const [subject, setSubject] = useState("meridian-services");
  const gb = basis === "prior" ? "prior" : "yoy";
  const scope = describeFilters(filters, Object.fromEntries(data.funds.map((f) => [f.id, f.shortName])));
  const insights = useMemo(() => detectInsights(companies, period), [companies, period]);
  const complete = summary.analyses.filter((a) => a.current.status === "complete");
  const universe = companies.length ? companies : data.companies;
  const bm = useMemo(() => buildBenchmark(subject, "sector", universe.some((c) => c.id === subject) ? universe : [...universe, data.companyById.get(subject)!], period), [subject, universe, period, data.companyById]);
  const g = (a: CompanyAnalysis) => (gb === "prior" ? a.prior : a.yoy);
  const meta = { period: period.label, comparison: comparisonLabel(gb, period), scope };

  const summaryCols: CsvColumn<CompanyAnalysis>[] = [
    { header: "Company", format: "text", get: (a) => a.company.name },
    { header: "Fund", format: "text", get: (a) => data.funds.find((f) => f.id === a.company.fund)!.shortName },
    { header: "Sector", format: "text", get: (a) => a.company.sector },
    { header: "Revenue", format: "usd", get: (a) => a.current.metrics.revenue },
    { header: "Revenue growth", format: "pct", get: (a) => g(a)?.revenueGrowth ?? null },
    { header: "Acquisition-affected", format: "text", get: (a) => (g(a)?.acquisitions.length ? "Yes" : "No") },
    { header: "EBITDA", format: "usd", get: (a) => a.current.metrics.ebitda },
    { header: "EBITDA margin", format: "pct", get: (a) => a.current.metrics.ebitdaMargin },
    { header: "EBITDA margin change", format: "pp", get: (a) => g(a)?.ebitdaMarginChange ?? null },
    { header: "Labor cost growth", format: "pct", get: (a) => g(a)?.laborGrowth ?? null },
    { header: "Operating cash flow", format: "usd", get: (a) => a.current.metrics.cfo },
    { header: "EBITDA vs budget", format: "pct", get: (a) => a.budget.ebitdaVarPct },
    { header: "Reporting status", format: "text", get: (a) => a.current.status },
  ];
  const costRows = complete.filter((a) => g(a)?.laborGrowth !== null && g(a)?.laborGrowth !== undefined);
  const costCols: CsvColumn<CompanyAnalysis>[] = [
    { header: "Company", format: "text", get: (a) => a.company.name },
    { header: "Sector", format: "text", get: (a) => a.company.sector },
    { header: "Revenue growth", format: "pct", get: (a) => g(a)?.revenueGrowth ?? null },
    { header: "Labor cost growth", format: "pct", get: (a) => g(a)?.laborGrowth ?? null },
    { header: "Labor - revenue growth gap", format: "pp", get: (a) => g(a)?.laborGap ?? null },
    { header: "Labor intensity", format: "pct", get: (a) => a.current.metrics.laborIntensity },
    { header: "G&A / revenue", format: "pct", get: (a) => a.current.metrics.gaRatio },
    { header: "Cost of services ratio", format: "pct", get: (a) => a.current.metrics.cogsRatio },
    { header: "EBITDA margin", format: "pct", get: (a) => a.current.metrics.ebitdaMargin },
  ];
  const compMetrics = ["revenueGrowth", "ebitdaMargin", "ebitdaMarginChange", "grossMargin", "laborGrowth", "laborIntensity", "gaRatio", "cashConversion", "revenueVsBudget"];

  const exportCsv = () => {
    if (report === "summary") downloadText(`portfolio-operating-summary-${slug(period.label)}.csv`, buildCsv(summary.analyses, summaryCols, { title: "Quarterly portfolio operating summary", ...meta }));
    else if (report === "cost") downloadText(`cost-insight-summary-${slug(period.label)}.csv`, buildCsv(costRows, costCols, { title: "Cross-portfolio cost insight summary", ...meta }));
    else
      downloadText(
        `company-comparison-${slug(bm.subject.company.name)}-${slug(period.label)}.csv`,
        buildCsv(
          compMetrics.map((k) => CM[k]),
          [
            { header: "Metric", format: "text", get: (m) => m.label },
            { header: bm.subject.company.name, format: "text", get: (m) => fmtMetric(m.get(bm.subject, gb), m.format) },
            { header: "Peer median", format: "text", get: (m) => fmtMetric(benchmarkMetric(bm, m.key, (a) => m.get(a, gb)).stats.median, m.format) },
            { header: "n", format: "text", get: (m) => String(benchmarkMetric(bm, m.key, (a) => m.get(a, gb)).stats.n) },
          ],
          { title: `Company comparison summary - ${bm.subject.company.name}`, ...meta, scope: `${scope}. Peers: ${bm.peers.map((p) => p.company.name).join(", ")}` },
        ),
      );
  };

  return (
    <div>
      <div className="no-print">
        <PageHeader title="Reporting" subtitle="Board-ready views that respect the active filters and period. Every export is labelled as synthetic.">
          <Button onClick={exportCsv} data-testid="report-csv">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button variant="primary" onClick={() => window.print()} data-testid="report-print">
            <Printer className="h-3.5 w-3.5" /> Print / PDF
          </Button>
        </PageHeader>
      </div>
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="no-print space-y-2">
          {REPORTS.map((r) => (
            <button
              key={r.id}
              onClick={() => setReport(r.id)}
              data-testid={`report-${r.id}`}
              className={cn("w-full rounded-lg border p-3 text-left shadow-card", report === r.id ? "border-brand bg-brand-soft/40 ring-1 ring-brand/30" : "border-line bg-surface hover:border-line-strong")}
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <FileText className="h-4 w-4 text-muted" /> {r.title}
              </div>
              <div className="mt-0.5 text-xs text-muted">{r.desc}</div>
            </button>
          ))}
          {report === "comparison" && (
            <Select ariaLabel="Report company" prefix="Company" value={subject} onChange={setSubject} options={data.companies.map((c) => ({ value: c.id, label: c.name }))} className="w-full" />
          )}
        </div>

        <article className="print-area rounded-lg border border-line bg-white p-8 shadow-card" data-testid="report-preview">
          <header className="mb-5 flex items-start justify-between border-b-2 border-ink pb-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">DualEntry | Portfolio Intelligence · {data.firm.name}</div>
              <h2 className="mt-1 text-xl font-semibold text-ink">{REPORTS.find((r) => r.id === report)!.title}</h2>
              <div className="mt-0.5 text-sm text-ink-2">
                {period.label} · {comparisonLabel(gb, period)} · {scope}
              </div>
            </div>
            <div className="rounded border border-warn/40 bg-warn-soft px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-warn">Concept demo · synthetic data</div>
          </header>

          {report === "summary" && (
            <div className="space-y-5 text-sm">
              <div className="grid grid-cols-3 gap-4 md:grid-cols-6">
                {[
                  ["Revenue", fmtUsd(summary.kpis.revenue.aggregate)],
                  ["Revenue growth (Σ)", fmtPct(summary.revenueGrowth[gb].aggregate, { signed: true })],
                  ["Avg company growth", fmtPct(summary.revenueGrowth[gb].average, { signed: true })],
                  ["EBITDA", fmtUsd(summary.kpis.ebitda.aggregate)],
                  ["EBITDA margin (Σ)", `${fmtPct(summary.kpis.ebitdaMargin.aggregate)} (${fmtPp(summary.kpis.ebitdaMargin.comparisons[gb].aggregateChange)})`],
                  ["Operating cash flow", fmtUsd(summary.kpis.cfo.aggregate)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[11px] uppercase tracking-wide text-muted">{k}</div>
                    <div className="num text-lg font-semibold text-ink">{v}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted">
                Coverage: {summary.reporting.complete} of {summary.reporting.total} companies with complete data; growth on a like-for-like cohort of {summary.revenueGrowth[gb].coverage.included}. Budget coverage {summary.budgetCoverage.included} of {summary.budgetCoverage.total}. Totals are management-view sums, not GAAP-consolidated fund financials.
              </p>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Company</Th>
                    <Th right>Revenue</Th>
                    <Th right>Growth</Th>
                    <Th right>EBITDA</Th>
                    <Th right>Margin</Th>
                    <Th right>Δ margin</Th>
                    <Th right>Labor growth</Th>
                    <Th right>CFO</Th>
                    <Th right>EBITDA vs bud.</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {summary.analyses.map((a) => (
                    <tr key={a.company.id}>
                      <Td>
                        {a.company.name}
                        {g(a)?.acquisitions.length ? " †" : ""}
                      </Td>
                      <Td right>{fmtUsd(a.current.metrics.revenue)}</Td>
                      <Td right>{fmtPct(g(a)?.revenueGrowth ?? null, { signed: true })}</Td>
                      <Td right>{fmtUsd(a.current.metrics.ebitda)}</Td>
                      <Td right>{fmtPct(a.current.metrics.ebitdaMargin)}</Td>
                      <Td right>{fmtPp(g(a)?.ebitdaMarginChange ?? null)}</Td>
                      <Td right>{fmtPct(g(a)?.laborGrowth ?? null, { signed: true })}</Td>
                      <Td right>{fmtUsd(a.current.metrics.cfo)}</Td>
                      <Td right>{fmtPct(a.budget.ebitdaVarPct, { signed: true })}</Td>
                      <Td className="capitalize">{a.current.status}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-muted">† Comparison spans an acquisition; growth is not constant-perimeter.</p>
              <div>
                <h3 className="mb-1.5 text-sm font-semibold text-ink">Findings requiring attention</h3>
                <ul className="list-disc space-y-1 pl-5 text-ink-2">
                  {insights
                    .filter((i) => i.severity === "high")
                    .map((i) => (
                      <li key={i.id}>{i.finding}</li>
                    ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-1.5 text-sm font-semibold text-ink">Positive developments</h3>
                <ul className="list-disc space-y-1 pl-5 text-ink-2">
                  {insights
                    .filter((i) => i.severity === "positive")
                    .map((i) => (
                      <li key={i.id}>{i.finding}</li>
                    ))}
                </ul>
              </div>
            </div>
          )}

          {report === "comparison" && (
            <div className="space-y-4 text-sm">
              <p className="text-ink-2">
                <span className="font-semibold">{bm.subject.company.name}</span> compared with {bm.peers.length} {bm.cohortLabel.toLowerCase()} peers ({bm.peers.map((p) => p.company.name).join(", ")}). Peer statistic: median; subject excluded from the baseline.
              </p>
              {bm.warnings.map((w) => (
                <p key={w} className="text-xs text-warn">
                  ⚠ {w}
                </p>
              ))}
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Metric</Th>
                    <Th right>{bm.subject.company.name}</Th>
                    <Th right>Peer median</Th>
                    <Th right>Peer average</Th>
                    <Th right>Difference</Th>
                  </tr>
                </thead>
                <tbody>
                  {compMetrics.map((k) => {
                    const m = CM[k];
                    const mb = benchmarkMetric(bm, k, (a) => m.get(a, gb));
                    return (
                      <tr key={k}>
                        <Td>{m.label}</Td>
                        <Td right>{fmtMetric(mb.subject, m.format)}</Td>
                        <Td right>{fmtMetric(mb.stats.median, m.format)}</Td>
                        <Td right>{fmtMetric(mb.stats.mean, m.format)}</Td>
                        <Td right>{fmtPp(mb.deltaVsMedian)}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[11px] text-muted">Peer rule: {bm.rule}</p>
            </div>
          )}

          {report === "cost" && (
            <div className="space-y-4 text-sm">
              <p className="text-ink-2">
                Labor cost growth exceeded revenue growth in {costRows.filter((a) => (g(a)?.laborGap ?? 0) > 0).length} of {costRows.length} companies with labor data; {costRows.filter((a) => (g(a)?.laborGap ?? 0) > THRESHOLDS.laborGapPp).length} exceed the {fmtPp(THRESHOLDS.laborGapPp, { signed: false, decimals: 0 })} attention threshold.
              </p>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Company</Th>
                    <Th>Sector</Th>
                    <Th right>Revenue growth</Th>
                    <Th right>Labor growth</Th>
                    <Th right>Gap</Th>
                    <Th right>Labor / rev.</Th>
                    <Th right>G&amp;A / rev.</Th>
                    <Th right>COGS / rev.</Th>
                  </tr>
                </thead>
                <tbody>
                  {[...costRows]
                    .sort((x, y) => (g(y)?.laborGap ?? 0) - (g(x)?.laborGap ?? 0))
                    .map((a) => (
                      <tr key={a.company.id}>
                        <Td>{a.company.name}</Td>
                        <Td>{a.company.sector}</Td>
                        <Td right>{fmtPct(g(a)?.revenueGrowth ?? null, { signed: true })}</Td>
                        <Td right>{fmtPct(g(a)?.laborGrowth ?? null, { signed: true })}</Td>
                        <Td right className={(g(a)?.laborGap ?? 0) > THRESHOLDS.laborGapPp ? "font-semibold text-neg" : ""}>
                          {fmtPp(g(a)?.laborGap ?? null)}
                        </Td>
                        <Td right>{fmtPct(a.current.metrics.laborIntensity)}</Td>
                        <Td right>{fmtPct(a.current.metrics.gaRatio)}</Td>
                        <Td right>{fmtPct(a.current.metrics.cogsRatio)}</Td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <div className="grid grid-cols-2 gap-4">
                {(["Software", "Business Services"] as const).map((sct) => {
                  const list = costRows.filter((a) => a.company.sector === sct);
                  return (
                    <div key={sct} className="rounded border border-line p-3">
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                        {sct} medians (n = {list.length})
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        <span>Labor intensity</span>
                        <span className="num text-right">{fmtPct(median(list.map((a) => a.current.metrics.laborIntensity)))}</span>
                        <span>G&amp;A / revenue</span>
                        <span className="num text-right">{fmtPct(median(list.map((a) => a.current.metrics.gaRatio)))}</span>
                        <span>Labor growth</span>
                        <span className="num text-right">{fmtPct(median(list.map((a) => g(a)?.laborGrowth ?? null)))}</span>
                        <span>EBITDA margin</span>
                        <span className="num text-right">{fmtPct(median(list.map((a) => a.current.metrics.ebitdaMargin)))}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <ul className="list-disc space-y-1 pl-5 text-ink-2">
                {insights
                  .filter((i) => i.category === "Cost Efficiency")
                  .map((i) => (
                    <li key={i.id}>{i.finding}</li>
                  ))}
              </ul>
            </div>
          )}
          <footer className="mt-6 border-t border-line pt-2 text-[10.5px] text-muted">
            {data.firm.disclaimer} Labor = direct labor (COGS) + operating personnel; ratios in percentage points (pp); growth on same months; budgets exclude acquisitions closed during the budget year. Generated by DualEntry Portfolio Intelligence (concept prototype).
          </footer>
        </article>
      </div>
    </div>
  );
}
