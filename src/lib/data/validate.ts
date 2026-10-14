import { z } from "zod";
import { LAST_MONTH } from "./calendar";
import type { IndexedDataset } from "./index";
import { BudgetMonthlySchema, CompanySchema, EntityMonthlySchema, MonthlyFinancialSchema, OperationalMonthlySchema, TransactionSchema } from "./types";

export interface ValidationIssue {
  check: string;
  detail: string;
}
export interface ValidationReport {
  passed: boolean;
  checks: { name: string; passed: boolean; count: number }[];
  issues: ValidationIssue[];
}

const TOL = 1e-5;
const close = (a: number, b: number, tol = TOL) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

/** Automatic integrity checks run in unit tests and surfaced in the Methodology panel. */
export function validateDataset(d: IndexedDataset): ValidationReport {
  const issues: ValidationIssue[] = [];
  const checks: ValidationReport["checks"] = [];
  const run = (name: string, fn: () => number) => {
    const before = issues.length;
    const count = fn();
    checks.push({ name, passed: issues.length === before, count });
  };
  const ids = new Set(d.companies.map((c) => c.id));

  run("Schema validation (Zod)", () => {
    const sets: [string, z.ZodTypeAny, unknown[]][] = [
      ["company", CompanySchema, d.companies],
      ["monthly", MonthlyFinancialSchema, d.monthly],
      ["monthlyLocal", MonthlyFinancialSchema, d.monthlyLocal],
      ["budget", BudgetMonthlySchema, d.budgets],
      ["operational", OperationalMonthlySchema, d.operational],
      ["entityMonthly", EntityMonthlySchema, d.entityMonthly],
      ["transaction", TransactionSchema, d.transactions],
    ];
    let n = 0;
    for (const [label, schema, rows] of sets)
      for (const r of rows) {
        n++;
        const res = schema.safeParse(r);
        if (!res.success) issues.push({ check: "schema", detail: `${label}: ${res.error.issues[0]?.message}` });
      }
    return n;
  });

  run("Company IDs are valid and unique", () => {
    if (ids.size !== d.companies.length) issues.push({ check: "ids", detail: "Duplicate company id" });
    const all = [...d.monthly, ...d.budgets, ...d.operational, ...d.entityMonthly];
    for (const r of all) if (!ids.has(r.companyId)) issues.push({ check: "ids", detail: `Unknown company ${r.companyId}` });
    for (const t of d.transactions) if (!ids.has(t.platformId)) issues.push({ check: "ids", detail: `Unknown platform ${t.platformId}` });
    return all.length;
  });

  run("Every financial period is uniquely identified", () => {
    const seen = new Set<string>();
    for (const [label, rows] of [["monthly", d.monthly], ["budget", d.budgets], ["operational", d.operational]] as const)
      for (const r of rows) {
        const k = `${label}:${r.companyId}:${r.month}`;
        if (seen.has(k)) issues.push({ check: "periods", detail: `Duplicate ${k}` });
        seen.add(k);
        if (r.month < 0 || r.month > LAST_MONTH) issues.push({ check: "periods", detail: `Out-of-range month ${k}` });
      }
    return seen.size;
  });

  run("Revenue, COGS and gross profit reconcile", () => {
    for (const r of [...d.monthly, ...d.monthlyLocal]) {
      if (r.subscriptionRevenue !== null || r.servicesRevenue !== null)
        if (!close(r.revenue, (r.subscriptionRevenue ?? 0) + (r.servicesRevenue ?? 0)))
          issues.push({ check: "revenue", detail: `${r.companyId} m${r.month}: revenue split` });
      if (r.directLabor !== null && r.otherCogs !== null && !close(r.cogs, r.directLabor + r.otherCogs))
        issues.push({ check: "cogs", detail: `${r.companyId} m${r.month}: COGS ≠ direct labor + other COGS` });
      if (!close(r.grossProfit, r.revenue - r.cogs)) issues.push({ check: "gp", detail: `${r.companyId} m${r.month}: GP` });
    }
    return d.monthly.length;
  });

  run("EBITDA = gross profit − operating expenses", () => {
    for (const r of [...d.monthly, ...d.monthlyLocal]) {
      const opex = r.salesMarketing + (r.researchDevelopment ?? 0) + r.generalAdmin + r.otherOpex;
      if (!close(r.operatingExpenses, opex)) issues.push({ check: "opex", detail: `${r.companyId} m${r.month}: opex sum` });
      if (!close(r.ebitda, r.grossProfit - r.operatingExpenses)) issues.push({ check: "ebitda", detail: `${r.companyId} m${r.month}: EBITDA` });
    }
    return d.monthly.length;
  });

  run("Labor categories are mutually exclusive (no double counting)", () => {
    for (const r of d.monthly) {
      if (r.operatingPersonnel === null) continue;
      if (!close(r.operatingPersonnel, (r.smPersonnel ?? 0) + (r.rdPersonnel ?? 0) + (r.gaPersonnel ?? 0)))
        issues.push({ check: "labor", detail: `${r.companyId} m${r.month}: personnel memo` });
      if ((r.smPersonnel ?? 0) > r.salesMarketing + TOL || (r.rdPersonnel ?? 0) > (r.researchDevelopment ?? 0) + TOL)
        issues.push({ check: "labor", detail: `${r.companyId} m${r.month}: personnel exceeds functional line` });
    }
    return d.monthly.length;
  });

  run("Cash roll-forward and cash-flow model (local currency)", () => {
    for (const r of d.monthlyLocal) {
      if (r.cashBegin === null || r.cashEnd === null || r.cashFromOperations === null) continue;
      const expected = r.cashBegin + r.cashFromOperations - (r.capex ?? 0) - (r.acquisitions ?? 0) + (r.financingFlows ?? 0);
      if (!close(r.cashEnd, expected, 1e-4)) issues.push({ check: "cash", detail: `${r.companyId} m${r.month}: cash roll-forward` });
      if (r.changeInNwc !== null && r.cashInterest !== null && r.cashTaxes !== null) {
        if (!close(r.cashFromOperations, r.ebitda - r.cashInterest - r.cashTaxes - r.changeInNwc, 1e-4))
          issues.push({ check: "cfo", detail: `${r.companyId} m${r.month}: CFO bridge` });
      }
    }
    return d.monthlyLocal.length;
  });

  run("Budgets link to valid companies and periods; budget EBITDA reconciles", () => {
    for (const b of d.budgets) {
      if (!close(b.ebitda, b.revenue - b.cogs - b.operatingExpenses)) issues.push({ check: "budget", detail: `${b.companyId} m${b.month}: budget EBITDA` });
    }
    return d.budgets.length;
  });

  run("ARR only reported for subscription businesses", () => {
    for (const o of d.operational) {
      const c = d.companyById.get(o.companyId)!;
      if (!c.hasArr && o.arr !== null) issues.push({ check: "arr", detail: `${o.companyId}: ARR on non-subscription company` });
      if (c.hasArr && o.arr === null) issues.push({ check: "arr", detail: `${o.companyId}: ARR missing` });
    }
    return d.operational.length;
  });

  run("Entity ledgers reconcile to consolidated revenue and EBITDA", () => {
    let n = 0;
    for (const [cid, rows] of d.entityMonthlyByCompany) {
      const byM = new Map<number, { rev: number; ebitda: number; icR: number; icC: number }>();
      for (const r of rows) {
        const a = byM.get(r.month) ?? { rev: 0, ebitda: 0, icR: 0, icC: 0 };
        a.rev += r.externalRevenue;
        a.ebitda += r.ebitda;
        a.icR += r.intercompanyRevenue;
        a.icC += r.intercompanyCost;
        byM.set(r.month, a);
      }
      for (const [m, a] of byM) {
        n++;
        const cons = d.monthlyByCompany.get(cid)![m]!;
        if (!close(a.rev, cons.revenue, 1e-4)) issues.push({ check: "entity", detail: `${cid} m${m}: entity revenue` });
        if (!close(a.ebitda, cons.ebitda, 1e-4)) issues.push({ check: "entity", detail: `${cid} m${m}: entity EBITDA` });
        if (!close(a.icR, a.icC, 1e-4)) issues.push({ check: "entity", detail: `${cid} m${m}: intercompany does not eliminate` });
      }
    }
    return n;
  });

  return { passed: issues.length === 0, checks, issues };
}
