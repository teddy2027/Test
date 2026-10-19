"use client";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CompanyAnalysis } from "@/lib/engine/company";
import { describeFilters } from "@/lib/engine/filters";
import { detectInsights } from "@/lib/engine/insights";
import { comparisonLabel } from "@/lib/engine/periods";
import { buildCsv, downloadText, slug, type CsvColumn } from "@/lib/export";
import { fmtPct, fmtPp, fmtUsd } from "@/lib/format";
import { usePortfolio } from "@/lib/state/hooks";
import { PageHeader } from "../overview/OverviewPage";
import { Button } from "../ui/primitives";

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={cn("border-b border-ink/70 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-2", right ? "text-right" : "text-left")}>{children}</th>;
}
function Td({ children, right, className }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={cn("border-b border-line px-2 py-1.5", right && "num text-right", className)}>{children}</td>;
}

/** The quarterly portfolio pack: one printable, exportable summary that respects the active filters and period. */
export function ReportingPage() {
  const { summary, companies, period, basis, filters, data } = usePortfolio();
  const gb = basis === "prior" ? "prior" : "yoy";
  const scope = describeFilters(filters, Object.fromEntries(data.funds.map((f) => [f.id, f.shortName])));
  const insights = useMemo(() => detectInsights(companies, period), [companies, period]);
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
  const exportCsv = () => downloadText(`portfolio-operating-summary-${slug(period.label)}.csv`, buildCsv(summary.analyses, summaryCols, { title: "Quarterly portfolio operating summary", ...meta }));

  return (
    <div>
      <div className="no-print">
        <Link href="/" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
          <ArrowLeft className="h-3 w-3" /> Portfolio
        </Link>
        <PageHeader title="Quarterly portfolio pack" subtitle="For the investment committee or investors. Respects the active filters and period; labelled as synthetic.">
          <Button onClick={exportCsv} data-testid="report-csv">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button variant="primary" onClick={() => window.print()} data-testid="report-print">
            <Printer className="h-3.5 w-3.5" /> Print / PDF
          </Button>
        </PageHeader>
      </div>
      <article className="print-area rounded-lg border border-line bg-white p-8 shadow-card" data-testid="report-preview">
        <header className="mb-5 flex items-start justify-between border-b-2 border-ink pb-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">DualEntry | Portfolio Intelligence · {data.firm.name}</div>
            <h2 className="mt-1 text-xl font-semibold text-ink">Quarterly portfolio operating summary</h2>
            <div className="mt-0.5 text-sm text-ink-2">
              {period.label} · {comparisonLabel(gb, period)} · {scope}
            </div>
          </div>
          <div className="rounded border border-warn/40 bg-warn-soft px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-warn">Concept demo · synthetic data</div>
        </header>
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
        <footer className="mt-6 border-t border-line pt-2 text-[10.5px] text-muted">
          {data.firm.disclaimer} Labor = direct labor (COGS) + operating personnel; ratios in percentage points (pp); growth on same months; budgets exclude acquisitions closed during the budget year. Generated by DualEntry Portfolio Intelligence (concept prototype).
        </footer>
      </article>
    </div>
  );
}
