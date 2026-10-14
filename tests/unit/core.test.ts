import { describe, expect, it } from "vitest";
import { growth, mean, median, ppChange, quantile, safeDiv, sumOrNull } from "@/lib/engine/core";
import { fmtPct, fmtPp, fmtUsd } from "@/lib/format";

describe("numeric primitives", () => {
  it("divides safely", () => {
    expect(safeDiv(10, 4)).toBe(2.5);
    expect(safeDiv(10, 0)).toBeNull();
    expect(safeDiv(null, 4)).toBeNull();
    expect(safeDiv(4, null)).toBeNull();
  });
  it("computes growth and refuses non-positive bases", () => {
    expect(growth(112, 100)).toBeCloseTo(0.12, 12);
    expect(growth(50, 0)).toBeNull();
    expect(growth(50, -10)).toBeNull();
    expect(growth(null, 10)).toBeNull();
  });
  it("expresses margin differences as fraction points", () => {
    expect(ppChange(0.114, 0.182)).toBeCloseTo(-0.068, 12);
    expect(ppChange(null, 0.1)).toBeNull();
  });
  it("aggregates", () => {
    expect(mean([1, 2, null, 3])).toBe(2);
    expect(mean([null])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(quantile([1, 2, 3, 4, 5], 0.25)).toBe(2);
    expect(sumOrNull([1, 2])).toBe(3);
    expect(sumOrNull([1, null])).toBeNull();
    expect(sumOrNull([])).toBeNull();
  });
  it("formats consistently with N/A for missing values", () => {
    expect(fmtUsd(171.7)).toBe("$171.7M");
    expect(fmtUsd(0.426)).toBe("$426K");
    expect(fmtUsd(-1.7, { signed: true })).toBe("−$1.7M");
    expect(fmtPct(0.1234)).toBe("12.3%");
    expect(fmtPct(0.1234, { signed: true })).toBe("+12.3%");
    expect(fmtPp(-0.068)).toBe("−6.8 pp");
    expect(fmtPct(null)).toBe("N/A");
  });
});
