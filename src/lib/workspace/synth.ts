/**
 * Synthetic data for companies added in the prototype.
 *  • A DualEntry company's "ledger" is generated once the company approves sharing (simulating the sync).
 *  • Example upload files are generated so a demo user has a realistic pack to upload.
 * Both reuse the main generator and a demo-portfolio company with the same business model as a template.
 */
import { LAST_MONTH } from "../data/calendar";
import { buildCompany, buildFx, type Built } from "../data/generate";
import { COMPANY_SEEDS, type CompanySeed } from "../data/seed";
import type { BusinessModel, Company, FxRate } from "../data/types";
import type { NewCompanyInput } from "./types";

const TEMPLATE: Record<BusinessModel, string> = {
  "Subscription software": "cedar-cloud",
  "Recurring managed services": "harbor-operations",
  "Project-based services": "crestpoint-consulting",
  "Workforce & staffing": "apex-workforce",
  "Tech-enabled services": "bluepeak-solutions",
};

let gbpCache: Map<number, FxRate> | null = null;
function gbp() {
  if (!gbpCache) gbpCache = new Map(buildFx().filter((r) => r.currency === "GBP").map((r) => [r.month, r]));
  return gbpCache;
}

const ENTITY_SUFFIXES = [
  { suffix: "Inc.", country: "United States", currency: "USD" },
  { suffix: "Ltd", country: "United Kingdom", currency: "GBP" },
  { suffix: "Canada ULC", country: "Canada", currency: "CAD" },
  { suffix: "GmbH", country: "Germany", currency: "EUR" },
  { suffix: "Pty Ltd", country: "Australia", currency: "AUD" },
  { suffix: "B.V.", country: "Netherlands", currency: "EUR" },
];

export function companyIdFor(name: string, taken: Set<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "company";
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  return id;
}

function ttmRevenue(b: Built): number {
  return b.monthlyLocal.filter((r) => r.month > LAST_MONTH - 12).reduce((s, r) => s + r.revenue, 0);
}

/** Builds a generator seed for a sponsor-added company, scaled to the approximate revenue entered. */
export function seedForAdded(company: Company, input: NewCompanyInput): CompanySeed {
  const template = COMPANY_SEEDS.find((s) => s.master.id === TEMPLATE[input.businessModel])!;
  const bare: CompanySeed = { ...template, acquisitions: [], reclass: undefined, reportedThrough: LAST_MONTH, laborSplitProvided: true, hasBudget: true, budgetCashFlowProvided: true };
  const k = Math.max(0.05, input.approxRevenueUsdM) / ttmRevenue(buildCompany(bare, gbp()));
  const n = Math.max(1, Math.min(6, Math.round(input.entityCount)));
  const shares = Array.from({ length: n }, (_, i) => (i === 0 ? 0.7 : 0.3 / Math.max(1, n - 1)));
  const { vintage: _v, lastReportedMonth: _l, ...master } = company;
  void _v;
  void _l;
  return {
    ...bare,
    master: { ...master, baseCurrency: "USD", hasArr: input.businessModel === "Subscription software" },
    stream: { ...bare.stream, base: bare.stream.base * k },
    debt0: bare.debt0 * k,
    amortization: bare.amortization * k,
    cash0: Math.max(1, bare.cash0 * k),
    entities:
      company.connection === "dualentry"
        ? ENTITY_SUFFIXES.slice(0, n).map((e, i) => ({ name: `${company.name} ${e.suffix}`, country: e.country, currency: e.currency, role: "Operating" as const, share: shares[i], icRevenuePct: 0 }))
        : undefined,
    utilization: bare.utilization,
    nrr: bare.nrr,
  };
}

export function buildAddedCompany(company: Company, input: NewCompanyInput): Built {
  return buildCompany(seedForAdded(company, input), gbp());
}

/** Full, unfiltered generated history for a demo-portfolio company (used for realistic example upload files). */
export function fullHistoryForSeeded(companyId: string): Built | null {
  const seed = COMPANY_SEEDS.find((s) => s.master.id === companyId);
  if (!seed) return null;
  return buildCompany({ ...seed, reportedThrough: LAST_MONTH }, gbp());
}

export function entityNamesFor(company: Company): string[] {
  const n = Math.max(1, Math.min(6, Math.round(company.entityCount)));
  return ENTITY_SUFFIXES.slice(0, n).map((e) => `${company.name} ${e.suffix}`);
}
