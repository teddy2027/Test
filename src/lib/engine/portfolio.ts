/**
 * Portfolio aggregation.
 *
 * Two families of statistics are kept strictly separate and always labelled:
 *  • Aggregate (portfolio-weighted): Σ current ÷ Σ comparison over the SAME eligible
 *    cohort, e.g. portfolio EBITDA margin = Σ EBITDA ÷ Σ revenue.
 *  • Average company: arithmetic mean of each eligible company's own ratio/growth.
 *
 * Sums are management-view aggregates of operating companies' results — not
 * GAAP-consolidated financial statements of the fund.
 */
import { getData, type IndexedDataset } from "../data";
import { growth, mean, median, ppChange, safeDiv, type N } from "./core";
import { analyzeCompany, comparisonFor, type CompanyAnalysis, type Metrics } from "./company";
import { comparisonPeriod, trendQuarters, type ComparisonBasis, type Period } from "./periods";

export type AggregationMode = "aggregate" | "average";

export interface Coverage {
  included: number;
  total: number;
  excluded: { companyId: string; reason: string }[];
}

export interface KpiComparison {
  basis: ComparisonBasis;
  available: boolean;
  /** Aggregate change: % for amounts, fraction-point difference for ratios. */
  aggregateChange: N;
  averageChange: N;
  medianChange: N;
  currentOnCohort: N;
  comparisonOnCohort: N;
  coverage: Coverage;
  acquisitionAffected: string[];
  note?: string;
}

export interface KpiSummary {
  key: "revenue" | "ebitda" | "ebitdaMargin" | "cfo" | "revenueGrowth" | "grossMargin";
  /** Aggregate (Σ) value for ratios/amounts across companies with complete current data. */
  aggregate: N;
  /** Simple average of company values (ratios) — null for amounts. */
  average: N;
  median: N;
  coverage: Coverage;
  comparisons: Record<ComparisonBasis, KpiComparison>;
  trend: { label: string; value: N }[];
}

export interface PortfolioSummary {
  period: Period;
  analyses: CompanyAnalysis[];
  reporting: { complete: number; partial: number; missing: number; total: number };
  kpis: Record<KpiSummary["key"], KpiSummary>;
  /** Growth KPIs: aggregate vs average company growth on the same eligible cohort. */
  revenueGrowth: Record<"prior" | "yoy", { aggregate: N; average: N; median: N; coverage: Coverage; acquisitionAffected: string[] }>;
  budgetCoverage: Coverage;
}

type AmountKey = "revenue" | "ebitda" | "cfo" | "grossProfit" | "laborExpense" | "opex" | "generalAdmin";
type RatioKey = "ebitdaMargin" | "grossMargin";

const RATIO_PARTS: Record<RatioKey, [AmountKey, AmountKey]> = {
  ebitdaMargin: ["ebitda", "revenue"],
  grossMargin: ["grossProfit", "revenue"],
};

function reasonFor(a: CompanyAnalysis, field: keyof Metrics): string {
  if (a.current.status === "missing") return "No data submitted for the period";
  if (a.current.status === "partial") return `Partial period (${a.current.monthsAvailable}/${a.current.monthsExpected} months)`;
  if (a.current.metrics[field] === null) return "Metric not reported";
  return "Comparison period incomplete";
}

export function sumField(analyses: CompanyAnalysis[], field: AmountKey, side: "current" | "prior" | "yoy" = "current"): N {
  let s = 0;
  for (const a of analyses) {
    const m = side === "current" ? a.current.metrics : side === "prior" ? a.prior?.base.metrics : a.yoy?.base.metrics;
    const v = m?.[field] ?? null;
    if (v === null) return null;
    s += v;
  }
  return s;
}

/** Companies with complete current data where the metric exists. */
function currentCohort(analyses: CompanyAnalysis[], fields: (keyof Metrics)[]): { cohort: CompanyAnalysis[]; coverage: Coverage } {
  const cohort: CompanyAnalysis[] = [];
  const excluded: Coverage["excluded"] = [];
  for (const a of analyses) {
    const bad = fields.find((f) => a.current.status !== "complete" || a.current.metrics[f] === null);
    if (bad) excluded.push({ companyId: a.company.id, reason: reasonFor(a, bad) });
    else cohort.push(a);
  }
  return { cohort, coverage: { included: cohort.length, total: analyses.length, excluded } };
}

