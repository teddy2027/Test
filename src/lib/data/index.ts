import { generateDataset } from "./generate";
import type { BudgetMonthly, Company, Dataset, Entity, EntityMonthly, MonthlyFinancial, OperationalMonthly, Transaction } from "./types";

export * from "./types";

export interface IndexedDataset extends Dataset {
  companyById: Map<string, Company>;
  /** USD monthly records by company, indexed by month (undefined = not submitted). */
  monthlyByCompany: Map<string, (MonthlyFinancial | undefined)[]>;
  monthlyLocalByCompany: Map<string, (MonthlyFinancial | undefined)[]>;
  budgetByCompany: Map<string, (BudgetMonthly | undefined)[]>;
  operationalByCompany: Map<string, (OperationalMonthly | undefined)[]>;
  entitiesByCompany: Map<string, Entity[]>;
  entityMonthlyByCompany: Map<string, EntityMonthly[]>;
  transactionsByCompany: Map<string, Transaction[]>;
}

function byMonth<T extends { companyId: string; month: number }>(rows: T[]): Map<string, (T | undefined)[]> {
  const out = new Map<string, (T | undefined)[]>();
  for (const r of rows) {
    if (!out.has(r.companyId)) out.set(r.companyId, []);
    out.get(r.companyId)![r.month] = r;
  }
  return out;
}

function group<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(r);
  }
  return out;
}

export function indexDataset(d: Dataset): IndexedDataset {
  return {
    ...d,
    companyById: new Map(d.companies.map((c) => [c.id, c])),
    monthlyByCompany: byMonth(d.monthly),
    monthlyLocalByCompany: byMonth(d.monthlyLocal),
    budgetByCompany: byMonth(d.budgets),
    operationalByCompany: byMonth(d.operational),
    entitiesByCompany: group(d.entities, (e) => e.companyId),
    entityMonthlyByCompany: group(d.entityMonthly, (e) => e.companyId),
    transactionsByCompany: group(d.transactions, (t) => t.platformId),
  };
}

let cached: IndexedDataset | null = null;
/** The single, deterministic dataset instance shared by every view. */
export function getData(): IndexedDataset {
  if (!cached) cached = indexDataset(generateDataset());
  return cached;
}
