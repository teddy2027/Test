import { monthYear } from "../data/calendar";
import { getData, type IndexedDataset } from "../data";
import type { Company, MonthlyFinancial, Transaction } from "../data/types";
import { growth, ppChange, safeDiv, sumOrNull, type N } from "./core";
import { comparisonPeriod, length, months, type Period } from "./periods";

export type ReportingStatus = "complete" | "partial" | "missing";

/** Summed / point-in-time values for one company over one period (USD millions). */
export interface PeriodValues {
  revenue: N;
  subscriptionRevenue: N;
  servicesRevenue: N;
  cogs: N;
  directLabor: N;
  otherCogs: N;
  grossProfit: N;
  salesMarketing: N;
  researchDevelopment: N;
  generalAdmin: N;
  otherOpex: N;
  opex: N;
  operatingPersonnel: N;
  laborExpense: N;
  ebitda: N;
  cfo: N;
  capex: N;
  fcf: N;
  cashInterest: N;
  cashTaxes: N;
  changeInNwc: N;
  cashEnd: N;
  arr: N;
  customers: N;
  employees: N;
}

export interface Metrics extends PeriodValues {
  grossMargin: N;
  ebitdaMargin: N;
  cashConversion: N;
  cogsRatio: N;
  laborIntensity: N;
  gaRatio: N;
  smRatio: N;
  rdRatio: N;
  opexRatio: N;
  revenuePerEmployee: N;
}

export interface CompanyPeriod {
  period: Period;
  status: ReportingStatus;
  monthsAvailable: number;
  monthsExpected: number;
  metrics: Metrics;
}

export interface ComparisonBlock {
  period: Period;
  base: CompanyPeriod;
  status: ReportingStatus;
  revenueGrowth: N;
  organicRevenueGrowth: N;
  organicAvailable: boolean;
  laborGrowth: N;
  laborGap: N;
  ebitdaGrowth: N;
  opexGrowth: N;
  totalCostGrowth: N;
  cfoGrowth: N;
  arrGrowth: N;
  directLaborGrowth: N;
  operatingPersonnelGrowth: N;
  gaGrowth: N;
  employeesGrowth: N;
  ebitdaMarginChange: N;
  grossMarginChange: N;
  laborIntensityChange: N;
  gaRatioChange: N;
  cashConversionChange: N;
  operatingLeverage: N;
  /** Acquisitions that closed between the start of the comparison period and the end of the current period. */
  acquisitions: Transaction[];
}

export interface BudgetBlock {
  status: "complete" | "partial" | "missing";
  revenue: N;
  cogs: N;
  opex: N;
  ebitda: N;
  cfo: N;
  ebitdaMargin: N;
  revenueVar: N;
  revenueVarPct: N;
  ebitdaVar: N;
  ebitdaVarPct: N;
  cfoVar: N;
  cfoVarPct: N;
  cogsVar: N;
  opexVar: N;
  ebitdaMarginVarPp: N;
  acquisitions: Transaction[];
}

export interface CompanyAnalysis {
  company: Company;
  current: CompanyPeriod;
  prior: ComparisonBlock | null;
  yoy: ComparisonBlock | null;
  budget: BudgetBlock;
}

const MONTHLY_FLOW: [keyof PeriodValues, keyof MonthlyFinancial][] = [
  ["revenue", "revenue"],
  ["subscriptionRevenue", "subscriptionRevenue"],
  ["servicesRevenue", "servicesRevenue"],
  ["cogs", "cogs"],
  ["directLabor", "directLabor"],
  ["otherCogs", "otherCogs"],
  ["grossProfit", "grossProfit"],
  ["salesMarketing", "salesMarketing"],
  ["researchDevelopment", "researchDevelopment"],
  ["generalAdmin", "generalAdmin"],
  ["otherOpex", "otherOpex"],
  ["opex", "operatingExpenses"],
  ["operatingPersonnel", "operatingPersonnel"],
  ["ebitda", "ebitda"],
  ["cfo", "cashFromOperations"],
  ["capex", "capex"],
  ["cashInterest", "cashInterest"],
  ["cashTaxes", "cashTaxes"],
  ["changeInNwc", "changeInNwc"],
];