/** Companies with complete current AND comparison data for the fields (like-for-like cohort). */
function pairedCohort(analyses: CompanyAnalysis[], fields: (keyof Metrics)[], basis: "prior" | "yoy") {
  const cohort: CompanyAnalysis[] = [];
  const excluded: Coverage["excluded"] = [];
  for (const a of analyses) {
    const cmp = basis === "prior" ? a.prior : a.yoy;
    const badCur = fields.find((f) => a.current.status !== "complete" || a.current.metrics[f] === null);
    if (badCur) {
      excluded.push({ companyId: a.company.id, reason: reasonFor(a, badCur) });
      continue;
    }
    if (!cmp || cmp.base.status !== "complete" || fields.some((f) => cmp.base.metrics[f] === null)) {
      excluded.push({ companyId: a.company.id, reason: cmp ? "Comparison period incomplete" : "No comparison period in dataset" });
      continue;
    }
    // A non-positive base stays in Σ-based aggregates; growth() returns null for it, so averages skip it.
    cohort.push(a);
  }
  return { cohort, coverage: { included: cohort.length, total: analyses.length, excluded } };
}

function budgetCohort(analyses: CompanyAnalysis[], budgetField: "revenue" | "ebitda" | "cfo", actualField: AmountKey) {
  const cohort: CompanyAnalysis[] = [];
  const excluded: Coverage["excluded"] = [];
  for (const a of analyses) {
    if (a.current.status !== "complete" || a.current.metrics[actualField] === null) excluded.push({ companyId: a.company.id, reason: reasonFor(a, actualField) });
    else if (a.budget.status !== "complete") excluded.push({ companyId: a.company.id, reason: "No budget for period" });
    else if (a.budget[budgetField] === null) excluded.push({ companyId: a.company.id, reason: "Budget line not provided" });
    else cohort.push(a);
  }
  return { cohort, coverage: { included: cohort.length, total: analyses.length, excluded } };
}

function amountKpi(key: "revenue" | "ebitda" | "cfo", analyses: CompanyAnalysis[], p: Period, data: IndexedDataset): KpiSummary {
  const field: AmountKey = key;
  const { cohort, coverage } = currentCohort(analyses, [field]);
  const total = cohort.reduce((s, a) => s + (a.current.metrics[field] as number), 0);
  const comparisons = {} as Record<ComparisonBasis, KpiComparison>;
  for (const basis of ["prior", "yoy"] as const) {
    const pc = pairedCohort(analyses, [field], basis);
    const cur = pc.cohort.reduce((s, a) => s + (a.current.metrics[field] as number), 0);
    const prev = pc.cohort.reduce((s, a) => s + (comparisonFor(a, basis)!.base.metrics[field] as number), 0);
    const changes = pc.cohort.map((a) => growth(a.current.metrics[field], comparisonFor(a, basis)!.base.metrics[field]));
    comparisons[basis] = {
      basis,
      available: pc.cohort.length > 0,
      aggregateChange: pc.cohort.length ? growth(cur, prev) : null,
      averageChange: mean(changes),
      medianChange: median(changes),
      currentOnCohort: pc.cohort.length ? cur : null,
      comparisonOnCohort: pc.cohort.length ? prev : null,
      coverage: pc.coverage,
      acquisitionAffected: pc.cohort.filter((a) => comparisonFor(a, basis)!.acquisitions.length > 0).map((a) => a.company.id),
    };
  }
  const bField = key === "revenue" ? "revenue" : key === "ebitda" ? "ebitda" : "cfo";
  const bc = budgetCohort(analyses, bField, field);
  const act = bc.cohort.reduce((s, a) => s + (a.current.metrics[field] as number), 0);
  const bud = bc.cohort.reduce((s, a) => s + (a.budget[bField] as number), 0);
  comparisons.budget = {
    basis: "budget",
    available: bc.cohort.length > 0,
    aggregateChange: bc.cohort.length && bud !== 0 ? (act - bud) / Math.abs(bud) : null,
    averageChange: mean(bc.cohort.map((a) => (bField === "revenue" ? a.budget.revenueVarPct : bField === "ebitda" ? a.budget.ebitdaVarPct : a.budget.cfoVarPct))),
    medianChange: median(bc.cohort.map((a) => (bField === "revenue" ? a.budget.revenueVarPct : bField === "ebitda" ? a.budget.ebitdaVarPct : a.budget.cfoVarPct))),
    currentOnCohort: bc.cohort.length ? act : null,
    comparisonOnCohort: bc.cohort.length ? bud : null,
    coverage: bc.coverage,
    acquisitionAffected: bc.cohort.filter((a) => a.budget.acquisitions.length > 0).map((a) => a.company.id),
  };
  return {
    key,
    aggregate: cohort.length ? total : null,
    average: null,
    median: null,
    coverage,
    comparisons,
    trend: trendFor(cohort.map((a) => a.company.id), p, (ms) => sumOf(ms, field), data),
  };
}

