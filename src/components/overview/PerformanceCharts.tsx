"use client";
import { useMemo, useState } from "react";
import type { ComparisonBasis, Period } from "@/lib/engine/periods";
import { portfolioSeries, type PortfolioSummary } from "@/lib/engine/portfolio";
import { getData } from "@/lib/data";
import { TrendChart } from "../charts/charts";
import { CardHeader, Segmented } from "../ui/primitives";
import { CompareChart } from "./CompareChart";

type ChartMetric = "revenue" | "ebitda" | "ebitdaMargin" | "cfo";

export function PerformanceCharts({ s, ids, period, basis }: { s: PortfolioSummary; ids: string[]; period: Period; basis: ComparisonBasis }) {
  const [metric, setMetric] = useState<ChartMetric>("revenue");
  const series = useMemo(() => portfolioSeries(ids, period, 11), [ids, period]);
  const gb = basis === "budget" ? "yoy" : basis;
  const fmt = metric === "ebitdaMargin" ? "pct" : "usd";
  const titles: Record<ChartMetric, string> = { revenue: "Revenue", ebitda: "EBITDA", ebitdaMargin: "EBITDA margin (Σ ÷ Σ)", cfo: "Operating cash flow" };
  const excluded = ids.length - series.cohort.length;
  const data = getData();
  return (
    <div className="grid items-start gap-3 xl:grid-cols-5">
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
      <div className="xl:col-span-2">
        <CompareChart analyses={s.analyses} period={period} gb={gb} />
      </div>
    </div>
  );
}
