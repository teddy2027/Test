"use client";
import { cn } from "@/lib/cn";
import type { ComparisonBasis } from "@/lib/engine/periods";
import { comparisonShortLabel } from "@/lib/engine/periods";
import type { AggregationMode, KpiComparison, PortfolioSummary } from "@/lib/engine/portfolio";
import { getData } from "@/lib/data";
import { fmtPct, fmtPp, fmtUsd } from "@/lib/format";
import { Delta, Sparkline } from "../fin/fin";
import { InfoTip, Tip } from "../ui/primitives";

function CoverageNote({ c, label }: { c: KpiComparison; label?: string }) {
  const data = getData();
  if (!c.available) return <span className="text-faint">Comparison unavailable</span>;
  const excl = c.coverage.excluded.map((e) => `${data.companyById.get(e.companyId)?.name}: ${e.reason}`).join("\n");
  return (
    <Tip content={excl ? <span className="whitespace-pre-line">{`Excluded from comparison:\n${excl}`}</span> : "All companies in scope included."}>
      <span className="cursor-help border-b border-dotted border-line-strong">
        {label ?? "Like-for-like"}: {c.coverage.included} of {c.coverage.total}
      </span>
    </Tip>
  );
}

function Card({ label, info, value, children, spark, testId }: { label: string; info: string; value: React.ReactNode; children?: React.ReactNode; spark?: (number | null)[]; testId?: string }) {
  return (
    <div data-testid={testId} className="flex min-w-0 flex-col rounded-lg border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-1 text-xs font-medium text-muted">
        {label}
        <InfoTip text={info} />
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <div className="num truncate text-[26px] font-semibold leading-8 tracking-tight text-ink" data-testid={testId ? `${testId}-value` : undefined}>
          {value}
        </div>
        {spark && <Sparkline values={spark} width={72} height={26} />}
      </div>
      <div className="mt-2 space-y-1 text-xs text-muted">{children}</div>
    </div>
  );
}

