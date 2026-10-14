import type { BusinessModel, Company, FundId, Geography, Sector } from "../data/types";

export interface Filters {
  funds: FundId[];
  sectors: Sector[];
  businessModels: BusinessModel[];
  vintages: number[];
  geographies: Geography[];
  /** Inclusive ISO date bounds on the initial investment date. */
  investedFrom: string | null;
  investedTo: string | null;
}

export const EMPTY_FILTERS: Filters = {
  funds: [],
  sectors: [],
  businessModels: [],
  vintages: [],
  geographies: [],
  investedFrom: null,
  investedTo: null,
};

export function activeFilterCount(f: Filters): number {
  return (
    (f.funds.length ? 1 : 0) +
    (f.sectors.length ? 1 : 0) +
    (f.businessModels.length ? 1 : 0) +
    (f.vintages.length ? 1 : 0) +
    (f.geographies.length ? 1 : 0) +
    (f.investedFrom || f.investedTo ? 1 : 0)
  );
}

export function matchesFilters(c: Company, f: Filters): boolean {
  if (f.funds.length && !f.funds.includes(c.fund)) return false;
  if (f.sectors.length && !f.sectors.includes(c.sector)) return false;
  if (f.businessModels.length && !f.businessModels.includes(c.businessModel)) return false;
  if (f.vintages.length && !f.vintages.includes(c.vintage)) return false;
  if (f.geographies.length && !f.geographies.includes(c.geography)) return false;
  if (f.investedFrom && c.investmentDate < f.investedFrom) return false;
  if (f.investedTo && c.investmentDate > f.investedTo) return false;
  return true;
}

export function applyFilters(companies: Company[], f: Filters): Company[] {
  return companies.filter((c) => matchesFilters(c, f));
}

export function describeFilters(f: Filters, fundNames: Record<string, string>): string {
  const parts: string[] = [];
  if (f.funds.length) parts.push(`Fund: ${f.funds.map((x) => fundNames[x] ?? x).join(", ")}`);
  if (f.sectors.length) parts.push(`Industry: ${f.sectors.join(", ")}`);
  if (f.businessModels.length) parts.push(`Business model: ${f.businessModels.join(", ")}`);
  if (f.vintages.length) parts.push(`Vintage: ${f.vintages.join(", ")}`);
  if (f.geographies.length) parts.push(`Geography: ${f.geographies.join(", ")}`);
  if (f.investedFrom || f.investedTo) parts.push(`Invested: ${f.investedFrom ?? "…"} to ${f.investedTo ?? "…"}`);
  return parts.length ? parts.join(" · ") : "All portfolio companies";
}
