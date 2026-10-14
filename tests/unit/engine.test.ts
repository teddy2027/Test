import { describe, expect, it } from "vitest";
import { getData, type MonthlyFinancial } from "@/lib/data";
import { analyzeCompany, periodValues } from "@/lib/engine/company";
import { applyFilters, EMPTY_FILTERS } from "@/lib/engine/filters";
import { makePeriod, resolvePeriod } from "@/lib/engine/periods";
import { portfolioSummary } from "@/lib/engine/portfolio";
import { buildBenchmark } from "@/lib/engine/benchmark";
import { mean } from "@/lib/engine/core";

const d = getData();
const Q3 = resolvePeriod({ kind: "quarter", quarter: "2026-Q3", year: 2025 });
const sumMonths = (id: string, a: number, b: number, f: (r: MonthlyFinancial) => number) => {
  let s = 0;
  for (let m = a; m <= b; m++) s += f(d.monthlyByCompany.get(id)![m]!);
  return s;
};

describe("company metrics", () => {
  const a = analyzeCompany("meridian-services", Q3);
  const m = a.current.metrics;
  it("sums monthly records into period values", () => {
    expect(m.revenue).toBeCloseTo(sumMonths("meridian-services", 30, 32, (r) => r.revenue), 9);
  });
  it("gross profit = revenue − COGS and EBITDA = GP − opex", () => {
    expect(m.grossProfit!).toBeCloseTo(m.revenue! - m.cogs!, 9);
    expect(m.ebitda!).toBeCloseTo(m.grossProfit! - m.opex!, 9);
  });
  it("margins are ratios of the same-period values", () => {
    expect(m.grossMargin!).toBeCloseTo(m.grossProfit! / m.revenue!, 12);
    expect(m.ebitdaMargin!).toBeCloseTo(m.ebitda! / m.revenue!, 12);
    expect(m.laborIntensity!).toBeCloseTo(m.laborExpense! / m.revenue!, 12);
  });
  it("labor = direct labor + operating personnel, without double counting", () => {
    expect(m.laborExpense!).toBeCloseTo(m.directLabor! + m.operatingPersonnel!, 9);
    expect(m.laborExpense!).toBeLessThan(m.cogs! + m.opex!);
  });
  it("growth uses matching periods (Q3 2026 vs Q3 2025)", () => {
    const cur = sumMonths("meridian-services", 30, 32, (r) => r.revenue);
    const prev = sumMonths("meridian-services", 18, 20, (r) => r.revenue);
    expect(a.yoy!.revenueGrowth!).toBeCloseTo(cur / prev - 1, 12);
    const lc = sumMonths("meridian-services", 30, 32, (r) => r.directLabor! + r.operatingPersonnel!);
    const lp = sumMonths("meridian-services", 18, 20, (r) => r.directLabor! + r.operatingPersonnel!);
    expect(a.yoy!.laborGrowth!).toBeCloseTo(lc / lp - 1, 12);
    expect(a.yoy!.laborGap!).toBeCloseTo(a.yoy!.laborGrowth! - a.yoy!.revenueGrowth!, 12);
  });
  it("tells the Meridian story from the numbers: labor ≈ 22% vs revenue ≈ 11%", () => {
    expect(a.yoy!.laborGrowth!).toBeGreaterThan(0.2);
    expect(a.yoy!.revenueGrowth!).toBeGreaterThan(0.1);
    expect(a.yoy!.revenueGrowth!).toBeLessThan(0.13);
    expect(a.yoy!.laborGap!).toBeGreaterThan(0.08);
    expect(a.yoy!.ebitdaMarginChange!).toBeLessThan(-0.05);
  });
  it("budget variance = actual − budget with % on |budget|", () => {
    const b = a.budget;
    expect(b.status).toBe("complete");
    expect(b.ebitdaVar!).toBeCloseTo(m.ebitda! - b.ebitda!, 9);
    expect(b.ebitdaVarPct!).toBeCloseTo((m.ebitda! - b.ebitda!) / Math.abs(b.ebitda!), 12);
  });
  it("cash flow is the reported CFO, not EBITDA; conversion = CFO ÷ EBITDA", () => {
    expect(m.cfo).not.toBeCloseTo(m.ebitda!, 3);
    expect(m.cashConversion!).toBeCloseTo(m.cfo! / m.ebitda!, 12);
  });
});

