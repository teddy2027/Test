/**
 * Uploading a company's own export (its chart of accounts, not our template).
 *
 * Layout: first column = the company's account name, then one column per month (YYYY-MM), e.g. a NetSuite or
 * QuickBooks P&L export. Each account is mapped once to a portfolio line; the mapping is remembered per company,
 * so next month's export maps itself. The mapped file is converted to the standard template and then goes
 * through exactly the same validation as a template upload.
 */
import { monthIndexFromKey, monthKey } from "../data/calendar";
import type { Company } from "../data/types";
import { buildTemplate, parseAmount, parseCsv, type MonthValues } from "./csv";

/** Where an account's amounts go. Personnel targets also feed the "of which personnel" memo lines. */
export type MapTarget =
  | "REVENUE_SUBSCRIPTION"
  | "REVENUE_SERVICES"
  | "TOTAL_REVENUE"
  | "COGS_DIRECT_LABOR"
  | "COGS_OTHER"
  | "SM_PERSONNEL"
  | "SM_OTHER"
  | "RD_PERSONNEL"
  | "RD_OTHER"
  | "GA_PERSONNEL"
  | "GA_OTHER"
  | "OPEX_OTHER"
  | "CASH_FROM_OPERATIONS"
  | "CAPEX"
  | "CASH_BALANCE"
  | "HEADCOUNT"
  | "ARR"
  | "EXCLUDE"
  | "IGNORE";

export const TARGETS: { value: MapTarget; label: string; group: string }[] = [
  { value: "REVENUE_SUBSCRIPTION", label: "Subscription revenue", group: "Revenue" },
  { value: "REVENUE_SERVICES", label: "Services revenue", group: "Revenue" },
  { value: "TOTAL_REVENUE", label: "Total revenue (subtotal — used as a check)", group: "Revenue" },
  { value: "COGS_DIRECT_LABOR", label: "COGS — direct labor", group: "Cost of revenue" },
  { value: "COGS_OTHER", label: "COGS — other", group: "Cost of revenue" },
  { value: "SM_PERSONNEL", label: "Sales & marketing — personnel", group: "Operating expenses" },
  { value: "SM_OTHER", label: "Sales & marketing — other", group: "Operating expenses" },
  { value: "RD_PERSONNEL", label: "R&D — personnel", group: "Operating expenses" },
  { value: "RD_OTHER", label: "R&D — other", group: "Operating expenses" },
  { value: "GA_PERSONNEL", label: "G&A — personnel", group: "Operating expenses" },
  { value: "GA_OTHER", label: "G&A — other", group: "Operating expenses" },
  { value: "OPEX_OTHER", label: "Other operating expenses", group: "Operating expenses" },
  { value: "CASH_FROM_OPERATIONS", label: "Cash from operations", group: "Cash & other" },
  { value: "CAPEX", label: "Capital expenditure", group: "Cash & other" },
  { value: "CASH_BALANCE", label: "Cash balance (month end)", group: "Cash & other" },
  { value: "HEADCOUNT", label: "Headcount (month end)", group: "Cash & other" },
  { value: "ARR", label: "ARR (month end)", group: "Cash & other" },
  { value: "EXCLUDE", label: "Exclude — one-off / non-operating", group: "Leave out" },
  { value: "IGNORE", label: "Ignore — subtotal or heading", group: "Leave out" },
];
export const TARGET_LABEL = Object.fromEntries(TARGETS.map((t) => [t.value, t.label])) as Record<MapTarget, string>;

export interface ExportRow {
  account: string;
  values: Record<number, number | null>;
}
export interface CompanyExport {
  months: number[];
  rows: ExportRow[];
  errors: string[];
}

/** True when a CSV is the standard template (first header cell "line_code"); otherwise it is treated as a company export. */
export function isTemplate(text: string): boolean {
  return (parseCsv(text)[0]?.[0] ?? "").trim().toLowerCase() === "line_code";
}