export function KpiCards({ s, basis, mode }: { s: PortfolioSummary; basis: ComparisonBasis; mode: AggregationMode }) {
  const p = s.period;
  const cl = comparisonShortLabel(basis, p);
  const growthBasis = basis === "budget" ? "yoy" : basis;
  const g = s.revenueGrowth[growthBasis];
  const rev = s.kpis.revenue;
  const eb = s.kpis.ebitda;
  const em = s.kpis.ebitdaMargin;
  const cfo = s.kpis.cfo;
  const r = s.reporting;
  const amountDelta = (c: KpiComparison, key: string) => <Delta value={c.aggregateChange} metricKey={key === "revenue" ? "revenueGrowth" : key === "ebitda" ? "ebitdaGrowth" : "cfoGrowth"} />;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6" data-testid="kpi-cards">
      <Card
        testId="kpi-revenue"
        label="Portfolio Revenue"
        info="Σ revenue of companies with complete data for the period (management-view sum, not GAAP-consolidated). Change is computed on a like-for-like cohort."
        value={fmtUsd(rev.aggregate)}
        spark={rev.trend.map((t) => t.value)}
      >
        <div className="flex items-center gap-1.5">
          {amountDelta(rev.comparisons[basis], "revenue")} <span>{cl}</span>
        </div>
        <CoverageNote c={rev.comparisons[basis]} />
      </Card>
      <Card
        testId="kpi-growth"
        label={mode === "aggregate" ? "Revenue Growth · Aggregate" : "Revenue Growth · Avg company"}
        info="Aggregate = Σ revenue (current) ÷ Σ revenue (comparison) − 1 for the same eligible cohort. Average company = mean of each company's own growth rate. Switch with the Aggregate / Average toggle."
        value={fmtPct(mode === "aggregate" ? g.aggregate : g.average, { signed: true })}
        spark={rev.trend.map((t, i, arr) => (i >= 4 && arr[i - 4].value && t.value ? t.value / (arr[i - 4].value as number) - 1 : null))}
      >
        <div>
          {mode === "aggregate" ? "Avg company" : "Aggregate"}: <span className="num font-medium text-ink-2">{fmtPct(mode === "aggregate" ? g.average : g.aggregate, { signed: true })}</span>
          <span className="text-faint"> · {growthBasis === "yoy" ? "YoY" : "QoQ"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2">
          <CoverageNote c={rev.comparisons[growthBasis]} label="Cohort" />
          {g.acquisitionAffected.length > 0 && (
            <Tip content={`Includes acquisition-affected companies: ${g.acquisitionAffected.map((id) => getData().companyById.get(id)?.name).join(", ")}. Reported growth is not constant-perimeter.`}>
              <span className="cursor-help text-warn">{g.acquisitionAffected.length} M&A-affected</span>
            </Tip>
          )}
        </div>
      </Card>
      <Card testId="kpi-ebitda" label="Portfolio EBITDA" info="Σ EBITDA of companies with complete data for the period." value={fmtUsd(eb.aggregate)} spark={eb.trend.map((t) => t.value)}>
        <div className="flex items-center gap-1.5">
          {amountDelta(eb.comparisons[basis], "ebitda")} <span>{cl}</span>
        </div>
        <CoverageNote c={eb.comparisons[basis]} />
      </Card>
      <Card
        testId="kpi-margin"
        label={mode === "aggregate" ? "EBITDA Margin · Portfolio" : "EBITDA Margin · Avg company"}
        info="Portfolio EBITDA margin = Σ EBITDA ÷ Σ revenue (weighted). Average company margin = mean of individual company margins. Changes in percentage points."
        value={fmtPct(mode === "aggregate" ? em.aggregate : em.average)}
        spark={em.trend.map((t) => t.value)}
      >
        <div className="flex items-center gap-1.5">
          <Delta value={mode === "aggregate" ? em.comparisons[basis].aggregateChange : em.comparisons[basis].averageChange} metricKey="ebitdaMarginChange" format="pp" /> <span>{cl}</span>
        </div>
        <div>
          {mode === "aggregate" ? "Avg company" : "Portfolio"}: <span className="num font-medium text-ink-2">{fmtPct(mode === "aggregate" ? em.average : em.aggregate)}</span>
          <span className="text-faint"> · median {fmtPct(em.median)}</span>
        </div>
      </Card>
      <Card
        testId="kpi-cfo"
        label="Operating Cash Flow"
        info="Σ reported cash from operations (after cash interest, taxes and working capital) — never approximated by EBITDA."
        value={fmtUsd(cfo.aggregate)}
        spark={cfo.trend.map((t) => t.value)}
      >
        <div className="flex items-center gap-1.5">
          {amountDelta(cfo.comparisons[basis], "cfo")} <span>{cl}</span>
        </div>
        <div>
          Cash conversion: <span className="num font-medium text-ink-2">{fmtPct(cfo.aggregate !== null && eb.aggregate ? cfo.aggregate / eb.aggregate : null, { decimals: 0 })}</span>
          <span className="text-faint"> of EBITDA</span>
        </div>
      </Card>
      <Card testId="kpi-reporting" label="Companies Reporting" info="Companies with complete data for every month of the selected period. Partial or missing companies are excluded from totals." value={`${r.complete} / ${r.total}`}>
        <div className="flex h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
          <div className="bg-pos" style={{ width: `${(r.complete / Math.max(1, r.total)) * 100}%` }} />
          <div className="bg-warn" style={{ width: `${(r.partial / Math.max(1, r.total)) * 100}%` }} />
          <div className="bg-neg" style={{ width: `${(r.missing / Math.max(1, r.total)) * 100}%` }} />
        </div>
        <div className={cn(r.partial + r.missing ? "text-ink-2" : "")}>
          {r.partial} partial · {r.missing} missing
        </div>
        <div>
          Budget coverage: {s.budgetCoverage.included} of {s.budgetCoverage.total}
        </div>
      </Card>
    </div>
  );
}

export { fmtPp };
