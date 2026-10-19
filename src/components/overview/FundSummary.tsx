"use client";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, Info } from "lucide-react";
import type { Fund } from "@/lib/data/types";
import type { IndexedDataset } from "@/lib/data";
import type { ComparisonBasis, Period } from "@/lib/engine/periods";
import { comparisonLabel } from "@/lib/engine/periods";
import { portfolioSummary, type PortfolioSummary } from "@/lib/engine/portfolio";
import type { Company } from "@/lib/data/types";
import { fmtPct, fmtUsd } from "@/lib/format";
import { routes } from "@/lib/routes";
import { Delta } from "../fin/fin";
import { CardHeader } from "../ui/primitives";

/**
 * Operating roll-up by fund (sum of the fund's companies). Deliberately not "fund performance":
 * there are no returns, NAV or cash flows to LPs in this dataset. Funds add up to the portfolio total.
 */
export function FundSummary({ total, companies, period, basis, data }: { total: PortfolioSummary; companies: Company[]; period: Period; basis: ComparisonBasis; data: IndexedDataset }) {
  const gb = basis === "budget" ? "yoy" : basis;
  const funds = useMemo(
    () =>
      data.funds
        .map((f: Fund) => ({ f, ids: companies.filter((c) => c.fund === f.id).map((c) => c.id) }))
        .filter((x) => x.ids.length)
        .map((x) => ({ fund: x.f, s: portfolioSummary(x.ids, period, data) })),
    [data, companies, period],
  );
  const rows = [...funds.map((x) => ({ key: x.fund.id, label: x.fund.name, sub: `Vintage ${x.fund.vintage}`, s: x.s })), { key: "total", label: "Portfolio", sub: "All funds in scope", s: total }];
  return (
    <div className="rounded-lg border border-line bg-surface shadow-card" data-testid="fund-summary">
      <CardHeader title="By fund" description={`${period.label} · growth ${comparisonLabel(gb, period)} · sum of each fund's companies with complete data`} />
      <div className="thin-scroll overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-line bg-subtle text-xs text-muted">
              <th className="px-4 py-2 text-left font-medium">Fund</th>
              <th className="px-3 py-2 text-right font-medium">Companies reporting</th>
              <th className="px-3 py-2 text-right font-medium">Revenue</th>
              <th className="px-3 py-2 text-right font-medium">Revenue growth (Σ)</th>
              <th className="px-3 py-2 text-right font-medium">EBITDA</th>
              <th className="px-3 py-2 text-right font-medium">EBITDA margin</th>
              <th className="px-3 py-2 text-right font-medium">Op. cash flow</th>
              <th className="px-4 py-2 text-right font-medium">EBITDA vs budget</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, label, sub, s }) => {
              const isTotal = key === "total";
              return (
                <tr key={key} className={isTotal ? "border-t-2 border-line-strong bg-subtle/70 font-semibold" : "border-b border-line/60"} data-testid={isTotal ? "fund-total" : `fund-${key}`}>
                  <td className="px-4 py-2">
                    <div className="text-ink">{label}</div>
                    <div className="text-[11px] font-normal text-muted">{sub}</div>
                  </td>
                  <td className="num px-3 py-2 text-right text-ink-2">
                    {s.reporting.complete} / {s.reporting.total}
                  </td>
                  <td className="num px-3 py-2 text-right text-ink">{fmtUsd(s.kpis.revenue.aggregate)}</td>
                  <td className="px-3 py-2 text-right">
                    <Delta value={s.revenueGrowth[gb].aggregate} metricKey="revenueGrowth" showIcon={false} />
                  </td>
                  <td className="num px-3 py-2 text-right text-ink">{fmtUsd(s.kpis.ebitda.aggregate)}</td>
                  <td className="num px-3 py-2 text-right text-ink">
                    {fmtPct(s.kpis.ebitdaMargin.aggregate)} <Delta value={s.kpis.ebitdaMargin.comparisons[gb].aggregateChange} metricKey="ebitdaMarginChange" format="pp" showIcon={false} className="text-[11px]" />
                  </td>
                  <td className="num px-3 py-2 text-right text-ink">{fmtUsd(s.kpis.cfo.aggregate)}</td>
                  <td className="px-4 py-2 text-right">
                    <Delta value={s.kpis.ebitda.comparisons.budget.aggregateChange} metricKey="ebitdaVsBudget" showIcon={false} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2 text-[11px] text-muted">
        <span className="flex items-center gap-1">
          <Info className="h-3 w-3" /> Operating roll-up of each fund&apos;s companies — not fund returns (no IRR, MOIC or NAV in this dataset). Funds add up to the portfolio row.
        </span>
        <Link href={routes.companies()} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline" data-testid="to-companies">
          {total.analyses.length} companies · {total.reporting.complete} with complete {period.label} data <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