describe("missing data behaviour", () => {
  it("returns N/A (null) for missing and partial periods, never annualises", () => {
    const apex = analyzeCompany("apex-workforce", Q3);
    expect(apex.current.status).toBe("missing");
    expect(apex.current.metrics.revenue).toBeNull();
    const bp = analyzeCompany("bluepeak-solutions", Q3);
    expect(bp.current.status).toBe("partial");
    expect(bp.current.monthsAvailable).toBe(2);
    expect(bp.current.metrics.revenue).toBeNull();
  });
  it("handles missing budgets and missing labor split", () => {
    const q2 = resolvePeriod({ kind: "quarter", quarter: "2026-Q2", year: 2025 });
    const bp = analyzeCompany("bluepeak-solutions", q2);
    expect(bp.current.status).toBe("complete");
    expect(bp.budget.status).toBe("missing");
    expect(bp.budget.revenueVarPct).toBeNull();
    expect(bp.current.metrics.laborExpense).toBeNull();
    expect(bp.yoy!.laborGrowth).toBeNull();
    expect(analyzeCompany("crestpoint-consulting", Q3).budget.cfo).toBeNull();
  });
  it("has no prior period for the first quarter", () => {
    const q1 = resolvePeriod({ kind: "quarter", quarter: "2024-Q1", year: 2024 });
    const a = analyzeCompany("atlas-software", q1);
    expect(a.yoy).toBeNull();
    expect(a.prior).toBeNull();
  });
  it("ARR is N/A for services businesses", () => {
    expect(analyzeCompany("meridian-services", Q3).current.metrics.arr).toBeNull();
    expect(analyzeCompany("atlas-software", Q3).current.metrics.arr).toBeGreaterThan(0);
  });
});

describe("acquisitions and comparable-period caveats", () => {
  it("flags Northstar (Vantage closed May 2026) and computes organic growth from entity ledgers", () => {
    const a = analyzeCompany("northstar-systems", Q3);
    expect(a.yoy!.acquisitions.map((t) => t.target)).toEqual(["Vantage Data Systems"]);
    expect(a.yoy!.organicAvailable).toBe(true);
    const ent = d.entityMonthlyByCompany.get("northstar-systems")!.filter((r) => r.entityId.endsWith("-a1"));
    const acq = (s: number, e: number) => ent.filter((r) => r.month >= s && r.month <= e).reduce((x, r) => x + r.externalRevenue, 0);
    const cur = a.current.metrics.revenue! - acq(30, 32);
    const prev = a.yoy!.base.metrics.revenue! - acq(18, 20);
    expect(acq(18, 20)).toBe(0);
    expect(a.yoy!.organicRevenueGrowth!).toBeCloseTo(cur / prev - 1, 12);
    expect(a.yoy!.organicRevenueGrowth!).toBeLessThan(a.yoy!.revenueGrowth!);
  });
  it("does not compute organic growth for uploaded companies (Harbor)", () => {
    const a = analyzeCompany("harbor-operations", Q3);
    expect(a.yoy!.acquisitions).toHaveLength(1);
    expect(a.yoy!.organicAvailable).toBe(false);
    expect(a.yoy!.organicRevenueGrowth).toBeNull();
  });
  it("treats Meridian Q3 2026 vs Q3 2025 as constant-perimeter, but TTM as affected", () => {
    expect(analyzeCompany("meridian-services", Q3).yoy!.acquisitions).toHaveLength(0);
    const ttm = makePeriod("ttm", 21, 32);
    expect(analyzeCompany("meridian-services", ttm).yoy!.acquisitions).toHaveLength(1);
  });
  it("flags budgets that exclude an in-year acquisition", () => {
    expect(analyzeCompany("northstar-systems", Q3).budget.acquisitions).toHaveLength(1);
    expect(analyzeCompany("atlas-software", Q3).budget.acquisitions).toHaveLength(0);
  });
});

