import { describe, expect, it } from "vitest";
import { getData } from "@/lib/data";
import { analyzeCompany } from "@/lib/engine/company";
import { detectInsights, THRESHOLDS } from "@/lib/engine/insights";
import { resolvePeriod } from "@/lib/engine/periods";

const d = getData();
const Q3 = resolvePeriod({ kind: "quarter", quarter: "2026-Q3", year: 2025 });
const ins = detectInsights(d.companies, Q3);
const find = (rule: string, id: string) => ins.find((i) => i.rule === rule && i.companyId === id);

describe("insight engine", () => {
  it("flags Meridian labor growth outpacing revenue with engine-computed figures", () => {
    const i = find("labor_outpacing_revenue", "meridian-services")!;
    const a = analyzeCompany("meridian-services", Q3);
    expect(i).toBeDefined();
    expect(i.severity).toBe("high");
    expect(i.figures.find((f) => f.label === "Labor cost growth")!.value).toBe(a.yoy!.laborGrowth);
    expect(i.figures.find((f) => f.label === "Revenue growth")!.value).toBe(a.yoy!.revenueGrowth);
    expect(i.finding).toMatch(/labor costs grew 22\.\d% while revenue increased 11\.\d%/);
    expect(i.explanations.length).toBeGreaterThan(1);
  });
  it("only fires the labor rule above the configured threshold", () => {
    for (const i of ins.filter((x) => x.rule === "labor_outpacing_revenue")) {
      expect(analyzeCompany(i.companyId, Q3).yoy!.laborGap!).toBeGreaterThan(THRESHOLDS.laborGapPp);
    }
    expect(find("labor_outpacing_revenue", "horizon-advisory")).toBeUndefined(); // gap ≈ 5.5 pp < 8 pp
  });
  it("detects margin contraction > 3 pp", () => {
    expect(find("margin_contraction", "meridian-services")).toBeDefined();
    expect(find("margin_contraction", "horizon-advisory")).toBeDefined();
    for (const i of ins.filter((x) => x.rule === "margin_contraction")) expect(analyzeCompany(i.companyId, Q3).yoy!.ebitdaMarginChange!).toBeLessThan(-THRESHOLDS.marginContractionPp);
  });
  it("detects persistent revenue shortfall vs budget (Crestpoint)", () => {
    const i = find("revenue_budget_miss", "crestpoint-consulting")!;
    expect(i.title).toMatch(/persistently/);
    expect(analyzeCompany("crestpoint-consulting", Q3).budget.revenueVarPct!).toBeLessThan(-THRESHOLDS.revenueBudgetMissPct);
  });
  it("detects weak cash conversion despite strong EBITDA (Summit)", () => {
    const i = find("weak_cash_conversion", "summit-compliance")!;
    expect(i).toBeDefined();
    expect(i.figures.find((f) => f.label === "Cash conversion")!.value!).toBeLessThan(THRESHOLDS.cashConversionFloor);
  });
  it("detects the Summit cost reclassification from the numbers", () => {
    expect(find("metric_discontinuity", "summit-compliance")).toBeDefined();
  });
  it("flags acquisition-distorted growth and reporting gaps", () => {
    expect(find("acquisition_distortion", "northstar-systems")!.finding).toMatch(/organic/i);
    expect(find("acquisition_distortion", "harbor-operations")!.finding).toMatch(/cannot be determined/);
    expect(find("missing_submission", "apex-workforce")!.severity).toBe("high");
    expect(find("partial_submission", "bluepeak-solutions")).toBeDefined();
    expect(find("stale_data", "apex-workforce")).toBeDefined();
  });
  it("surfaces positive outliers (Beacon operating leverage)", () => {
    expect(find("margin_expansion", "beacon-analytics")!.severity).toBe("positive");
  });
  it("never emits financial findings for companies without complete data", () => {
    for (const i of ins.filter((x) => ["apex-workforce", "bluepeak-solutions"].includes(x.companyId))) expect(i.category).toBe("Reporting Quality");
  });
  it("orders by severity", () => {
    const rank = { high: 0, medium: 1, low: 2, positive: 3 };
    for (let k = 1; k < ins.length; k++) expect(rank[ins[k].severity]).toBeGreaterThanOrEqual(rank[ins[k - 1].severity]);
  });
});
