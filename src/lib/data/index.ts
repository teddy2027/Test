import { generateDataset } from "./generate";
import { applyWorkspace, isEmptyWorkspace } from "../workspace/overlay";
import type { Workspace } from "../workspace/types";
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

let base: Dataset | null = null;
let cached: IndexedDataset | null = null;
let overlay: Workspace | null = null;
let version = 0;

/** Sets the sponsor's workspace (added companies, uploads, data shares). Invalidates the dataset. */
export function setWorkspace(ws: Workspace | null) {
  overlay = ws && !isEmptyWorkspace(ws) ? ws : null;
  cached = null;
  version++;
}

export function dataVersion(): number {
  return version;
}

/** The generated demo portfolio without any workspace changes. */
export function getBaseDataset(): Dataset {
  if (!base) base = generateDataset();
  return base;
}

/** The single dataset instance shared by every view: generated portfolio + the sponsor's workspace. */
export function getData(): IndexedDataset {
  if (!cached) cached = indexDataset(overlay ? applyWorkspace(getBaseDataset(), overlay) : getBaseDataset());
  return cached;
}
