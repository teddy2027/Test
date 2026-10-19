/**
 * Budget upload: the company's approved monthly budget, so an uploaded company can show budget vs actual.
 * Same layout as the actuals template (one row per line, one column per month), fewer lines.
 */
import { LAST_MONTH, monthIndexFromKey, monthKey, monthLabel } from "../data/calendar";
import type { BudgetMonthly, Company } from "../data/types";
import { CHECK_TOLERANCE, parseAmount, parseCsv, type Issue } from "./csv";

export const BUDGET_LINES = [
  { code: "COMPANY_ID", label: "Company identifier (do not edit)", required: true },
  { code: "CURRENCY", label: "Reporting currency (do not edit)", required: true },
  { code: "BUDGET_REVENUE", label: "Budget — total revenue", required: true },
  { code: "BUDGET_COGS", label: "Budget — total COGS", required: true },
  { code: "BUDGET_OPEX", label: "Budget — total operating expenses", required: true },
  { code: "BUDGET_EBITDA", label: "Budget — EBITDA (check)", required: true },
  { code: "BUDGET_CASH_FROM_OPERATIONS", label: "Budget — cash from operations (optional)", required: false },
] as const;
const CODES = new Set<string>(BUDGET_LINES.map((l) => l.code));

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Whole-currency values per month for an example file. */
export type BudgetValues = { revenue: number; cogs: number; opex: number; cfo: number | null };

export function buildBudgetTemplate(company: Company, months: number[], filled?: Record<number, BudgetValues>): string {
  const out = [["line_code", "line_item", ...months.map(monthKey)].join(",")];
  for (const l of BUDGET_LINES) {
    const cells = months.map((m) => {
      if (l.code === "COMPANY_ID") return company.id;
      if (l.code === "CURRENCY") return company.baseCurrency;
      const f = filled?.[m];
      if (!f) return "";
      const v = { BUDGET_REVENUE: f.revenue, BUDGET_COGS: f.cogs, BUDGET_OPEX: f.opex, BUDGET_EBITDA: f.revenue - f.cogs - f.opex, BUDGET_CASH_FROM_OPERATIONS: f.cfo }[l.code];
      return v === null || v === undefined ? "" : String(v);
    });
    out.push([l.code, esc(l.label), ...cells.map(esc)].join(","));
  }
  return out.join("\n");
}

export function isBudgetFile(text: string): boolean {
  return parseCsv(text).some((r) => (r[0] ?? "").trim().toUpperCase().startsWith("BUDGET_"));
}

export interface BudgetResult {
  ok: boolean;
  rows: BudgetMonthly[];
  errors: Issue[];
  warnings: Issue[];
  replacedMonths: number[];
}

/** Validates a budget file. `existing` = the company's current local-currency budget rows (to flag replacements). */
export function validateBudget(text: string, company: Company, existing: BudgetMonthly[]): BudgetResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const rows = parseCsv(text);
  const fail = (message: string): BudgetResult => ({ ok: false, rows: [], errors: [{ level: "error", message }], warnings: [], replacedMonths: [] });
  if (rows.length < 2) return fail("The file is empty or is not a CSV.");
  const header = rows[0].map((h) => h.trim());
  if (header[0]?.toLowerCase() !== "line_code") return fail('The first column must be "line_code". Download the budget template for the expected layout.');
  const cols: { idx: number; month: number }[] = [];
  for (let i = 2; i < header.length; i++) {
    if (!header[i]) continue;
    if (!/^\d{4}-\d{2}$/.test(header[i])) {
      errors.push({ level: "error", message: `Column "${header[i]}" is not a month (expected YYYY-MM).` });
      continue;
    }
    const m = monthIndexFromKey(header[i]);
    if (m < 0) errors.push({ level: "error", message: `${header[i]} is before the reporting history (starts Jan 2024).` });
    else if (m > LAST_MONTH) warnings.push({ level: "warning", message: `${header[i]} is after the latest closed month (${monthLabel(LAST_MONTH)}) — kept out of this prototype, which has no data past ${monthLabel(LAST_MONTH)}.` });
    else cols.push({ idx: i, month: m });
  }
  const raw = new Map<string, string[]>();
  for (const r of rows.slice(1)) {
    const code = (r[0] ?? "").trim().toUpperCase();
    if (!code) continue;
    if (!CODES.has(code)) errors.push({ level: "error", message: `Unknown line code "${code}". Use the budget template.` });
    else raw.set(code, r);
  }
  const first = cols[0]?.idx ?? 2;
  const id = raw.get("COMPANY_ID")?.[first]?.trim();
  if (!id) errors.push({ level: "error", message: "COMPANY_ID row is missing — download the budget template for this company." });
  else if (id !== company.id) errors.push({ level: "error", message: `This budget is for "${id}", not ${company.name}.` });
  const cur = raw.get("CURRENCY")?.[first]?.trim();
  if (cur && cur !== company.baseCurrency) errors.push({ level: "error", message: `Budget currency ${cur} does not match ${company.name}'s reporting currency (${company.baseCurrency}).` });

  const out: BudgetMonthly[] = [];
  for (const { idx, month } of cols) {
    const key = monthKey(month);
    const g = (c: string) => {
      const v = parseAmount(raw.get(c)?.[idx] ?? "");
      if (Number.isNaN(v)) {
        errors.push({ level: "error", month, message: `${key} · ${c}: "${raw.get(c)?.[idx]}" is not a number.` });
        return null;
      }
      return v;
    };
    const rev = g("BUDGET_REVENUE");
    const cogs = g("BUDGET_COGS");
    const opex = g("BUDGET_OPEX");
    const ebitda = g("BUDGET_EBITDA");
    const cfo = g("BUDGET_CASH_FROM_OPERATIONS");
    for (const [v, c] of [[rev, "revenue"], [cogs, "COGS"], [opex, "operating expenses"], [ebitda, "EBITDA"]] as const)
      if (v === null) errors.push({ level: "error", month, message: `${key}: budget ${c} is required.` });
    if (rev !== null && cogs !== null && opex !== null && ebitda !== null && Math.abs(rev - cogs - opex - ebitda) > CHECK_TOLERANCE)
      errors.push({ level: "error", month, message: `${key}: budget EBITDA is ${ebitda.toLocaleString("en-US")} but revenue − COGS − opex = ${(rev - cogs - opex).toLocaleString("en-US")}.` });
    if (rev !== null && cogs !== null && opex !== null)
      out.push({ companyId: company.id, month, currency: company.baseCurrency, revenue: rev / 1e6, cogs: cogs / 1e6, operatingExpenses: opex / 1e6, ebitda: (rev - cogs - opex) / 1e6, cashFromOperations: cfo === null ? null : cfo / 1e6 });
  }
  if (!cols.length && !errors.length) errors.push({ level: "error", message: "No month columns up to the latest closed month." });
  if (out.some((r) => r.cashFromOperations === null)) warnings.push({ level: "warning", message: "No budgeted cash from operations for some months — cash flow vs budget will show N/A there." });
  const have = new Set(existing.map((b) => b.month));
  const replacedMonths = out.filter((r) => have.has(r.month)).map((r) => r.month);
  if (replacedMonths.length) warnings.push({ level: "warning", message: `Replaces the budget already held for ${replacedMonths.length} month${replacedMonths.length > 1 ? "s" : ""} (${monthLabel(replacedMonths[0])}${replacedMonths.length > 1 ? ` – ${monthLabel(replacedMonths[replacedMonths.length - 1])}` : ""}).` });
  return { ok: errors.length === 0 && out.length > 0, rows: out, errors, warnings, replacedMonths };
}
