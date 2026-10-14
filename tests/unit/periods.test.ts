import { describe, expect, it } from "vitest";
import { comparisonPeriod, resolvePeriod, trendQuarters } from "@/lib/engine/periods";

describe("period engine", () => {
  const q3 = resolvePeriod({ kind: "quarter", quarter: "2026-Q3", year: 2025 });
  it("resolves the default quarter to Jul–Sep 2026", () => {
    expect([q3.start, q3.end, q3.label]).toEqual([30, 32, "Q3 2026"]);
  });
  it("finds prior quarter and same quarter last year with matching length", () => {
    expect(comparisonPeriod(q3, "prior")).toMatchObject({ start: 27, end: 29, label: "Q2 2026" });
    expect(comparisonPeriod(q3, "yoy")).toMatchObject({ start: 18, end: 20, label: "Q3 2025" });
  });
  it("handles TTM, YTD and FY", () => {
    const ttm = resolvePeriod({ kind: "ttm", quarter: "2026-Q3", year: 2025 });
    expect([ttm.start, ttm.end]).toEqual([21, 32]);
    expect(comparisonPeriod(ttm, "yoy")).toMatchObject({ start: 9, end: 20 });
    expect(comparisonPeriod(ttm, "prior")).toMatchObject({ start: 18, end: 29 });
    const ytd = resolvePeriod({ kind: "ytd", quarter: "2026-Q3", year: 2025 });
    expect([ytd.start, ytd.end]).toEqual([24, 32]);
    expect(comparisonPeriod(ytd, "yoy")).toMatchObject({ start: 12, end: 20 });
    const fy = resolvePeriod({ kind: "fy", quarter: "2026-Q3", year: 2025 });
    expect([fy.start, fy.end, fy.label]).toEqual([12, 23, "FY 2025"]);
  });
  it("returns null when the comparison falls before the dataset", () => {
    const q1 = resolvePeriod({ kind: "quarter", quarter: "2024-Q1", year: 2024 });
    expect(comparisonPeriod(q1, "yoy")).toBeNull();
    expect(comparisonPeriod(q1, "prior")).toBeNull();
  });
  it("builds trailing quarter windows", () => {
    const qs = trendQuarters(32, 4);
    expect(qs.map((q) => q.label)).toEqual(["Q4 2025", "Q1 2026", "Q2 2026", "Q3 2026"]);
  });
});
