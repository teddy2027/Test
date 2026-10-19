/**
 * Applies the sponsor's workspace (added companies, accepted uploads, approved data shares, migrations)
 * on top of the generated demo dataset. Pure function: same inputs → same dataset.
 */
import { LAST_MONTH } from "../data/calendar";
import { translateBudgets, translateMonthly } from "../data/generate";
import type { Company, Dataset, Entity, EntityMonthly, MonthlyFinancial, OperationalMonthly } from "../data/types";
import { buildAddedCompany } from "./synth";
import type { ShareScope, Workspace } from "./types";

export function isEmptyWorkspace(ws: Workspace): boolean {
  return !ws.companies.length && !ws.submissions.length && !ws.budgetSubmissions.length && !ws.requests.some((r) => r.status === "approved");
}

/** Fields hidden by the company's sharing scope are nulled before the sponsor sees them. */
function enforceScope(r: MonthlyFinancial, s: ShareScope): MonthlyFinancial {
  const out = { ...r };
  if (s.granularity === "summary") {
    // Summary P&L: revenue, COGS, gross profit, opex lines and EBITDA only — no revenue mix, no personnel memo.
    out.subscriptionRevenue = null;
    out.servicesRevenue = null;
    out.directLabor = null;
    out.otherCogs = null;
    out.smPersonnel = null;
    out.rdPersonnel = null;
    out.gaPersonnel = null;
    out.operatingPersonnel = null;
  }
  if (!s.cashFlow) {
    out.cashInterest = null;
    out.cashTaxes = null;
    out.changeInNwc = null;
    out.cashFromOperations = null;
    out.capex = null;
    out.acquisitions = null;
    out.financingFlows = null;
    out.cashBegin = null;
    out.cashEnd = null;
    out.accountsReceivable = null;
    out.deferredRevenue = null;
    out.accountsPayable = null;
    out.debt = null;
  }
  return out;
}