function ratioKpi(key: RatioKey, analyses: CompanyAnalysis[], p: Period, data: IndexedDataset): KpiSummary {
  const [num, den] = RATIO_PARTS[key];
  const { cohort, coverage } = currentCohort(analyses, [num, den]);
  const sn = cohort.reduce((s, a) => s + (a.current.metrics[num] as number), 0);
  const sd = cohort.reduce((s, a) => s + (a.current.metrics[den] as number), 0);
  const comparisons = {} as Record<ComparisonBasis, KpiComparison>;
  for (const basis of ["prior", "yoy"] as const) {
    const pc = pairedCohort(analyses, [num, den], basis);
    const cn = pc.cohort.reduce((s, a) => s + (a.current.metrics[num] as number), 0);
    const cd = pc.cohort.reduce((s, a) => s + (a.current.metrics[den] as number), 0);
    const pn = pc.cohort.reduce((s, a) => s + (comparisonFor(a, basis)!.base.metrics[num] as number), 0);
    const pd = pc.cohort.reduce((s, a) => s + (comparisonFor(a, basis)!.base.metrics[den] as number), 0);
    const changes = pc.cohort.map((a) => ppChange(a.current.metrics[key], comparisonFor(a, basis)!.base.metrics[key]));
    comparisons[basis] = {
      basis,
      available: pc.cohort.length > 0,
      aggregateChange: pc.cohort.length ? ppChange(safeDiv(cn, cd), safeDiv(pn, pd)) : null,
      averageChange: mean(changes),
      medianChange: median(changes),
      currentOnCohort: safeDiv(cn, cd),
      comparisonOnCohort: safeDiv(pn, pd),
      coverage: pc.coverage,
      acquisitionAffected: pc.cohort.filter((a) => comparisonFor(a, basis)!.acquisitions.length > 0).map((a) => a.company.id),
    };
  }
  // Budget margin comparison only defined for EBITDA margin.
  const bc = budgetCohort(analyses, "ebitda", "ebitda");
  const ar = bc.cohort.reduce((s, a) => s + (a.current.metrics[num] as number), 0);
  const arv = bc.cohort.reduce((s, a) => s + (a.current.metrics[den] as number), 0);
  const br = bc.cohort.reduce((s, a) => s + ((key === "ebitdaMargin" ? a.budget.ebitda : a.budget.revenue! - a.budget.cogs!) as number), 0);
  const brv = bc.cohort.reduce((s, a) => s + (a.budget.revenue as number), 0);
  comparisons.budget = {
    basis: "budget",
    available: bc.cohort.length > 0,
    aggregateChange: bc.cohort.length ? ppChange(safeDiv(ar, arv), safeDiv(br, brv)) : null,
    averageChange: mean(bc.cohort.map((a) => ppChange(a.current.metrics[key], key === "ebitdaMargin" ? a.budget.ebitdaMargin : safeDiv(a.budget.revenue! - a.budget.cogs!, a.budget.revenue)))),
    medianChange: null,
    currentOnCohort: safeDiv(ar, arv),
    comparisonOnCohort: safeDiv(br, brv),
    coverage: bc.coverage,
    acquisitionAffected: bc.cohort.filter((a) => a.budget.acquisitions.length > 0).map((a) => a.company.id),
  };
  const values = cohort.map((a) => a.current.metrics[key]);
  return {
    key,
    aggregate: safeDiv(sn, sd),
    average: mean(values),
    median: median(values),
    coverage,
    comparisons,
    trend: trendFor(cohort.map((a) => a.company.id), p, (ms) => safeDiv(sumOf(ms, num), sumOf(ms, den)), data),
  };
}

