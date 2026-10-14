"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CompanyAnalysis } from "@/lib/engine/company";
import type { ComparisonBasis, Period } from "@/lib/engine/periods";
import { portfolioSeries, type PortfolioSummary } from "@/lib/engine/portfolio";
import { getData } from "@/lib/data";
import { RankBars, TrendChart } from "../charts/charts";
import { CardHeader, Segmented } from "../ui/primitives";

type ChartMetric = "revenue" | "ebitda" | "ebitdaMargin" | "cfo";

const DIST: Record<ChartMetric, { title: string; format: "pct" | "pp"; get: (a: CompanyAnalysis, b: "prior" | "yoy") => number | null; ref: (s: PortfolioSummary, b: "prior" | "yoy") => number | null; refLabel: string; sign?: boolean }> = {
  revenue: { title: "Revenue growth by company", format: "pct", get: (a, b) => (b === "prior" ? a.prior : a.yoy)?.revenueGrowth ?? null, ref: (s, b) => s.revenueGrowth[b].aggregate, refLabel: "Portfolio" },
  ebitda: { title: "EBITDA margin by company", format: "pct", get: (a) => a.current.metrics.ebitdaMargin, ref: (s) => s.kpis.ebitdaMargin.aggregate, refLabel: "Portfolio" },
  ebitdaMargin: { title: "EBITDA margin change by company", format: "pp", get: (a, b) => (b === "prior" ? a.prior : a.yoy)?.ebitdaMarginChange ?? null, ref: () => null, refLabel: "", sign: true },
  cfo: { title: "Cash conversion by company", format: "pct", get: (a) => a.current.metrics.cashConversion, ref: (s) => (s.kpis.cfo.aggregate !== null && s.kpis.ebitda.aggregate ? s.kpis.cfo.aggregate / s.kpis.ebitda.aggregate : null), refLabel: "Portfolio" },
};

export function PerformanceCharts({ s, ids, period, basis }: { s: PortfolioSummary; ids: string[]; period: Period; basis: ComparisonBasis }) {
  const router = useRouter();
  const [metric, setMetric] = useState<ChartMetric>("revenue");
  const series = useMemo(() => portfolioSeries(ids, period, 11), [ids, period]);
  const gb = basis === "budget" ? "yoy" : basis;
  const d = DIST[metric];
  const dist = s.analyses
    .filter((a) => a.current.status === "complete")
    .map((a) => ({ label: a.company.name, id: a.company.id, value: d.get(a, gb) }))
    .sort((x, y) => (y.value ?? -9) - (x.value ?? -9));
  const fmt = metric === "ebitdaMargin" ? "pct" : "usd";
  const titles: Record<ChartMetric, string> = { revenue: "Revenue", ebitda: "EBITDA", ebitdaMargin: "EBITDA margin (Σ ÷ Σ)", cfo: "Operating cash flow" };
  const excluded = ids.length - series.cohort.length;
  const data = getData();
  return (
    <div className="grid gap-3 xl:grid-cols-5">
      <div className="rounded-lg border border-line bg-surface shadow-card xl:col-span-3" data-testid="trend-chart">
        <CardHeader
          title={`Portfolio ${titles[metric].toLowerCase()} — quarterly`}
          description={`Fixed cohort of ${series.cohort.length} companies with complete ${period.label} data${excluded ? ` (${excluded} excluded: ${ids.filter((i) => !series.cohort.includes(i)).map((i) => data.companyById.get(i)!.name).join(", ")})` : ""}, so reporting gaps do not distort the trend.`}
          actions={
            <Segmented<ChartMetric>
              ariaLabel="Chart metric"
              value={metric}
              onChange={setMetric}
              options={[
                { value: "revenue", label: "Revenue" },
                { value: "ebitda", label: "EBITDA" },
                { value: "ebitdaMargin", label: "EBITDA margin" },
                { value: "cfo", label: "Op. cash flow" },
              ]}
            />
          }
        />
        <div className="px-2 pb-2 pt-3">
          {series.cohort.length ? (
            <TrendChart data={series.points.map((pt) => ({ ...pt, fullLabel: pt.label, label: pt.label.replace(" 20", " ’") })) as unknown as Record<string, unknown>[]} dataKey={metric} format={fmt} name={titles[metric]} height={268} />
          ) : (
            <p className="px-4 py-16 text-center text-sm text-muted">No companies with complete data for {period.label} in the current filter.</p>
          )}
        </div>
      </div>
      <div className="rounded-lg border border-line bg-surface shadow-card xl:col-span-2" data-testid="distribution-chart">
        <CardHeader title={d.title} description={`${period.label}${metric === "revenue" || metric === "ebitdaMargin" ? ` · ${gb === "yoy" ? "year-over-year" : "vs prior quarter"}` : metric === "cfo" ? " · CFO ÷ EBITDA (N/A if EBITDA ≤ 0)" : ""} · click a bar to open`} />
        <div className="px-2 pb-2 pt-1">
          <RankBars
            data={dist}
            format={d.format}
            reference={d.ref(s, gb)}
            referenceLabel={d.refLabel}
            colorBySign={d.sign}
            onSelect={(id) => router.push(`/companies/${id}`)}
            height={Math.max(268, dist.length * 26 + 40)}
          />
        </div>
      </div>
    </div>
  );
}