export function parseCompanyExport(text: string): CompanyExport {
  const rows = parseCsv(text);
  const errors: string[] = [];
  if (rows.length < 2) return { months: [], rows: [], errors: ["The file is empty or is not a CSV."] };
  const header = rows[0].map((h) => h.trim());
  const cols: { idx: number; month: number }[] = [];
  for (let i = 1; i < header.length; i++) {
    if (/^\d{4}-\d{2}$/.test(header[i])) cols.push({ idx: i, month: monthIndexFromKey(header[i]) });
  }
  if (!cols.length) errors.push('No month columns found. Columns must be labelled YYYY-MM (e.g. 2026-09); the first column holds the account names.');
  const out: ExportRow[] = [];
  const seen = new Set<string>();
  for (const r of rows.slice(1)) {
    const account = (r[0] ?? "").trim();
    if (!account) continue;
    if (seen.has(account.toLowerCase())) {
      errors.push(`Account "${account}" appears more than once.`);
      continue;
    }
    seen.add(account.toLowerCase());
    const values: Record<number, number | null> = {};
    for (const c of cols) {
      const v = parseAmount(r[c.idx] ?? "");
      if (Number.isNaN(v)) errors.push(`${account} · ${monthKey(c.month)}: "${r[c.idx]}" is not a number.`);
      values[c.month] = Number.isNaN(v) ? null : v;
    }
    out.push({ account, values });
  }
  return { months: cols.map((c) => c.month), rows: out, errors };
}

/** Keyword suggestions for accounts never seen before. Order matters: the first match wins. */
const RULES: [RegExp, MapTarget][] = [
  [/^total (net )?revenue|^revenue,? total|^total sales$/i, "TOTAL_REVENUE"],
  [/^total\b|subtotal|net income|operating income|gross (profit|margin)/i, "IGNORE"],
  [/one[- ]?off|transaction cost|acquisition cost|deal cost|restructur|interest|tax|depreciation|amorti[sz]ation|gain|loss on/i, "EXCLUDE"],
  [/subscription|saas|recurring revenue|licen[cs]e/i, "REVENUE_SUBSCRIPTION"],
  [/revenue|sales$|fees earned|income from services/i, "REVENUE_SERVICES"],
  [/direct (wage|labou?r|salar|payroll)|billable|delivery staff|technician/i, "COGS_DIRECT_LABOR"],
  [/subcontract|hosting|materials|cost of (sales|goods|revenue)|cogs/i, "COGS_OTHER"],
  [/(sales|marketing).*(salar|wage|payroll|commission|staff)|commission/i, "SM_PERSONNEL"],
  [/marketing|advertis|events|lead gen/i, "SM_OTHER"],
  [/(r&d|research|engineering|product).*(salar|wage|payroll|staff)/i, "RD_PERSONNEL"],
  [/r&d|research|engineering tools|software tools/i, "RD_OTHER"],
  [/(admin|g&a|finance|hr|executive|office).*(salar|wage|payroll|staff)|salar|payroll|wages/i, "GA_PERSONNEL"],
  [/rent|office|professional fees|legal|audit|insurance|it |software|admin/i, "GA_OTHER"],
  [/cash (from|provided by) operat|operating cash/i, "CASH_FROM_OPERATIONS"],
  [/capex|capital expend/i, "CAPEX"],
  [/cash (balance|at|on hand)|closing cash/i, "CASH_BALANCE"],
  [/headcount|fte|employees/i, "HEADCOUNT"],
  [/\barr\b|annual recurring/i, "ARR"],
  [/other|travel|utilities|bad debt/i, "OPEX_OTHER"],
];

export type MappingSource = "remembered" | "suggested" | "manual" | "none";

export function suggestTarget(account: string): MapTarget | null {
  const clean = account.replace(/^\d+[\s.-]*/, "");
  for (const [re, t] of RULES) if (re.test(clean)) return t;
  return null;
}