/** Aggregates monthly records into period values. Values are null unless every month in the period is present. */
export function periodValues(companyId: string, p: Period, data: IndexedDataset = getData()): CompanyPeriod {
  const rows = data.monthlyByCompany.get(companyId) ?? [];
  const ops = data.operationalByCompany.get(companyId) ?? [];
  const ms = months(p);
  const present = ms.map((m) => rows[m]).filter((r): r is MonthlyFinancial => !!r);
  const status: ReportingStatus = present.length === ms.length ? "complete" : present.length === 0 ? "missing" : "partial";
  const v = {} as PeriodValues;
  for (const [k, f] of MONTHLY_FLOW) {
    v[k] = status === "complete" ? sumOrNull(present.map((r) => r[f] as N)) : null;
  }
  const company = data.companyById.get(companyId)!;
  if (company.hasArr === false) v.subscriptionRevenue = null;
  v.laborExpense = v.directLabor !== null && v.operatingPersonnel !== null ? v.directLabor + v.operatingPersonnel : null;
  v.fcf = v.cfo !== null && v.capex !== null ? v.cfo - v.capex : null;
  const last = status === "complete" ? rows[p.end] : undefined;
  const lastOp = status === "complete" ? ops[p.end] : undefined;
  v.cashEnd = last?.cashEnd ?? null;
  v.arr = lastOp?.arr ?? null;
  v.customers = lastOp?.customers ?? null;
  v.employees = lastOp?.employees ?? null;

  const m: Metrics = {
    ...v,
    grossMargin: safeDiv(v.grossProfit, v.revenue),
    ebitdaMargin: safeDiv(v.ebitda, v.revenue),
    cashConversion: v.ebitda !== null && v.ebitda > 0 ? safeDiv(v.cfo, v.ebitda) : null,
    cogsRatio: safeDiv(v.cogs, v.revenue),
    laborIntensity: safeDiv(v.laborExpense, v.revenue),
    gaRatio: safeDiv(v.generalAdmin, v.revenue),
    smRatio: safeDiv(v.salesMarketing, v.revenue),
    rdRatio: safeDiv(v.researchDevelopment, v.revenue),
    opexRatio: safeDiv(v.opex, v.revenue),
    revenuePerEmployee: v.revenue !== null && v.employees ? (v.revenue * (12 / length(p))) / v.employees : null,
  };
  return { period: p, status, monthsAvailable: present.length, monthsExpected: ms.length, metrics: m };
}

/** Transactions that change the reporting perimeter between comparison start and current end. */
export function perimeterChanges(companyId: string, compStart: number, curEnd: number, data: IndexedDataset = getData()): Transaction[] {
  return (data.transactionsByCompany.get(companyId) ?? []).filter(
    (t) => t.closeMonth !== null && t.closeMonth > compStart && t.closeMonth <= curEnd,
  );
}

/** Revenue of acquired entities over a period (only available from entity-level ledgers). */
function acquiredEntityRevenue(companyId: string, entityIds: string[], p: Period, data: IndexedDataset): number {
  const rows = data.entityMonthlyByCompany.get(companyId) ?? [];
  return rows.filter((r) => entityIds.includes(r.entityId) && r.month >= p.start && r.month <= p.end).reduce((a, r) => a + r.externalRevenue, 0);
}

function compare(company: Company, cur: CompanyPeriod, cp: Period, data: IndexedDataset): ComparisonBlock {
  const base = periodValues(company.id, cp, data);
  const a = cur.metrics;
  const b = base.metrics;
  const acquisitions = perimeterChanges(company.id, cp.start, cur.period.end, data);
  const revenueGrowth = growth(a.revenue, b.revenue);
  const laborGrowth = growth(a.laborExpense, b.laborExpense);
  const opexGrowth = growth(a.opex, b.opex);
  const tc = (x: Metrics) => (x.cogs !== null && x.opex !== null ? x.cogs + x.opex : null);
  const totalCostGrowth = growth(tc(a), tc(b));
  let organicRevenueGrowth: N = acquisitions.length === 0 ? revenueGrowth : null;
  let organicAvailable = acquisitions.length === 0;
  if (acquisitions.length > 0 && company.connection === "dualentry" && acquisitions.every((t) => t.entityId)) {
    const ents = acquisitions.map((t) => t.entityId!) as string[];
    if (a.revenue !== null && b.revenue !== null) {
      organicRevenueGrowth = growth(a.revenue - acquiredEntityRevenue(company.id, ents, cur.period, data), b.revenue - acquiredEntityRevenue(company.id, ents, cp, data));
      organicAvailable = true;
    }
  }
  return {
    period: cp,
    base,
    status: base.status,
    revenueGrowth,
    organicRevenueGrowth,
    organicAvailable,
    laborGrowth,
    laborGap: laborGrowth !== null && revenueGrowth !== null ? laborGrowth - revenueGrowth : null,
    ebitdaGrowth: growth(a.ebitda, b.ebitda),
    opexGrowth,
    totalCostGrowth,
    cfoGrowth: growth(a.cfo, b.cfo),
    arrGrowth: growth(a.arr, b.arr),
    directLaborGrowth: growth(a.directLabor, b.directLabor),
    operatingPersonnelGrowth: growth(a.operatingPersonnel, b.operatingPersonnel),
    gaGrowth: growth(a.generalAdmin, b.generalAdmin),
    employeesGrowth: growth(a.employees, b.employees),
    ebitdaMarginChange: ppChange(a.ebitdaMargin, b.ebitdaMargin),
    grossMarginChange: ppChange(a.grossMargin, b.grossMargin),
    laborIntensityChange: ppChange(a.laborIntensity, b.laborIntensity),
    gaRatioChange: ppChange(a.gaRatio, b.gaRatio),
    cashConversionChange: ppChange(a.cashConversion, b.cashConversion),
    operatingLeverage: revenueGrowth !== null && totalCostGrowth !== null ? revenueGrowth - totalCostGrowth : null,
    acquisitions,
  };
}

