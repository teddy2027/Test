/**
 * Metric registry: one definition per metric used for labels, formatting,
 * favourable direction and the tooltip definitions shown throughout the UI.
 */
export type MetricFormat = "usd" | "pct" | "pp" | "ratio" | "count" | "multiple" | "usdk";
export type Direction = "higher" | "lower" | "neutral";

export interface MetricDef {
  key: string;
  label: string;
  short?: string;
  format: MetricFormat;
  direction: Direction;
  definition: string;
}

const defs: MetricDef[] = [
  { key: "revenue", label: "Revenue", format: "usd", direction: "higher", definition: "Recognized revenue for the period (subscription + services), translated to USD at monthly average rates." },
  { key: "subscriptionRevenue", label: "Subscription revenue", format: "usd", direction: "higher", definition: "Recognized subscription revenue. Not the same as ARR." },
  { key: "grossProfit", label: "Gross profit", format: "usd", direction: "higher", definition: "Revenue − COGS (direct labor + other cost of revenue)." },
  { key: "grossMargin", label: "Gross margin", short: "GM", format: "pct", direction: "higher", definition: "Gross profit ÷ Revenue." },
  { key: "ebitda", label: "EBITDA", format: "usd", direction: "higher", definition: "Gross profit − operating expenses (S&M + R&D + G&A + other opex). Management-reported, unadjusted." },
  { key: "ebitdaMargin", label: "EBITDA margin", format: "pct", direction: "higher", definition: "EBITDA ÷ Revenue." },
  { key: "cfo", label: "Operating cash flow", short: "CFO", format: "usd", direction: "higher", definition: "Cash from operations = EBITDA − cash interest − cash taxes − increase in net working capital. Reported, not derived from EBITDA." },
  { key: "cashConversion", label: "Cash conversion", format: "pct", direction: "higher", definition: "Operating cash flow ÷ EBITDA. N/A when EBITDA ≤ 0." },
  { key: "fcf", label: "Free cash flow", format: "usd", direction: "higher", definition: "Operating cash flow − capex." },
  { key: "capex", label: "Capex", format: "usd", direction: "neutral", definition: "Capital expenditure including capitalized software." },
  { key: "cogs", label: "COGS", format: "usd", direction: "lower", definition: "Cost of revenue: direct labor + other cost of revenue." },
  { key: "cogsRatio", label: "Cost of services ratio", short: "COGS / rev", format: "pct", direction: "lower", definition: "COGS ÷ Revenue (1 − gross margin)." },
  { key: "opex", label: "Operating expenses", format: "usd", direction: "lower", definition: "S&M + R&D + G&A + other operating expenses." },
  { key: "laborExpense", label: "Labor expense", format: "usd", direction: "lower", definition: "Direct labor (in COGS) + operating personnel (personnel within S&M, R&D, G&A). Mutually exclusive categories — no double counting." },
  { key: "directLabor", label: "Direct labor", format: "usd", direction: "lower", definition: "Personnel cost of delivering the service or product, recorded in COGS." },
  { key: "operatingPersonnel", label: "Operating personnel", format: "usd", direction: "lower", definition: "Personnel cost within S&M, R&D and G&A (memo split of operating expenses)." },
  { key: "laborIntensity", label: "Labor intensity", short: "Labor / rev", format: "pct", direction: "lower", definition: "Labor expense ÷ Revenue." },
  { key: "gaRatio", label: "G&A / revenue", format: "pct", direction: "lower", definition: "General & administrative expense ÷ Revenue." },
  { key: "smRatio", label: "S&M / revenue", format: "pct", direction: "lower", definition: "Sales & marketing expense ÷ Revenue." },
  { key: "rdRatio", label: "R&D / revenue", format: "pct", direction: "neutral", definition: "Research & development expense ÷ Revenue (software companies)." },
  { key: "opexRatio", label: "Opex / revenue", format: "pct", direction: "lower", definition: "Operating expenses ÷ Revenue." },
  { key: "arr", label: "ARR", format: "usd", direction: "higher", definition: "Annual recurring revenue = 12 × month-end subscription MRR. Point-in-time; not recognized revenue. Subscription businesses only." },
  { key: "customers", label: "Customers", format: "count", direction: "higher", definition: "Active subscription customers at period end." },
  { key: "employees", label: "Employees", format: "count", direction: "neutral", definition: "Headcount at period end (FTE)." },
  { key: "revenuePerEmployee", label: "Revenue per employee", format: "usdk", direction: "higher", definition: "Annualized revenue ÷ period-end headcount." },
  { key: "cashEnd", label: "Cash balance", format: "usd", direction: "higher", definition: "Cash at period end (closing FX rate for non-USD companies)." },
  { key: "revenueGrowth", label: "Revenue growth", format: "pct", direction: "higher", definition: "Current-period revenue ÷ comparable prior-period revenue − 1. Same months, same company. Flagged when the reporting perimeter changed (acquisition)." },
  { key: "organicRevenueGrowth", label: "Organic revenue growth", format: "pct", direction: "higher", definition: "Revenue growth excluding acquired entities in both periods (constant perimeter). Requires entity-level ledger data." },
  { key: "laborGrowth", label: "Labor cost growth", format: "pct", direction: "lower", definition: "Current-period labor expense ÷ comparable prior-period labor expense − 1." },
  { key: "laborGap", label: "Labor growth − revenue growth", format: "pp", direction: "lower", definition: "Labor cost growth minus revenue growth, in percentage points. Positive = labor outpacing revenue." },
  { key: "ebitdaGrowth", label: "EBITDA growth", format: "pct", direction: "higher", definition: "EBITDA growth vs comparable period. N/A when the base is ≤ 0." },
  { key: "opexGrowth", label: "Opex growth", format: "pct", direction: "lower", definition: "Operating expense growth vs comparable period." },
  { key: "arrGrowth", label: "ARR growth", format: "pct", direction: "higher", definition: "Period-end ARR ÷ comparable period-end ARR − 1." },
  { key: "cfoGrowth", label: "Operating cash flow growth", format: "pct", direction: "higher", definition: "Change in operating cash flow vs comparable period. N/A when the base is ≤ 0." },
  { key: "ebitdaMarginChange", label: "EBITDA margin change", format: "pp", direction: "higher", definition: "Difference between EBITDA margins, in percentage points." },
  { key: "grossMarginChange", label: "Gross margin change", format: "pp", direction: "higher", definition: "Difference between gross margins, in percentage points." },
  { key: "operatingLeverage", label: "Operating leverage", format: "pp", direction: "higher", definition: "Revenue growth − total operating cost growth (COGS + opex), in pp. Positive = costs growing slower than revenue. Robust to COGS/opex reclassifications." },
  { key: "revenueVsBudget", label: "Revenue vs budget", format: "pct", direction: "higher", definition: "(Actual − Budget) ÷ Budget. Positive is favorable." },
  { key: "ebitdaVsBudget", label: "EBITDA vs budget", format: "pct", direction: "higher", definition: "(Actual − Budget) ÷ |Budget|. Positive is favorable." },
  { key: "cfoVsBudget", label: "Cash flow vs budget", format: "pct", direction: "higher", definition: "(Actual − Budget) ÷ |Budget| for operating cash flow." },
];

export const METRICS: Record<string, MetricDef> = Object.fromEntries(defs.map((d) => [d.key, d]));
export function metric(key: string): MetricDef {
  const d = METRICS[key];
  if (!d) throw new Error(`Unknown metric ${key}`);
  return d;
}

/** Whether a change of a given sign is favorable for this metric (used for colouring). */
export function favorability(key: string, delta: number | null): "pos" | "neg" | "neutral" {
  if (delta === null || Math.abs(delta) < 1e-9) return "neutral";
  const dir = METRICS[key]?.direction ?? "neutral";
  if (dir === "neutral") return "neutral";
  const good = dir === "higher" ? delta > 0 : delta < 0;
  return good ? "pos" : "neg";
}