describe("portfolio aggregation", () => {
  const all = d.companies.map((c) => c.id);
  const s = portfolioSummary(all, Q3);
  it("reports coverage: 10 of 12 complete", () => {
    expect(s.reporting).toEqual({ complete: 10, partial: 1, missing: 1, total: 12 });
    expect(s.kpis.revenue.coverage.included).toBe(10);
  });
  it("portfolio revenue equals the sum of complete companies", () => {
    const manual = s.analyses.filter((a) => a.current.status === "complete").reduce((x, a) => x + a.current.metrics.revenue!, 0);
    expect(s.kpis.revenue.aggregate!).toBeCloseTo(manual, 9);
  });
  it("aggregate growth = Σcurrent ÷ Σprior over the same cohort; average growth = mean of company growth", () => {
    const cohort = s.analyses.filter((a) => a.current.status === "complete" && a.yoy?.base.status === "complete");
    const cur = cohort.reduce((x, a) => x + a.current.metrics.revenue!, 0);
    const prev = cohort.reduce((x, a) => x + a.yoy!.base.metrics.revenue!, 0);
    expect(s.revenueGrowth.yoy.aggregate!).toBeCloseTo(cur / prev - 1, 12);
    expect(s.revenueGrowth.yoy.average!).toBeCloseTo(mean(cohort.map((a) => a.yoy!.revenueGrowth))!, 12);
    expect(s.revenueGrowth.yoy.aggregate).not.toBeCloseTo(s.revenueGrowth.yoy.average!, 4);
    expect(s.revenueGrowth.yoy.coverage.included).toBe(10);
  });
  it("portfolio EBITDA margin = ΣEBITDA ÷ Σrevenue; average margin = mean of company margins", () => {
    const c = s.analyses.filter((a) => a.current.status === "complete");
    const w = c.reduce((x, a) => x + a.current.metrics.ebitda!, 0) / c.reduce((x, a) => x + a.current.metrics.revenue!, 0);
    expect(s.kpis.ebitdaMargin.aggregate!).toBeCloseTo(w, 12);
    expect(s.kpis.ebitdaMargin.average!).toBeCloseTo(mean(c.map((a) => a.current.metrics.ebitdaMargin))!, 12);
  });
  it("budget comparison uses only companies with a complete budget", () => {
    expect(s.budgetCoverage.included).toBe(10);
    expect(s.budgetCoverage.excluded.map((e) => e.companyId).sort()).toEqual(["apex-workforce", "bluepeak-solutions"]);
  });
  it("fund-level totals equal the sum of their companies (management view)", () => {
    const f2 = portfolioSummary(applyFilters(d.companies, { ...EMPTY_FILTERS, funds: ["fund-ii"] }).map((c) => c.id), Q3);
    const f3 = portfolioSummary(applyFilters(d.companies, { ...EMPTY_FILTERS, funds: ["fund-iii"] }).map((c) => c.id), Q3);
    expect(f2.kpis.revenue.aggregate! + f3.kpis.revenue.aggregate!).toBeCloseTo(s.kpis.revenue.aggregate!, 9);
    expect(f2.kpis.ebitda.aggregate! + f3.kpis.ebitda.aggregate!).toBeCloseTo(s.kpis.ebitda.aggregate!, 9);
  });
  it("respects sector filters", () => {
    const svc = applyFilters(d.companies, { ...EMPTY_FILTERS, sectors: ["Business Services"] });
    expect(svc).toHaveLength(7);
    expect(svc.every((c) => c.sector === "Business Services")).toBe(true);
  });
  it("period values for a month equal the stored record", () => {
    const p = makePeriod("quarter", 5, 5);
    expect(periodValues("cedar-cloud", p).metrics.revenue).toBe(d.monthlyByCompany.get("cedar-cloud")![5]!.revenue);
  });
});

describe("peer benchmarks", () => {
  it("excludes the subject and ineligible companies from its own cohort", () => {
    const b = buildBenchmark("meridian-services", "sector", d.companies, Q3);
    const ids = b.peers.map((p) => p.company.id);
    expect(ids).not.toContain("meridian-services");
    expect(ids.sort()).toEqual(["crestpoint-consulting", "harbor-operations", "horizon-advisory", "summit-compliance"]);
    expect(b.ineligible.map((x) => x.company.id).sort()).toEqual(["apex-workforce", "bluepeak-solutions"]);
    expect(b.warnings.some((w) => w.startsWith("Small cohort"))).toBe(true);
    expect(b.meaningful).toBe(true);
  });
  it("marks cohorts below three peers as not meaningful", () => {
    const b = buildBenchmark("lattice-technologies", "vintage", d.companies, Q3);
    expect(b.peers.length).toBeLessThan(3);
    expect(b.meaningful).toBe(false);
    expect(b.warnings[0]).toMatch(/too small|No eligible peers/);
  });
  it("warns about heterogeneous cohorts", () => {
    const b = buildBenchmark("meridian-services", "fund", d.companies, Q3);
    expect(b.warnings.some((w) => w.includes("mixes software and services"))).toBe(true);
  });
});
