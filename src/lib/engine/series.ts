import { getData, type IndexedDataset } from "../data";
import { monthShortLabel } from "../data/calendar";
import { analyzeCompany } from "./company";
import { makePeriod, trendQuarters } from "./periods";

export type Granularity = "month" | "quarter" | "year";

/** Quarterly history for one company ending at the selected period: values, ratios and YoY growth, all from the engine. */
export function companyQuarterly(companyId: string, endMonth: number, count = 11, data: IndexedDataset = getData()) {
  return trendQuarters(endMonth, count).map((q) => {
    const a = analyzeCompany(companyId, q, data);
    const m = a.current.metrics;
    return {
      label: q.label.replace(" 20", " ’"),
      fullLabel: q.label,
      period: q,
      status: a.current.status,
      ...m,
      revenueYoy: a.yoy?.revenueGrowth ?? null,
      laborYoy: a.yoy?.laborGrowth ?? null,
      budgetRevenue: a.budget.revenue,
      budgetEbitda: a.budget.ebitda,
      revenueVsBudget: a.budget.revenueVarPct,
      ebitdaVsBudget: a.budget.ebitdaVarPct,
      acquisitions: a.yoy?.acquisitions.length ?? 0,
    };
  });
}

/** Monthly / quarterly / annual rows for statements. Partial periods are flagged, never annualised. */
export function companyStatementPeriods(companyId: string, endMonth: number, g: Granularity, data: IndexedDataset = getData()) {
  if (g === "month") {
    const out = [];
    for (let m = Math.max(0, endMonth - 11); m <= endMonth; m++) {
      const p = makePeriod("quarter", m, m);
      out.push({ label: monthShortLabel(m), period: { ...p, label: monthShortLabel(m), kind: "quarter" as const }, a: analyzeCompany(companyId, { ...p, label: monthShortLabel(m) }, data) });
    }
    return out;
  }
  if (g === "quarter") return trendQuarters(endMonth, 8).map((q) => ({ label: q.label, period: q, a: analyzeCompany(companyId, q, data) }));
  const years = [2024, 2025];
  const out = years.map((y) => {
    const p = makePeriod("fy", (y - 2024) * 12, (y - 2024) * 12 + 11);
    return { label: `FY ${y}`, period: p, a: analyzeCompany(companyId, p, data) };
  });
  const ytdEnd = Math.min(endMonth, 32);
  const ytdStart = ytdEnd - (ytdEnd % 12);
  if (ytdEnd % 12 !== 11) {
    const p = makePeriod("ytd", ytdStart, ytdEnd);
    out.push({ label: p.label, period: p, a: analyzeCompany(companyId, p, data) });
  }
  return out;
}
