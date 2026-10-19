"use client";
import { useMemo } from "react";
import { comparisonLabel } from "@/lib/engine/periods";
import { detectInsights } from "@/lib/engine/insights";
import { describeFilters } from "@/lib/engine/filters";
import { usePortfolio } from "@/lib/state/hooks";
import { useApp } from "@/lib/state/store";
import { Badge, Segmented } from "../ui/primitives";
import { KpiCards } from "./KpiCards";
import { PerformanceCharts } from "./PerformanceCharts";
import { FundSummary } from "./FundSummary";
import { Signals } from "./Signals";
import type { ComparisonBasis } from "@/lib/engine/periods";
import type { AggregationMode } from "@/lib/engine/portfolio";

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function OverviewPage() {
  const { summary, companies, period, basis, filters, data } = usePortfolio();
  const aggregation = useApp((s) => s.aggregation);
  const setAggregation = useApp((s) => s.setAggregation);
  const setBasis = useApp((s) => s.setBasis);
  const insights = useMemo(() => detectInsights(companies, period), [companies, period]);
  const ids = useMemo(() => companies.map((c) => c.id), [companies]);
  const scopeText = describeFilters(filters, Object.fromEntries(data.funds.map((f) => [f.id, f.shortName])));
  return (
    <div className="space-y-4">
      <PageHeader
        title="Portfolio"
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-ink-2">{period.label}</span>
            <span>·</span>
            <span>{companies.length} companies</span>
            <span>·</span>
            <span>{comparisonLabel(basis, period)}</span>
            {scopeText !== "All portfolio companies" && <Badge tone="brand">Filtered: {scopeText}</Badge>}
          </span>
        }
      >
        <Segmented<ComparisonBasis>
          ariaLabel="KPI comparison"
          value={basis}
          onChange={setBasis}
          options={[
            { value: "prior", label: period.kind === "quarter" ? "vs Prior Q" : "vs Prior", disabled: period.kind === "fy" || period.kind === "ytd" },
            { value: "yoy", label: "vs Last year" },
            { value: "budget", label: "vs Budget" },
          ]}
        />
        <Segmented<AggregationMode>
          ariaLabel="Aggregation mode"
          value={aggregation}
          onChange={setAggregation}
          options={[
            { value: "aggregate", label: "Aggregate (Σ)", title: "Portfolio-weighted: Σ numerator ÷ Σ denominator" },
            { value: "average", label: "Avg company", title: "Arithmetic mean of company-level metrics" },
          ]}
        />
      </PageHeader>
      {companies.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface p-10 text-center text-sm text-muted">No companies match the current filters. Use Reset in the filter bar.</div>
      ) : (
        <>
          <KpiCards s={summary} basis={basis} mode={aggregation} />
          <Signals insights={insights} />
          <PerformanceCharts s={summary} ids={ids} period={period} basis={basis} />
          <FundSummary total={summary} companies={companies} period={period} basis={basis} data={data} />
        </>
      )}
    </div>
  );
}