export function applyWorkspace(base: Dataset, ws: Workspace): Dataset {
  const fxMap = new Map(base.fx.map((r) => [`${r.currency}:${r.month}`, r]));
  const approved = new Map(ws.requests.filter((r) => r.status === "approved" && r.scope).map((r) => [r.companyId, r]));

  let companies: Company[] = base.companies.map((c) => ({ ...c }));
  let monthlyLocal = [...base.monthlyLocal];
  let budgetsLocal = [...base.budgetsLocal];
  let operational = [...base.operational];
  const entities: Entity[] = [...base.entities];
  let entityMonthly: EntityMonthly[] = [...base.entityMonthly];

  // 1. Companies added by the sponsor.
  for (const a of ws.companies) {
    const req = approved.get(a.company.id);
    if (a.company.connection === "dualentry" && req) {
      // Simulated ledger sync after the company approved the share.
      const built = buildAddedCompany(a.company, a.input);
      const from = a.input.historyFrom;
      companies.push({ ...built.company, lastUpdated: req.decidedAt ?? built.company.lastUpdated, userAdded: true });
      monthlyLocal.push(...built.monthlyLocal.filter((r) => r.month >= from));
      budgetsLocal.push(...built.budgetsLocal.filter((r) => r.month >= from));
      operational.push(...built.operational.filter((r) => r.month >= from));
      entities.push(...built.entities);
      entityMonthly.push(...built.entityMonthly.filter((r) => r.month >= from));
    } else {
      companies.push({ ...a.company });
    }
  }

  // 2. Accepted uploads (later uploads replace earlier values for the same month).
  const subs = [...ws.submissions].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  for (const s of subs) {
    const months = new Set(s.months);
    monthlyLocal = monthlyLocal.filter((r) => !(r.companyId === s.companyId && months.has(r.month)));
    monthlyLocal.push(...s.rows);
    const base = new Map(operational.filter((o) => o.companyId === s.companyId).map((o) => [o.month, o]));
    operational = operational.filter((o) => !(o.companyId === s.companyId && months.has(o.month)));
    for (const o of s.operational) {
      const prev = base.get(o.month);
      operational.push({
        companyId: s.companyId,
        month: o.month,
        employees: o.employees ?? null,
        billableHeadcount: prev?.billableHeadcount ?? null,
        utilization: prev?.utilization ?? null,
        arr: o.arr ?? prev?.arr ?? null,
        customers: prev?.customers ?? null,
        netRevenueRetention: prev?.netRevenueRetention ?? null,
      } satisfies OperationalMonthly);
    }
    companies = companies.map((c) => (c.id === s.companyId && s.uploadedAt > c.lastUpdated ? { ...c, lastUpdated: s.uploadedAt } : c));
  }

  // 2b. Uploaded budgets (later uploads replace earlier ones for the same month).
  const budgetSubs = [...ws.budgetSubmissions].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  for (const s of budgetSubs) {
    const months = new Set(s.months);
    budgetsLocal = budgetsLocal.filter((b) => !(b.companyId === s.companyId && months.has(b.month)));
    budgetsLocal.push(...s.rows);
  }
  const budgeted = new Set(budgetSubs.map((s) => s.companyId));
  companies = companies.map((c) => (budgeted.has(c.id) ? { ...c, missingFields: c.missingFields.filter((f) => !/^Budget/.test(f)) } : c));

  // 3. Demo companies that migrated to DualEntry and approved a data share.
  companies = companies.map((c) => {
    const req = approved.get(c.id);
    if (!req || c.userAdded || c.connection === "dualentry") return c;
    const mig = ws.migration[c.id];
    if (mig?.stage !== "connected") return c;
    return {
      ...c,
      connection: "dualentry",
      accountingSystem: "DualEntry",
      dataSource: `DualEntry ledger · live sync (authorized) · migrated from ${c.accountingSystem}`,
      lastUpdated: req.decidedAt ?? c.lastUpdated,
      closeDays: Math.min(c.closeDays ?? 6, 6),
      missingFields: c.missingFields.filter((f) => !/Balance sheet|Working-capital|Entity-level/.test(f)),
      definitionNotes: [...c.definitionNotes, { kind: "context" as const, text: `Periods before the migration were uploaded by Northbridge; entity-level books start with the first DualEntry close.` }],
    };
  });

  // 4. Enforce each approved sharing scope.
  for (const [cid, req] of approved) {
    const s = req.scope!;
    monthlyLocal = monthlyLocal.map((r) => (r.companyId === cid ? enforceScope(r, s) : r));
    if (!s.budget) budgetsLocal = budgetsLocal.filter((b) => b.companyId !== cid);
    else if (!s.cashFlow) budgetsLocal = budgetsLocal.map((b) => (b.companyId === cid ? { ...b, cashFromOperations: null } : b));
    if (s.granularity !== "entity") {
      entityMonthly = entityMonthly.filter((e) => e.companyId !== cid);
    } else {
      const own = entities.filter((e) => e.companyId === cid);
      const keep = new Set(own.filter((e) => s.entities.includes(e.name)).map((e) => e.id));
      entityMonthly = entityMonthly.filter((e) => e.companyId !== cid || keep.has(e.entityId));
      if (keep.size < own.length) companies = companies.map((c) => (c.id === cid ? { ...c, entityShare: "partial" } : c));
    }
  }

  // 5. Derive reporting coverage and ARR availability from the merged data.
  companies = companies.map((c) => {
    const months = monthlyLocal.filter((r) => r.companyId === c.id).map((r) => r.month);
    const last = months.length ? Math.max(...months) : -1;
    const ops = operational.filter((o) => o.companyId === c.id);
    const hasArr = c.userAdded ? ops.length > 0 && ops.every((o) => o.arr !== null) : c.hasArr;
    if (!hasArr) operational = operational.map((o) => (o.companyId === c.id && o.arr !== null ? { ...o, arr: null, customers: null } : o));
    return { ...c, lastReportedMonth: Math.min(last, LAST_MONTH), hasArr };
  });

  monthlyLocal.sort((a, b) => a.companyId.localeCompare(b.companyId) || a.month - b.month);
  return {
    ...base,
    companies,
    entities,
    entityMonthly,
    monthlyLocal,
    monthly: translateMonthly(monthlyLocal, fxMap),
    budgetsLocal,
    budgets: translateBudgets(budgetsLocal, fxMap),
    operational,
  };
}

/** Months that currently hold data for a company (local currency), indexed by month. */
export function existingByMonth(ds: Pick<Dataset, "monthlyLocal">, companyId: string): (MonthlyFinancial | undefined)[] {
  const out: (MonthlyFinancial | undefined)[] = [];
  for (const r of ds.monthlyLocal) if (r.companyId === companyId) out[r.month] = r;
  return out;
}