/** Remembered mapping first, then a keyword suggestion; null when nothing fits. */
export function initialMapping(rows: ExportRow[], remembered: Record<string, MapTarget> | undefined): { mapping: Record<string, MapTarget | null>; source: Record<string, MappingSource> } {
  const mapping: Record<string, MapTarget | null> = {};
  const source: Record<string, MappingSource> = {};
  for (const r of rows) {
    const mem = remembered?.[r.account];
    const sug = mem ? null : suggestTarget(r.account);
    mapping[r.account] = mem ?? sug;
    source[r.account] = mem ? "remembered" : sug ? "suggested" : "none";
  }
  return { mapping, source };
}

/**
 * Converts a mapped company export into the standard template, so it is validated exactly like a template upload.
 * Components are summed per line; COGS_TOTAL, GROSS_PROFIT and EBITDA are derived; TOTAL_REVENUE comes from the
 * company's own subtotal when one is mapped (so a wrong mapping is caught by the revenue check).
 */
export function toTemplate(company: Company, exp: CompanyExport, mapping: Record<string, MapTarget | null>): string {
  const filled: Record<number, MonthValues> = {};
  for (const m of exp.months) {
    const sum = (targets: MapTarget[]): number | null => {
      const rows = exp.rows.filter((r) => targets.includes(mapping[r.account] as MapTarget));
      if (!rows.length) return null;
      return rows.reduce((s, r) => s + (r.values[m] ?? 0), 0);
    };
    const zero = (v: number | null) => v ?? 0;
    const personnelMapped = (t: MapTarget) => exp.rows.some((r) => mapping[r.account] === t);
    const v: MonthValues = {
      REVENUE_SUBSCRIPTION: sum(["REVENUE_SUBSCRIPTION"]),
      REVENUE_SERVICES: sum(["REVENUE_SERVICES"]),
      COGS_DIRECT_LABOR: sum(["COGS_DIRECT_LABOR"]),
      COGS_OTHER: sum(["COGS_OTHER"]),
      OPEX_SALES_MARKETING: zero(sum(["SM_PERSONNEL", "SM_OTHER"])),
      OPEX_SM_PERSONNEL: personnelMapped("SM_PERSONNEL") ? sum(["SM_PERSONNEL"]) : null,
      OPEX_RD: sum(["RD_PERSONNEL", "RD_OTHER"]),
      OPEX_RD_PERSONNEL: personnelMapped("RD_PERSONNEL") ? sum(["RD_PERSONNEL"]) : null,
      OPEX_GENERAL_ADMIN: zero(sum(["GA_PERSONNEL", "GA_OTHER"])),
      OPEX_GA_PERSONNEL: personnelMapped("GA_PERSONNEL") ? sum(["GA_PERSONNEL"]) : null,
      OPEX_OTHER: zero(sum(["OPEX_OTHER"])),
      CASH_FROM_OPERATIONS: sum(["CASH_FROM_OPERATIONS"]),
      CAPEX: sum(["CAPEX"]),
      CASH_BALANCE: sum(["CASH_BALANCE"]),
      HEADCOUNT: sum(["HEADCOUNT"]),
      ARR: sum(["ARR"]),
    };
    // A labor split needs both COGS components: with direct labor only, the rest of COGS is "other".
    if (v.COGS_DIRECT_LABOR !== null && v.COGS_OTHER === null) v.COGS_OTHER = 0;
    if (v.COGS_DIRECT_LABOR === null && v.COGS_OTHER !== null) {
      v.COGS_TOTAL = v.COGS_OTHER;
      v.COGS_OTHER = null;
    }
    const subtotal = sum(["TOTAL_REVENUE"]);
    if (subtotal !== null) v.TOTAL_REVENUE = subtotal;
    filled[m] = v;
  }
  return buildTemplate(company, exp.months, filled, { keepProvidedChecks: true });
}