/** Variance = Actual − Budget. Percentage variance uses |Budget| so the sign always means favorable for income lines. */
export function budgetBlock(companyId: string, cur: CompanyPeriod, data: IndexedDataset = getData()): BudgetBlock {
  const rows = data.budgetByCompany.get(companyId) ?? [];
  const ms = months(cur.period);
  const present = ms.map((m) => rows[m]).filter(Boolean);
  const status = present.length === ms.length ? "complete" : present.length === 0 ? "missing" : "partial";
  const ok = status === "complete";
  const sum = (f: "revenue" | "cogs" | "operatingExpenses" | "ebitda" | "cashFromOperations") =>
    ok ? sumOrNull(present.map((r) => r![f])) : null;
  const revenue = sum("revenue");
  const cogs = sum("cogs");
  const opex = sum("operatingExpenses");
  const ebitda = sum("ebitda");
  const cfo = sum("cashFromOperations");
  const a = cur.metrics;
  const v = (x: N, y: N) => (x !== null && y !== null ? x - y : null);
  const vp = (x: N, y: N) => (x !== null && y !== null && y !== 0 ? (x - y) / Math.abs(y) : null);
  const ebitdaMargin = safeDiv(ebitda, revenue);
  // Budgets exclude acquisitions that closed during the budget year (approved before close).
  const acquisitions = (data.transactionsByCompany.get(companyId) ?? []).filter((t) => {
    if (t.closeMonth === null) return false;
    const from = Math.max(cur.period.start, t.closeMonth);
    for (let m = from; m <= cur.period.end; m++) if (monthYear(m) === monthYear(t.closeMonth)) return true;
    return false;
  });
  return {
    status,
    revenue,
    cogs,
    opex,
    ebitda,
    cfo,
    ebitdaMargin,
    revenueVar: v(a.revenue, revenue),
    revenueVarPct: vp(a.revenue, revenue),
    ebitdaVar: v(a.ebitda, ebitda),
    ebitdaVarPct: vp(a.ebitda, ebitda),
    cfoVar: v(a.cfo, cfo),
    cfoVarPct: vp(a.cfo, cfo),
    cogsVar: v(a.cogs, cogs),
    opexVar: v(a.opex, opex),
    ebitdaMarginVarPp: ppChange(a.ebitdaMargin, ebitdaMargin),
    acquisitions,
  };
}

const cache = new Map<string, CompanyAnalysis>();

/** Full analysis of one company for one period: current values, prior-period, year-over-year and budget comparisons. */
export function analyzeCompany(companyId: string, p: Period, data: IndexedDataset = getData()): CompanyAnalysis {
  const key = `${companyId}:${p.kind}:${p.start}:${p.end}`;
  if (data === getData() && cache.has(key)) return cache.get(key)!;
  const company = data.companyById.get(companyId);
  if (!company) throw new Error(`Unknown company ${companyId}`);
  const current = periodValues(companyId, p, data);
  const pp = comparisonPeriod(p, "prior");
  const yp = comparisonPeriod(p, "yoy");
  const res: CompanyAnalysis = {
    company,
    current,
    prior: pp ? compare(company, current, pp, data) : null,
    yoy: yp ? compare(company, current, yp, data) : null,
    budget: budgetBlock(companyId, current, data),
  };
  if (data === getData()) cache.set(key, res);
  return res;
}

/** The comparison block for a basis (budget falls back to YoY for growth metrics). */
export function comparisonFor(a: CompanyAnalysis, basis: "prior" | "yoy" | "budget"): ComparisonBlock | null {
  if (basis === "prior") return a.prior;
  return a.yoy;
}
