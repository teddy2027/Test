import type { N } from "./core";
import type { CompanyAnalysis } from "./company";
import type { MetricFormat } from "./metrics";

export interface CompareMetric {
  key: string;
  label: string;
  format: MetricFormat;
  group: "Scale" | "Growth" | "Profitability" | "Cost efficiency" | "Cash flow" | "Budget" | "SaaS";
  normalized: boolean;
  get: (a: CompanyAnalysis, basis: "prior" | "yoy") => N;
}

const cmp = (a: CompanyAnalysis, b: "prior" | "yoy") => (b === "prior" ? a.prior : a.yoy);

/** Every metric used by the comparison and benchmarking workspaces, read from the analytics engine. */
export const COMPARE_METRICS: CompareMetric[] = [
  { key: "revenue", label: "Revenue", format: "usd", group: "Scale", normalized: false, get: (a) => a.current.metrics.revenue },
  { key: "ebitda", label: "EBITDA", format: "usd", group: "Scale", normalized: false, get: (a) => a.current.metrics.ebitda },
  { key: "cfo", label: "Operating cash flow", format: "usd", group: "Scale", normalized: false, get: (a) => a.current.metrics.cfo },
  { key: "revenueGrowth", label: "Revenue growth", format: "pct", group: "Growth", normalized: true, get: (a, b) => cmp(a, b)?.revenueGrowth ?? null },
  { key: "organicRevenueGrowth", label: "Organic revenue growth", format: "pct", group: "Growth", normalized: true, get: (a, b) => (cmp(a, b)?.organicAvailable ? cmp(a, b)!.organicRevenueGrowth : null) },
  { key: "arrGrowth", label: "ARR growth", format: "pct", group: "SaaS", normalized: true, get: (a, b) => cmp(a, b)?.arrGrowth ?? null },
  { key: "arr", label: "ARR", format: "usd", group: "SaaS", normalized: false, get: (a) => a.current.metrics.arr },
  { key: "ebitdaMargin", label: "EBITDA margin", format: "pct", group: "Profitability", normalized: true, get: (a) => a.current.metrics.ebitdaMargin },
  { key: "ebitdaMarginChange", label: "EBITDA margin change", format: "pp", group: "Profitability", normalized: true, get: (a, b) => cmp(a, b)?.ebitdaMarginChange ?? null },
  { key: "grossMargin", label: "Gross margin", format: "pct", group: "Profitability", normalized: true, get: (a) => a.current.metrics.grossMargin },
  { key: "operatingLeverage", label: "Operating leverage", format: "pp", group: "Profitability", normalized: true, get: (a, b) => cmp(a, b)?.operatingLeverage ?? null },
  { key: "laborGrowth", label: "Labor cost growth", format: "pct", group: "Cost efficiency", normalized: true, get: (a, b) => cmp(a, b)?.laborGrowth ?? null },
  { key: "laborGap", label: "Labor growth − revenue growth", format: "pp", group: "Cost efficiency", normalized: true, get: (a, b) => cmp(a, b)?.laborGap ?? null },
  { key: "laborIntensity", label: "Labor intensity", format: "pct", group: "Cost efficiency", normalized: true, get: (a) => a.current.metrics.laborIntensity },
  { key: "cogsRatio", label: "Cost of services ratio", format: "pct", group: "Cost efficiency", normalized: true, get: (a) => a.current.metrics.cogsRatio },
  { key: "gaRatio", label: "G&A / revenue", format: "pct", group: "Cost efficiency", normalized: true, get: (a) => a.current.metrics.gaRatio },
  { key: "smRatio", label: "S&M / revenue", format: "pct", group: "Cost efficiency", normalized: true, get: (a) => a.current.metrics.smRatio },
  { key: "revenuePerEmployee", label: "Revenue per employee", format: "usdk", group: "Cost efficiency", normalized: true, get: (a) => a.current.metrics.revenuePerEmployee },
  { key: "cashConversion", label: "Cash conversion", format: "pct", group: "Cash flow", normalized: true, get: (a) => a.current.metrics.cashConversion },
  { key: "revenueVsBudget", label: "Revenue vs budget", format: "pct", group: "Budget", normalized: true, get: (a) => a.budget.revenueVarPct },
  { key: "ebitdaVsBudget", label: "EBITDA vs budget", format: "pct", group: "Budget", normalized: true, get: (a) => a.budget.ebitdaVarPct },
];

export const CM: Record<string, CompareMetric> = Object.fromEntries(COMPARE_METRICS.map((m) => [m.key, m]));