/** Share of accounts in a file that the remembered mapping already knows — a guard against uploading the wrong company's export. */
export function knownShare(rows: ExportRow[], remembered: Record<string, MapTarget> | undefined): number | null {
  if (!remembered || !Object.keys(remembered).length || !rows.length) return null;
  return rows.filter((r) => r.account in remembered).length / rows.length;
}

// ---------------------------------------------------------------- example export (synthetic)

/** A synthetic P&L export in the company's own account names, built from template values, for trying the mapping step. */
export function buildCompanyExport(company: Company, months: number[], values: Record<number, MonthValues>): string {
  const n = (m: number, k: string) => (typeof values[m]?.[k] === "number" ? (values[m][k] as number) : 0);
  const has = (k: string) => months.some((m) => typeof values[m]?.[k] === "number");
  const split = (m: number, k: string, share: number) => Math.round(n(m, k) * share);
  const lines: [string, (m: number) => number | null][] = [];
  if (has("REVENUE_SUBSCRIPTION")) lines.push(["4000 Subscription revenue", (m) => n(m, "REVENUE_SUBSCRIPTION")]);
  lines.push(["4100 Professional services revenue", (m) => n(m, "REVENUE_SERVICES")]);
  lines.push(["Total revenue", (m) => n(m, "REVENUE_SUBSCRIPTION") + n(m, "REVENUE_SERVICES")]);
  if (has("COGS_DIRECT_LABOR")) lines.push(["5000 Direct wages", (m) => n(m, "COGS_DIRECT_LABOR")]);
  lines.push(["5100 Subcontractors", (m) => split(m, "COGS_OTHER", 0.6)]);
  lines.push(["5200 Hosting and materials", (m) => n(m, "COGS_OTHER") - split(m, "COGS_OTHER", 0.6)]);
  lines.push(["6000 Sales salaries and commissions", (m) => n(m, "OPEX_SM_PERSONNEL")]);
  lines.push(["6050 Marketing programs", (m) => n(m, "OPEX_SALES_MARKETING") - n(m, "OPEX_SM_PERSONNEL")]);
  if (has("OPEX_RD")) {
    lines.push(["6100 Engineering salaries", (m) => n(m, "OPEX_RD_PERSONNEL")]);
    lines.push(["6150 R&D tools and cloud", (m) => n(m, "OPEX_RD") - n(m, "OPEX_RD_PERSONNEL")]);
  }
  const gaOther = (m: number) => n(m, "OPEX_GENERAL_ADMIN") - n(m, "OPEX_GA_PERSONNEL");
  lines.push(["6200 Admin and finance salaries", (m) => n(m, "OPEX_GA_PERSONNEL")]);
  lines.push(["6250 Rent and office", (m) => Math.round(gaOther(m) * 0.45)]);
  lines.push(["6300 Professional fees", (m) => gaOther(m) - Math.round(gaOther(m) * 0.45)]);
  lines.push(["6400 Travel and other", (m) => n(m, "OPEX_OTHER")]);
  // A one-off cost the portfolio view should exclude from operating figures.
  lines.push(["6900 Transaction costs (one-off)", (m) => (m === months[months.length - 1] ? 85000 : 0)]);
  if (has("CASH_FROM_OPERATIONS")) lines.push(["Cash from operating activities", (m) => n(m, "CASH_FROM_OPERATIONS")]);
  if (has("CASH_BALANCE")) lines.push(["Closing cash balance", (m) => n(m, "CASH_BALANCE")]);
  if (has("HEADCOUNT")) lines.push(["Headcount (FTE)", (m) => n(m, "HEADCOUNT")]);
  const out = [["Account", ...months.map(monthKey)].join(",")];
  for (const [label, f] of lines) out.push([label, ...months.map((m) => String(f(m) ?? ""))].join(","));
  return `${out.join("\n")}\n`;
}
