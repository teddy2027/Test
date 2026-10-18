import { describe, expect, it } from "vitest";
import { getBaseDataset, indexDataset } from "@/lib/data";
import { validateDataset } from "@/lib/data/validate";
import { LAST_MONTH } from "@/lib/data/calendar";
import { buildTemplate, parseAmount, parseCsv, recordToValues, validateUpload } from "@/lib/workspace/csv";
import { applyWorkspace, existingByMonth } from "@/lib/workspace/overlay";
import { buildAddedCompany, fullHistoryForSeeded } from "@/lib/workspace/synth";
import { defaultMigration, effortSummary, routeRep, talkingPoints } from "@/lib/workspace/migration";
import { analyzeCompany } from "@/lib/engine/company";
import { resolvePeriod } from "@/lib/engine/periods";
import type { Company } from "@/lib/data/types";
import type { NewCompanyInput, Workspace } from "@/lib/workspace/types";

const base = getBaseDataset();
const Q3 = resolvePeriod({ kind: "quarter", quarter: "2026-Q3", year: 2025 });
const apex = base.companies.find((c) => c.id === "apex-workforce")!;
const emptyWs = (): Workspace => ({ companies: [], submissions: [], requests: [], migration: {} });

function apexQ3File(mutate?: (v: Record<number, Record<string, number | string | null>>) => void) {
  const full = fullHistoryForSeeded("apex-workforce")!;
  const filled: Record<number, Record<string, number | string | null>> = {};
  for (const m of [30, 31, 32]) filled[m] = recordToValues(full.monthlyLocal.find((r) => r.month === m)!, full.operational.find((o) => o.month === m));
  mutate?.(filled);
  return buildTemplate(apex, [30, 31, 32], filled);
}

describe("upload template and validation", () => {
  it("parses quoted CSV and accounting-style amounts", () => {
    expect(parseCsv('a,"b, c",d\n1,"2,345",(10)')).toEqual([["a", "b, c", "d"], ["1", "2,345", "(10)"]]);
    expect(parseAmount("(1,234)")).toBe(-1234);
    expect(parseAmount("$1,000.50")).toBe(1000.5);
    expect(parseAmount("")).toBeNull();
    expect(Number.isNaN(parseAmount("abc"))).toBe(true);
  });
  it("accepts a correct example pack and builds reconciling records", () => {
    const r = validateUpload(apexQ3File(), apex, existingByMonth(base, apex.id));
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.newMonths).toEqual([30, 31, 32]);
    for (const m of r.months) expect(m.record.ebitda).toBeCloseTo(m.record.grossProfit - m.record.operatingExpenses, 9);
  });
  it("rejects control totals that do not reconcile, wrong company and unclosed months", () => {
    // Break the EBITDA check row for the first month so it no longer equals GP − opex.
    const text = apexQ3File().replace(/^EBITDA,([^,]*),([^,]*),/m, (_m, a, b) => `EBITDA,${a},${Number(b) + 999},`);
    const r = validateUpload(text, apex, existingByMonth(base, apex.id));
    expect(r.ok).toBe(false);
    expect(r.errors[0].message).toMatch(/EBITDA is .* but gross profit − operating expenses/);
    const meridian = base.companies.find((c) => c.id === "meridian-services")!;
    expect(validateUpload(apexQ3File(), meridian, []).errors.some((e) => /not Meridian Services/.test(e.message))).toBe(true);
    const future = apexQ3File().replace("2026-09", "2026-10");
    expect(validateUpload(future, apex, []).errors.some((e) => /has not closed yet/.test(e.message))).toBe(true);
  });
  it("flags restatements and missing labor split as warnings", () => {
    const meridian = base.companies.find((c) => c.id === "meridian-services")!;
    const rec = base.monthlyLocal.find((r) => r.companyId === "meridian-services" && r.month === 32)!;
    const v = recordToValues(rec, undefined);
    v.OPEX_OTHER = (v.OPEX_OTHER as number) + 25000;
    v.COGS_DIRECT_LABOR = null;
    v.COGS_OTHER = null;
    const text = buildTemplate(meridian, [32], { 32: v }).replace(/^COGS_TOTAL,([^,]*),$/m, `COGS_TOTAL,$1,${Math.round(rec.cogs * 1e6)}`);
    const r = validateUpload(text, meridian, existingByMonth(base, meridian.id));
    expect(r.errors).toEqual([]);
    expect(r.restatedMonths).toEqual([32]);
    expect(r.warnings.some((w) => /labor split incomplete/.test(w.message))).toBe(true);
  });
});

