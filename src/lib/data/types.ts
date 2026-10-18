import { z } from "zod";

/**
 * Normalised schema for the Portfolio Intelligence dataset.
 *
 * Accounting convention (applies to every monthly record):
 *   Revenue            = Subscription revenue + Services revenue
 *   COGS               = Direct labor + Other COGS          (direct labor lives ONLY in COGS)
 *   Gross profit       = Revenue − COGS
 *   Operating expenses = S&M + R&D + G&A + Other opex      (functional presentation)
 *   EBITDA             = Gross profit − Operating expenses
 *
 *   Operating personnel ("administrative labor") is a MEMO line: the personnel
 *   portion already contained within S&M, R&D and G&A. It is never added to
 *   EBITDA a second time. Total labor = Direct labor + Operating personnel,
 *   which is mutually exclusive by construction (COGS labor vs opex labor).
 *
 *   Cash from operations = EBITDA − Cash interest − Cash taxes − Increase in net working capital
 *   Cash (end)           = Cash (begin) + CFO − Capex − Acquisitions + Financing flows
 */

export const FundIdSchema = z.enum(["fund-ii", "fund-iii"]);
export type FundId = z.infer<typeof FundIdSchema>;

export const SectorSchema = z.enum(["Software", "Business Services"]);
export type Sector = z.infer<typeof SectorSchema>;

export const BusinessModelSchema = z.enum([
  "Subscription software",
  "Recurring managed services",
  "Project-based services",
  "Workforce & staffing",
  "Tech-enabled services",
]);
export type BusinessModel = z.infer<typeof BusinessModelSchema>;

/** "dualentry" = authorized ledger share; "upload" = monthly pack uploaded by the sponsor on the company's behalf. */
export const ConnectionSchema = z.enum(["dualentry", "upload"]);
export type ConnectionType = z.infer<typeof ConnectionSchema>;

export const CurrencySchema = z.enum(["USD", "GBP"]);
export type Currency = z.infer<typeof CurrencySchema>;

export const GeographySchema = z.enum(["North America", "UK & Europe"]);
export type Geography = z.infer<typeof GeographySchema>;

export const FundSchema = z.object({
  id: FundIdSchema,
  name: z.string(),
  shortName: z.string(),
  vintage: z.number().int(),
  committedCapitalUsdM: z.number().positive(),
  strategy: z.string(),
});
export type Fund = z.infer<typeof FundSchema>;

export const EntitySchema = z.object({
  id: z.string(),
  companyId: z.string(),
  name: z.string(),
  country: z.string(),
  currency: z.string(),
  role: z.enum(["Operating", "IP holding", "Shared services", "Acquired"]),
  sinceMonth: z.number().int(),
  transactionId: z.string().nullable(),
});
export type Entity = z.infer<typeof EntitySchema>;

export const CompanySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  fund: FundIdSchema,
  sector: SectorSchema,
  subsector: z.string(),
  businessModel: BusinessModelSchema,
  description: z.string(),
  headquarters: z.string(),
  geography: GeographySchema,
  investmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vintage: z.number().int(),
  ownership: z.string(),
  ownershipPct: z.number().min(0).max(100),
  baseCurrency: CurrencySchema,
  fiscalYearEnd: z.string(),
  accountingSystem: z.string(),
  connection: ConnectionSchema,
  entityCount: z.number().int().positive(),
  dataSource: z.string(),
  lastUpdated: z.string(),
  /** Last month with data; −1 when no data has arrived yet. */
  lastReportedMonth: z.number().int().min(-1),
  dataQuality: z.enum(["High", "Medium", "Low"]),
  hasArr: z.boolean(),
  financeLead: z.object({ name: z.string(), title: z.string(), email: z.string() }),
  /** True for companies added by the sponsor in this browser (not part of the generated demo portfolio). */
  userAdded: z.boolean().optional(),
  /** "partial" when the company shares only some legal entities' books (entity totals then differ from consolidated). */
  entityShare: z.enum(["all", "partial"]).optional(),
  definitionNotes: z.array(z.object({ kind: z.enum(["definition", "context"]), text: z.string() })),
  missingFields: z.array(z.string()),
  closeDays: z.number().int().nullable(),
});
export type Company = z.infer<typeof CompanySchema>;

