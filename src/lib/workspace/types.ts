/**
 * The sponsor's workspace: everything a user adds or does in the prototype on top of the
 * generated demo portfolio. Saved in the browser (localStorage) — there is no database.
 */
import type { BudgetMonthly, BusinessModel, Company, FundId, Geography, MonthlyFinancial, Sector } from "../data/types";
import type { MapTarget } from "./mapping";

export interface NewCompanyInput {
  name: string;
  fund: FundId;
  ownershipPct: number;
  investmentDate: string; // YYYY-MM-DD
  sector: Sector;
  subsector: string;
  businessModel: BusinessModel;
  fiscalYearEnd: string;
  geography: Geography;
  headquarters: string;
  entityCount: number;
  accountingSystem: string; // "DualEntry" when on DualEntry
  onDualEntry: boolean;
  approxRevenueUsdM: number;
  cfoName: string;
  cfoTitle: string;
  cfoEmail: string;
  historyFrom: number; // month index requested for backfill
  deadlineBusinessDays: number;
}

export interface AddedCompany {
  company: Company;
  input: NewCompanyInput;
  addedAt: string;
}

/** One accepted monthly upload (a file covering one or more months). */
export interface Submission {
  id: string;
  companyId: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  months: number[];
  /** Local-currency records, one per month. */
  rows: MonthlyFinancial[];
  operational: { month: number; employees: number | null; arr: number | null }[];
  restatedMonths: number[];
  restatementReason: string | null;
  warnings: number;
}

export interface BudgetSubmission {
  id: string;
  companyId: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  months: number[];
  /** Local-currency budget rows, one per month. */
  rows: BudgetMonthly[];
}

export type Granularity = "summary" | "detailed" | "entity";

/** What the company agreed to share with the sponsor (set by the company, read-only for the sponsor). */
export interface ShareScope {
  entities: string[]; // entity names shared at entity level
  granularity: Granularity;
  cashFlow: boolean;
  budget: boolean;
  timing: "closed" | "preliminary";
  hiddenAccounts: string[];
  audience: string[];
  approvedBy: string;
  secondApprover: string | null;
  approvedAt: string;
}

export interface ConnectionRequest {
  companyId: string;
  token: string;
  requestedAt: string;
  requestedBy: string;
  status: "pending" | "approved" | "declined";
  scope: ShareScope | null;
  decidedAt: string | null;
}

export type MigrationStage =
  | "not_started"
  | "introduced"
  | "call_booked"
  | "call_held"
  | "evaluating"
  | "migrating"
  | "connected"
  | "declined";

export interface MigrationEvent {
  at: string;
  stage: MigrationStage;
  label: string;
  by: "sponsor" | "cfo" | "dualentry";
}

export interface MigrationState {
  companyId: string;
  stage: MigrationStage;
  repId: string | null;
  token: string | null;
  introducedAt: string | null;
  booking: { slot: string; name: string; email: string } | null;
  /** The CFO activated a DualEntry sandbox (sample data only) from the invite page. */
  sandbox: { name: string; email: string; at: string } | null;
  history: MigrationEvent[];
}

export interface Workspace {
  companies: AddedCompany[];
  submissions: Submission[];
  budgetSubmissions: BudgetSubmission[];
  requests: ConnectionRequest[];
  migration: Record<string, MigrationState>;
  /** Per company: the company's own account name → portfolio line, remembered from earlier uploads. */
  mappings: Record<string, Record<string, MapTarget>>;
}

export const EMPTY_WORKSPACE: Workspace = { companies: [], submissions: [], budgetSubmissions: [], requests: [], migration: {}, mappings: {} };
