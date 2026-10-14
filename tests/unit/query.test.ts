import { describe, expect, it } from "vitest";
import { getData } from "@/lib/data";
import { analyzeCompany } from "@/lib/engine/company";
import { EMPTY_FILTERS } from "@/lib/engine/filters";
import { resolvePeriod } from "@/lib/engine/periods";
import { portfolioSummary } from "@/lib/engine/portfolio";
import { answerQuestion } from "@/lib/query/answer";
import { parseQuestion, SUGGESTED_QUESTIONS } from "@/lib/query/parser";
import { fmtPct } from "@/lib/format";

const ctx = { filters: EMPTY_FILTERS, selection: { kind: "quarter" as const, quarter: "2026-Q3", year: 2025 }, basis: "yoy" as const };
const Q3 = resolvePeriod(ctx.selection);
const ask = (q: string, prev?: ReturnType<typeof parseQuestion>) => {
  const p = parseQuestion(q, prev);
  return { p, a: answerQuestion(p, ctx) };
};

describe("question interpretation", () => {
  const expected: Record<string, string> = {
    "What was portfolio revenue growth in Q3 2026?": "portfolio_growth",
    "Which services companies have labor costs growing faster than revenue, and by how much?": "labor_growth_outliers",
    "Which companies missed EBITDA budget?": "budget_variance",
    "Compare Meridian Services with other services businesses": "compare_to_cohort",
    "Which businesses have deteriorating gross margins?": "margin_changes",
    "Which software companies are growing fastest?": "rank_companies",
    "What is our average EBITDA margin?": "portfolio_margin",
    "Which companies experienced declining operating cash flow?": "cash_flow_outliers",
    "How has G&A as a percentage of revenue changed?": "trend_summary",
    "Which companies are outperforming their peers?": "outperformers",
  };
  it("maps every suggested question to an approved intent and answers it", () => {
    for (const q of SUGGESTED_QUESTIONS) {
      const { p, a } = ask(q);
      expect(p.intent, q).toBe(expected[q]);
      expect(a.supported, q).toBe(true);
      expect(a.methodology.length, q).toBeGreaterThan(0);
      expect(a.whyItMatters.length).toBeGreaterThan(10);
    }
  });
  it("answers labor outliers with engine figures for services companies only", () => {
    const { p, a } = ask("Which services companies have labor costs growing faster than revenue, and by how much?");
    expect(p.sector).toBe("Business Services");
    const m = analyzeCompany("meridian-services", Q3);
    expect(a.headline).toContain(`Meridian Services by ${(m.yoy!.laborGap! * 100).toFixed(1)} pp`);
    expect(a.rows.every((r) => getData().companyById.get(r.companyId!)!.sector === "Business Services")).toBe(true);
    expect(a.methodology.some((x) => x.includes("BluePeak"))).toBe(true);
  });
  it("portfolio growth answer matches the aggregation engine", () => {
    const { a } = ask("What was portfolio revenue growth in Q3 2026?");
    const s = portfolioSummary(getData().companies.map((c) => c.id), Q3);
    expect(a.headline).toContain(fmtPct(s.revenueGrowth.yoy.aggregate));
    expect(a.headline).toContain(fmtPct(s.revenueGrowth.yoy.average));
  });
  it("supports follow-ups that change scope", () => {
    const first = ask("Which software companies are growing fastest?");
    const { p, a } = ask("What about services companies?", first.p);
    expect(p.isFollowUp).toBe(true);
    expect(p.intent).toBe("rank_companies");
    expect(p.sector).toBe("Business Services");
    expect(a.rows.every((r) => getData().companyById.get(r.companyId!)!.sector === "Business Services")).toBe(true);
  });
  it("respects explicit periods and declines out-of-range periods", () => {
    expect(ask("What was revenue growth in Q2 2025?").a.headline).toContain("Q2 2025");
    const bad = ask("What was revenue growth in Q4 2026?");
    expect(bad.a.supported).toBe(false);
  });
  it("respects global filters", () => {
    const p = parseQuestion("What is our average EBITDA margin?");
    const a = answerQuestion(p, { ...ctx, filters: { ...EMPTY_FILTERS, funds: ["fund-iii"] } });
    expect(a.rows.every((r) => getData().companyById.get(r.companyId!)!.fund === "fund-iii")).toBe(true);
  });
  it("declines unsupported questions instead of fabricating", () => {
    for (const q of ["What is our IRR?", "Forecast revenue for next year", "tell me a joke"]) {
      const { a } = ask(q);
      expect(a.supported, q).toBe(false);
      expect(a.rows).toHaveLength(0);
      expect(a.followUps.length).toBeGreaterThan(0);
    }
  });
});