const num = z.number().finite();
const nullableNum = num.nullable();

export const MonthlyFinancialSchema = z.object({
  companyId: z.string(),
  month: z.number().int(),
  currency: CurrencySchema,
  revenue: num,
  subscriptionRevenue: nullableNum,
  servicesRevenue: nullableNum,
  directLabor: nullableNum,
  otherCogs: nullableNum,
  cogs: num,
  grossProfit: num,
  salesMarketing: num,
  researchDevelopment: nullableNum,
  generalAdmin: num,
  otherOpex: num,
  operatingExpenses: num,
  smPersonnel: nullableNum,
  rdPersonnel: nullableNum,
  gaPersonnel: nullableNum,
  operatingPersonnel: nullableNum,
  ebitda: num,
  cashInterest: nullableNum,
  cashTaxes: nullableNum,
  changeInNwc: nullableNum,
  cashFromOperations: nullableNum,
  capex: nullableNum,
  acquisitions: nullableNum,
  financingFlows: nullableNum,
  cashBegin: nullableNum,
  cashEnd: nullableNum,
  accountsReceivable: nullableNum,
  deferredRevenue: nullableNum,
  accountsPayable: nullableNum,
  debt: nullableNum,
});
export type MonthlyFinancial = z.infer<typeof MonthlyFinancialSchema>;

export const BudgetMonthlySchema = z.object({
  companyId: z.string(),
  month: z.number().int(),
  currency: CurrencySchema,
  revenue: num,
  cogs: num,
  operatingExpenses: num,
  ebitda: num,
  cashFromOperations: nullableNum,
});
export type BudgetMonthly = z.infer<typeof BudgetMonthlySchema>;

export const OperationalMonthlySchema = z.object({
  companyId: z.string(),
  month: z.number().int(),
  /** Period-end headcount; null when an uploaded pack does not report it. */
  employees: z.number().int().nonnegative().nullable(),
  billableHeadcount: z.number().int().nullable(),
  utilization: nullableNum,
  arr: nullableNum,
  customers: z.number().int().nullable(),
  netRevenueRetention: nullableNum,
});
export type OperationalMonthly = z.infer<typeof OperationalMonthlySchema>;

export const EntityMonthlySchema = z.object({
  companyId: z.string(),
  entityId: z.string(),
  month: z.number().int(),
  externalRevenue: num,
  intercompanyRevenue: num,
  intercompanyCost: num,
  ebitda: num,
});
export type EntityMonthly = z.infer<typeof EntityMonthlySchema>;

export const TransactionSchema = z.object({
  id: z.string(),
  platformId: z.string(),
  target: z.string(),
  type: z.enum(["Add-on acquisition", "Tuck-in acquisition"]),
  announced: z.string(),
  closed: z.string().nullable(),
  closeMonth: z.number().int().nullable(),
  integrationStatus: z.enum(["Integrated", "Integrating", "Pending close"]),
  annualizedRevenueUsdM: num,
  perimeterImpact: z.string(),
  entityId: z.string().nullable(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

export const FxRateSchema = z.object({
  currency: CurrencySchema,
  month: z.number().int(),
  average: num.positive(),
  closing: num.positive(),
});
export type FxRate = z.infer<typeof FxRateSchema>;

export interface Dataset {
  firm: { name: string; disclaimer: string };
  funds: Fund[];
  companies: Company[];
  entities: Entity[];
  /** Local (functional) currency records as submitted by the company. */
  monthlyLocal: MonthlyFinancial[];
  /** USD-translated records used by every portfolio-level calculation. */
  monthly: MonthlyFinancial[];
  budgetsLocal: BudgetMonthly[];
  budgets: BudgetMonthly[];
  operational: OperationalMonthly[];
  entityMonthly: EntityMonthly[];
  transactions: Transaction[];
  fx: FxRate[];
}