function sumOf(ms: Metrics[], f: keyof Metrics): N {
  let s = 0;
  for (const m of ms) {
    const v = m[f];
    if (v === null) return null;
    s += v as number;
  }
  return s;
}

/** Quarterly trend for a FIXED cohort (companies with complete current data) so the line is not distorted by reporting gaps. */
function trendFor(ids: string[], p: Period, fn: (ms: Metrics[]) => N, data: IndexedDataset) {
  return trendQuarters(p.end, 8).map((q) => {
    const ms = ids.map((id) => analyzeCompany(id, q, data).current);
    const ok = ms.every((m) => m.status === "complete");
    return { label: q.label, value: ok && ids.length ? fn(ms.map((m) => m.metrics)) : null };
  });
}

export function portfolioSummary(companyIds: string[], p: Period, data: IndexedDataset = getData()): PortfolioSummary {
  const analyses = companyIds.map((id) => analyzeCompany(id, p, data));
  const reporting = {
    complete: analyses.filter((a) => a.current.status === "complete").length,
    partial: analyses.filter((a) => a.current.status === "partial").length,
    missing: analyses.filter((a) => a.current.status === "missing").length,
    total: analyses.length,
  };
  const revenue = amountKpi("revenue", analyses, p, data);
  const growthBlock = (basis: "prior" | "yoy") => {
    const pc = pairedCohort(analyses, ["revenue"], basis);
    const g = pc.cohort.map((a) => comparisonFor(a, basis)!.revenueGrowth);
    return {
      aggregate: revenue.comparisons[basis].aggregateChange,
      average: mean(g),
      median: median(g),
      coverage: pc.coverage,
      acquisitionAffected: revenue.comparisons[basis].acquisitionAffected,
    };
  };
  const budgetCoverage = budgetCohort(analyses, "revenue", "revenue").coverage;
  return {
    period: p,
    analyses,
    reporting,
    kpis: {
      revenue,
      ebitda: amountKpi("ebitda", analyses, p, data),
      ebitdaMargin: ratioKpi("ebitdaMargin", analyses, p, data),
      grossMargin: ratioKpi("grossMargin", analyses, p, data),
      cfo: amountKpi("cfo", analyses, p, data),
      revenueGrowth: revenue,
    },
    revenueGrowth: { prior: growthBlock("prior"), yoy: growthBlock("yoy") },
    budgetCoverage,
  };
}

/** Quarterly portfolio series for the overview chart (fixed cohort, Σ-based). */
export function portfolioSeries(companyIds: string[], p: Period, count = 11, data: IndexedDataset = getData()) {
  const qs = trendQuarters(p.end, count);
  const cohort = companyIds.filter((id) => analyzeCompany(id, p, data).current.status === "complete");
  return {
    cohort,
    points: qs.map((q) => {
      const ms = cohort.map((id) => analyzeCompany(id, q, data).current);
      const ok = cohort.length > 0 && ms.every((m) => m.status === "complete");
      const s = (f: keyof Metrics) => (ok ? sumOf(ms.map((m) => m.metrics), f) : null);
      const prevQ = comparisonPeriod(q, "yoy");
      const prevRev = prevQ && ok ? sumOf(cohort.map((id) => analyzeCompany(id, prevQ, data).current.metrics), "revenue") : null;
      return {
        label: q.label,
        revenue: s("revenue"),
        ebitda: s("ebitda"),
        cfo: s("cfo"),
        grossProfit: s("grossProfit"),
        ebitdaMargin: safeDiv(s("ebitda"), s("revenue")),
        grossMargin: safeDiv(s("grossProfit"), s("revenue")),
        revenueYoy: growth(s("revenue"), prevRev),
      };
    }),
  };
}
