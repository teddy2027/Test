import { describe, expect, it } from "vitest";
import { getData } from "@/lib/data";
import { validateDataset } from "@/lib/data/validate";
import { MONTH_COUNT } from "@/lib/data/calendar";

const d = getData();

describe("synthetic dataset", () => {
  it("passes every automatic integrity check", () => {
    const r = validateDataset(d);
    expect(r.issues).toEqual([]);
    expect(r.passed).toBe(true);
    expect(r.checks.length).toBeGreaterThanOrEqual(9);
  });
  it("models 2 funds and 12 companies with revenue between ~$12M and ~$140M", () => {
    expect(d.funds).toHaveLength(2);
    expect(d.companies).toHaveLength(12);
    for (const c of d.companies) {
      const rows = d.monthlyByCompany.get(c.id)!;
      const last12 = rows.slice(Math.max(0, c.lastReportedMonth - 11), c.lastReportedMonth + 1).filter(Boolean);
      const annual = last12.reduce((s, r) => s + r!.revenue, 0) * (12 / last12.length);
      expect(annual).toBeGreaterThan(11);
      expect(annual).toBeLessThan(145);
    }
  });
  it("covers Jan 2024 – Sep 2026 except where submissions are missing", () => {
    expect(MONTH_COUNT).toBe(33);
    expect(d.monthlyByCompany.get("atlas-software")!.filter(Boolean)).toHaveLength(33);
    expect(d.companyById.get("apex-workforce")!.lastReportedMonth).toBe(29);
    expect(d.monthlyByCompany.get("apex-workforce")![30]).toBeUndefined();
    expect(d.monthlyByCompany.get("bluepeak-solutions")![32]).toBeUndefined();
  });
  it("has two connection types: DualEntry ledger shares and sponsor uploads", () => {
    const kinds = new Set(d.companies.map((c) => c.connection));
    expect(kinds).toEqual(new Set(["dualentry", "upload"]));
    expect(d.companies.filter((c) => c.connection === "upload")).toHaveLength(8);
    // Entity ledgers only exist for DualEntry-connected companies.
    for (const [cid] of d.entityMonthlyByCompany) expect(d.companyById.get(cid)!.connection).toBe("dualentry");
  });
  it("omits ARR for non-subscription businesses", () => {
    for (const o of d.operational) expect(o.arr === null).toBe(!d.companyById.get(o.companyId)!.hasArr);
  });
  it("hides fields a company does not submit", () => {
    const bp = d.monthlyByCompany.get("bluepeak-solutions")![10]!;
    expect(bp.directLabor).toBeNull();
    expect(bp.operatingPersonnel).toBeNull();
    const mer = d.monthlyByCompany.get("meridian-services")![10]!;
    expect(mer.changeInNwc).toBeNull();
    expect(mer.cashFromOperations).not.toBeNull();
    const atlas = d.monthlyByCompany.get("atlas-software")![10]!;
    expect(atlas.changeInNwc).not.toBeNull();
  });
  it("translates GBP at average rates for flows and closing rates for balances", () => {
    const local = d.monthlyLocalByCompany.get("horizon-advisory")![20]!;
    const usd = d.monthlyByCompany.get("horizon-advisory")![20]!;
    const fx = d.fx.find((f) => f.currency === "GBP" && f.month === 20)!;
    expect(usd.currency).toBe("USD");
    expect(usd.revenue).toBeCloseTo(local.revenue * fx.average, 4);
    expect(usd.cashEnd!).toBeCloseTo(local.cashEnd! * fx.closing, 4);
    expect(usd.grossProfit).toBeCloseTo(usd.revenue - usd.cogs, 9);
  });
  it("links budgets to valid companies; one company has no budget", () => {
    expect(d.budgetByCompany.has("bluepeak-solutions")).toBe(false);
    expect(d.budgetByCompany.get("crestpoint-consulting")![30]!.cashFromOperations).toBeNull();
  });
  it("is deterministic", async () => {
    const { generateDataset } = await import("@/lib/data/generate");
    const again = generateDataset();
    expect(again.monthly[123]).toEqual(d.monthly[123]);
  });
});