describe("workspace overlay", () => {
  it("an accepted upload completes Apex's Q3 and keeps the dataset valid", () => {
    const r = validateUpload(apexQ3File(), apex, existingByMonth(base, apex.id));
    const ws = emptyWs();
    ws.submissions.push({ id: "s1", companyId: apex.id, fileName: "apex.csv", uploadedAt: "2026-10-14T10:00:00Z", uploadedBy: "t", months: [30, 31, 32], rows: r.months.map((m) => m.record), operational: r.months.map((m) => ({ month: m.month, employees: m.employees, arr: m.arr })), restatedMonths: [], restatementReason: null, warnings: 0 });
    const d = indexDataset(applyWorkspace(base, ws));
    expect(d.companyById.get(apex.id)!.lastReportedMonth).toBe(LAST_MONTH);
    expect(analyzeCompany(apex.id, Q3, d).current.status).toBe("complete");
    expect(validateDataset(d).issues).toEqual([]);
  });
  it("a sponsor-added DualEntry company has no data until the company approves, then syncs with entity books", () => {
    const input: NewCompanyInput = { name: "Orbit Billing", fund: "fund-iii", ownershipPct: 70, investmentDate: "2026-06-30", sector: "Software", subsector: "Billing SaaS", businessModel: "Subscription software", fiscalYearEnd: "December", geography: "North America", headquarters: "Denver, CO", entityCount: 3, accountingSystem: "DualEntry", onDualEntry: true, approxRevenueUsdM: 40, cfoName: "A B", cfoTitle: "CFO", cfoEmail: "a@b.example", historyFrom: 9, deadlineBusinessDays: 10 };
    const company: Company = { ...base.companies[0], id: "orbit-billing", name: "Orbit Billing", connection: "dualentry", userAdded: true, lastReportedMonth: -1, entityCount: 3, businessModel: "Subscription software", hasArr: false };
    const ws = emptyWs();
    ws.companies.push({ company, input, addedAt: "2026-10-14T10:00:00Z" });
    const pending = indexDataset(applyWorkspace(base, { ...ws, requests: [{ companyId: "orbit-billing", token: "t", requestedAt: "x", requestedBy: "y", status: "pending", scope: null, decidedAt: null }] }));
    expect(pending.companyById.get("orbit-billing")!.lastReportedMonth).toBe(-1);
    expect(analyzeCompany("orbit-billing", Q3, pending).current.status).toBe("missing");
    const scope = { entities: ["Orbit Billing Inc."], granularity: "entity" as const, cashFlow: true, budget: true, timing: "closed" as const, hiddenAccounts: [], audience: ["Operating partners"], approvedBy: "A B", secondApprover: "C D", approvedAt: "x" };
    const live = indexDataset(applyWorkspace(base, { ...ws, requests: [{ companyId: "orbit-billing", token: "t", requestedAt: "x", requestedBy: "y", status: "approved", scope, decidedAt: "2026-10-14T11:00:00Z" }] }));
    const a = analyzeCompany("orbit-billing", Q3, live);
    expect(a.current.status).toBe("complete");
    expect(a.current.metrics.revenue! * 4).toBeGreaterThan(30);
    expect(a.current.metrics.revenue! * 4).toBeLessThan(50);
    // Only the shared entity's ledger is visible.
    expect(new Set(live.entityMonthlyByCompany.get("orbit-billing")!.map((e) => e.entityId)).size).toBe(1);
    expect(live.companyById.get("orbit-billing")!.hasArr).toBe(true);
    expect(validateDataset(live).issues).toEqual([]);
    // Scope: summary granularity and no cash flow hide those fields.
    const summary = indexDataset(applyWorkspace(base, { ...ws, requests: [{ companyId: "orbit-billing", token: "t", requestedAt: "x", requestedBy: "y", status: "approved", scope: { ...scope, granularity: "summary", cashFlow: false }, decidedAt: "x" }] }));
    const s = analyzeCompany("orbit-billing", Q3, summary).current.metrics;
    expect(s.laborExpense).toBeNull();
    expect(s.cfo).toBeNull();
    expect(s.ebitda).not.toBeNull();
    expect(summary.entityMonthlyByCompany.get("orbit-billing")).toBeUndefined();
  });
  it("synthesizes revenue close to the size entered", () => {
    const input = { approxRevenueUsdM: 25, entityCount: 1, businessModel: "Recurring managed services" } as NewCompanyInput;
    const b = buildAddedCompany({ ...base.companies[4], id: "x-co", connection: "upload" }, input);
    const ttm = b.monthlyLocal.filter((r) => r.month > LAST_MONTH - 12).reduce((s, r) => s + r.revenue, 0);
    expect(ttm).toBeGreaterThan(22);
    expect(ttm).toBeLessThan(28);
  });
});

describe("migration pipeline", () => {
  const d = indexDataset(base);
  it("routes multi-entity companies to the enterprise representative", () => {
    expect(routeRep(d.companyById.get("meridian-services")!, 135).rep.id).toBe("daniel-okafor");
    expect(routeRep(d.companyById.get("crestpoint-consulting")!, 29).rep.id).toBe("sarah-chen");
  });
  it("estimates manual reporting effort only for upload companies", () => {
    const e = effortSummary(d, []);
    expect(e.uploadCompanies).toBe(8);
    expect(e.reuploads).toBe(4);
    expect(e.hoursPerMonth).toBeGreaterThan(8);
    expect(e.avgDaysUpload!).toBeGreaterThan(e.avgDaysDualEntry!);
  });
  it("builds talking points from facts the sponsor already has", () => {
    const pts = talkingPoints(d.companyById.get("meridian-services")!, d, { ...emptyWs(), migration: defaultMigration() }, null);
    expect(pts.map((p) => p.label)).toEqual(expect.arrayContaining(["Monthly reporting today", "Timeliness", "Multi-entity", "Acquisitions"]));
  });
});
