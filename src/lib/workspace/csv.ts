/**
 * Monthly reporting template (CSV) and its validator.
 *
 * Layout ("wide", as finance teams fill packs): one row per line item, one column per month.
 *   line_code,line_item,2026-07,2026-08,2026-09
 * Amounts in the company's reporting currency, whole units (not thousands). Blank = not provided.
 * Control totals (TOTAL_REVENUE, COGS_TOTAL, GROSS_PROFIT, EBITDA) are cross-checked against their components.
 */
import { LAST_MONTH, monthIndexFromKey, monthKey, monthLabel } from "../data/calendar";
import type { Company, MonthlyFinancial } from "../data/types";

export type LineKind = "id" | "amount" | "count" | "note" | "check";

export interface LineDef {
  code: string;
  label: string;
  kind: LineKind;
  required: boolean;
  help: string;
}

export const LINES: LineDef[] = [
  { code: "COMPANY_ID", label: "Company identifier (do not edit)", kind: "id", required: true, help: "Prevents uploading one company's pack to another." },
  { code: "CURRENCY", label: "Reporting currency (do not edit)", kind: "id", required: true, help: "Amounts are in this currency." },
  { code: "REVENUE_SUBSCRIPTION", label: "Subscription revenue", kind: "amount", required: false, help: "Recognized subscription revenue (not ARR)." },
  { code: "REVENUE_SERVICES", label: "Services revenue", kind: "amount", required: false, help: "All non-subscription revenue." },
  { code: "TOTAL_REVENUE", label: "Total revenue (check)", kind: "check", required: true, help: "Must equal subscription + services." },
  { code: "COGS_DIRECT_LABOR", label: "COGS — direct labor", kind: "amount", required: false, help: "Delivery personnel cost. Needed for labor metrics." },
  { code: "COGS_OTHER", label: "COGS — other", kind: "amount", required: false, help: "Hosting, subcontractors, materials." },
  { code: "COGS_TOTAL", label: "Total COGS (check)", kind: "check", required: true, help: "Must equal direct labor + other when the split is provided." },
  { code: "GROSS_PROFIT", label: "Gross profit (check)", kind: "check", required: true, help: "Must equal total revenue − total COGS." },
  { code: "OPEX_SALES_MARKETING", label: "Sales & marketing", kind: "amount", required: true, help: "" },
  { code: "OPEX_SM_PERSONNEL", label: "  of which personnel", kind: "amount", required: false, help: "Memo — already included above." },
  { code: "OPEX_RD", label: "Research & development", kind: "amount", required: false, help: "Software companies." },
  { code: "OPEX_RD_PERSONNEL", label: "  of which personnel", kind: "amount", required: false, help: "Memo — already included above." },
  { code: "OPEX_GENERAL_ADMIN", label: "General & administrative", kind: "amount", required: true, help: "" },
  { code: "OPEX_GA_PERSONNEL", label: "  of which personnel", kind: "amount", required: false, help: "Memo — already included above." },
  { code: "OPEX_OTHER", label: "Other operating expenses", kind: "amount", required: true, help: "Use 0 if none." },
  { code: "EBITDA", label: "EBITDA (check)", kind: "check", required: true, help: "Must equal gross profit − operating expenses." },
  { code: "CASH_FROM_OPERATIONS", label: "Cash from operations", kind: "amount", required: false, help: "Reported operating cash flow. Never approximated by EBITDA." },
  { code: "CAPEX", label: "Capital expenditure", kind: "amount", required: false, help: "Positive number." },
  { code: "CASH_BALANCE", label: "Cash balance (month end)", kind: "amount", required: false, help: "" },
  { code: "HEADCOUNT", label: "Headcount (month end)", kind: "count", required: false, help: "FTE." },
  { code: "ARR", label: "ARR (month end)", kind: "amount", required: false, help: "Subscription businesses only: 12 × month-end MRR." },
  { code: "NOTE", label: "Notes (explain unusual movements)", kind: "note", required: false, help: "Free text." },
];
const BY_CODE = new Map(LINES.map((l) => [l.code, l]));

/** Tolerance for control totals, in currency units. */
export const CHECK_TOLERANCE = 1;
/** Revenue swing vs the prior month that requires a note. */
export const SWING_WARN = 0.25;

// ---------------------------------------------------------------- CSV helpers

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const t = text.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"' && t[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** "1,234", "(1,234)", "$1234.50", "-12" → number; "" → null; anything else → NaN. */
export function parseAmount(raw: string): number | null {
  const s = raw.trim();
  if (s === "") return null;
  const neg = /^\(.*\)$/.test(s);
  const cleaned = s.replace(/[()$£€,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return NaN;
  const v = Number(cleaned);
  return neg ? -v : v;
}

// ---------------------------------------------------------------- template

/** Values per month (whole currency units) used to pre-fill example files. */
export type MonthValues = Record<string, number | string | null>;

export function recordToValues(r: MonthlyFinancial, op: { employees: number | null; arr: number | null } | undefined): MonthValues {
  const u = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v * 1e6));
  return {
    REVENUE_SUBSCRIPTION: u(r.subscriptionRevenue),
    REVENUE_SERVICES: u(r.servicesRevenue),
    COGS_DIRECT_LABOR: u(r.directLabor),
    COGS_OTHER: u(r.otherCogs),
    OPEX_SALES_MARKETING: u(r.salesMarketing),
    OPEX_SM_PERSONNEL: u(r.smPersonnel),
    OPEX_RD: u(r.researchDevelopment),
    OPEX_RD_PERSONNEL: u(r.rdPersonnel),
    OPEX_GENERAL_ADMIN: u(r.generalAdmin),
    OPEX_GA_PERSONNEL: u(r.gaPersonnel),
    OPEX_OTHER: u(r.otherOpex),
    CASH_FROM_OPERATIONS: u(r.cashFromOperations),
    CAPEX: u(r.capex),
    CASH_BALANCE: u(r.cashEnd),
    HEADCOUNT: op?.employees ?? null,
    ARR: u(op?.arr),
  };
}

/** Completes control totals from components so example files reconcile exactly. */
function withChecks(v: MonthValues): MonthValues {
  const n = (k: string) => (typeof v[k] === "number" ? (v[k] as number) : 0);
  const rev = n("REVENUE_SUBSCRIPTION") + n("REVENUE_SERVICES");
  const cogs = n("COGS_DIRECT_LABOR") + n("COGS_OTHER");
  const gp = rev - cogs;
  const opex = n("OPEX_SALES_MARKETING") + n("OPEX_RD") + n("OPEX_GENERAL_ADMIN") + n("OPEX_OTHER");
  return { ...v, TOTAL_REVENUE: rev, COGS_TOTAL: cogs, GROSS_PROFIT: gp, EBITDA: gp - opex };
}

export function buildTemplate(company: Company, months: number[], filled?: Record<number, MonthValues>): string {
  const header = ["line_code", "line_item", ...months.map(monthKey)];
  const lines = LINES.filter((l) => (l.code !== "ARR" || company.hasArr || company.businessModel === "Subscription software") && (l.code !== "REVENUE_SUBSCRIPTION" || company.businessModel === "Subscription software" || company.hasArr) && (!l.code.startsWith("OPEX_RD") || company.sector === "Software"));
  const out = [header.join(",")];
  for (const l of lines) {
    const cells = months.map((m) => {
      if (l.code === "COMPANY_ID") return company.id;
      if (l.code === "CURRENCY") return company.baseCurrency;
      if (!filled?.[m]) return "";
      const v = withChecks(filled[m])[l.code];
      return v === null || v === undefined ? "" : String(v);
    });
    out.push([l.code, esc(l.label), ...cells.map((c) => esc(c))].join(","));
  }
  return out.join("\n");
}

// ---------------------------------------------------------------- validation

export interface Issue {
  level: "error" | "warning";
  message: string;
  month?: number;
}

export interface ParsedMonth {
  month: number;
  values: Record<string, number | null>;
  note: string;
  record: MonthlyFinancial;
  employees: number | null;
  arr: number | null;
}

export interface UploadResult {
  ok: boolean;
  months: ParsedMonth[];
  errors: Issue[];
  warnings: Issue[];
  restatedMonths: number[];
  newMonths: number[];
}

const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });

/**
 * Validates an uploaded pack against the company and its existing data.
 * `existing` are the company's current local-currency records by month (used for restatements and swings).
 */
export function validateUpload(text: string, company: Company, existing: (MonthlyFinancial | undefined)[]): UploadResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const rows = parseCsv(text);
  const fail = (message: string): UploadResult => ({ ok: false, months: [], errors: [{ level: "error", message }], warnings: [], restatedMonths: [], newMonths: [] });
  if (rows.length < 2) return fail("The file is empty or is not a CSV.");
  const header = rows[0].map((h) => h.trim());
  if (header[0]?.toLowerCase() !== "line_code") return fail('The first column must be "line_code". Download the template for the expected layout.');
  const monthCols: { idx: number; month: number }[] = [];
  const seen = new Set<number>();
  for (let i = 2; i < header.length; i++) {
    const h = header[i];
    if (!h) continue;
    if (!/^\d{4}-\d{2}$/.test(h)) {
      errors.push({ level: "error", message: `Column "${h}" is not a month (expected YYYY-MM, e.g. 2026-09).` });
      continue;
    }
    const m = monthIndexFromKey(h);
    if (m < 0) errors.push({ level: "error", message: `${h} is before the reporting history (starts Jan 2024).` });
    else if (m > LAST_MONTH) errors.push({ level: "error", message: `${h} has not closed yet — the latest closed month is ${monthLabel(LAST_MONTH)}.` });
    else if (seen.has(m)) errors.push({ level: "error", message: `${h} appears more than once.` });
    else {
      seen.add(m);
      monthCols.push({ idx: i, month: m });
    }
  }
  if (!monthCols.length && !errors.length) errors.push({ level: "error", message: "No month columns found." });

  const raw = new Map<string, string[]>();
  for (const r of rows.slice(1)) {
    const code = (r[0] ?? "").trim().toUpperCase();
    if (!code) continue;
    if (!BY_CODE.has(code)) {
      errors.push({ level: "error", message: `Unknown line code "${code}". Use the codes in the template.` });
      continue;
    }
    if (raw.has(code)) {
      errors.push({ level: "error", message: `Line ${code} appears more than once.` });
      continue;
    }
    raw.set(code, r);
  }
  const idCell = raw.get("COMPANY_ID")?.[monthCols[0]?.idx ?? 2]?.trim();
  if (!idCell) errors.push({ level: "error", message: "COMPANY_ID row is missing — download the template for this company." });
  else if (idCell !== company.id) errors.push({ level: "error", message: `This file is for "${idCell}", not ${company.name}. Check you picked the right pack.` });
  const cur = raw.get("CURRENCY")?.[monthCols[0]?.idx ?? 2]?.trim();
  if (cur && cur !== company.baseCurrency) errors.push({ level: "error", message: `File currency ${cur} does not match ${company.name}'s reporting currency (${company.baseCurrency}).` });

  const months: ParsedMonth[] = [];
  for (const { idx, month } of monthCols) {
    const key = monthKey(month);
    const v: Record<string, number | null> = {};
    for (const l of LINES) {
      if (l.kind === "id" || l.kind === "note") continue;
      const cell = raw.get(l.code)?.[idx] ?? "";
      const n = parseAmount(cell);
      if (Number.isNaN(n)) {
        errors.push({ level: "error", month, message: `${key} · ${l.code}: "${cell}" is not a number.` });
        v[l.code] = null;
      } else v[l.code] = n;
    }
    const note = (raw.get("NOTE")?.[idx] ?? "").trim();
    const g = (c: string) => v[c] ?? null;
    const req = (c: string) => {
      if (g(c) === null) errors.push({ level: "error", month, message: `${key}: ${BY_CODE.get(c)!.label.replace(" (check)", "")} (${c}) is required.` });
    };
    ["TOTAL_REVENUE", "COGS_TOTAL", "GROSS_PROFIT", "OPEX_SALES_MARKETING", "OPEX_GENERAL_ADMIN", "OPEX_OTHER", "EBITDA"].forEach(req);
    const sub = g("REVENUE_SUBSCRIPTION");
    const svc = g("REVENUE_SERVICES");
    if (sub === null && svc === null) errors.push({ level: "error", month, message: `${key}: provide subscription and/or services revenue.` });
    const rev = (sub ?? 0) + (svc ?? 0);
    const check = (code: string, expected: number, desc: string) => {
      const got = g(code);
      if (got !== null && Math.abs(got - expected) > CHECK_TOLERANCE)
        errors.push({ level: "error", month, message: `${key}: ${code} is ${fmt(got)} but ${desc} = ${fmt(expected)} (difference ${fmt(got - expected)}).` });
    };
    if (sub !== null || svc !== null) check("TOTAL_REVENUE", rev, "subscription + services");
    const dl = g("COGS_DIRECT_LABOR");
    const oc = g("COGS_OTHER");
    const hasSplit = dl !== null && oc !== null;
    if ((dl === null) !== (oc === null)) errors.push({ level: "error", month, message: `${key}: provide both COGS_DIRECT_LABOR and COGS_OTHER, or neither.` });
    const cogs = hasSplit ? dl! + oc! : g("COGS_TOTAL") ?? 0;
    if (hasSplit) check("COGS_TOTAL", cogs, "direct labor + other COGS");
    check("GROSS_PROFIT", (g("TOTAL_REVENUE") ?? rev) - (g("COGS_TOTAL") ?? cogs), "total revenue − total COGS");
    const opex = (g("OPEX_SALES_MARKETING") ?? 0) + (g("OPEX_RD") ?? 0) + (g("OPEX_GENERAL_ADMIN") ?? 0) + (g("OPEX_OTHER") ?? 0);
    check("EBITDA", (g("GROSS_PROFIT") ?? rev - cogs) - opex, "gross profit − operating expenses");
    for (const [p, f] of [["OPEX_SM_PERSONNEL", "OPEX_SALES_MARKETING"], ["OPEX_RD_PERSONNEL", "OPEX_RD"], ["OPEX_GA_PERSONNEL", "OPEX_GENERAL_ADMIN"]]) {
      if (g(p) !== null && g(p)! > (g(f) ?? 0) + CHECK_TOLERANCE) errors.push({ level: "error", month, message: `${key}: ${p} (${fmt(g(p)!)}) exceeds ${f} (${fmt(g(f) ?? 0)}) — personnel is a part of the line, not an addition.` });
    }
    if (rev < 0) errors.push({ level: "error", month, message: `${key}: revenue is negative.` });
    if (g("HEADCOUNT") !== null && (g("HEADCOUNT")! < 0 || !Number.isInteger(g("HEADCOUNT")!))) errors.push({ level: "error", month, message: `${key}: HEADCOUNT must be a whole number ≥ 0.` });

    const persOk = g("OPEX_SM_PERSONNEL") !== null && g("OPEX_GA_PERSONNEL") !== null && (g("OPEX_RD") === null || g("OPEX_RD_PERSONNEL") !== null);
    const laborOk = hasSplit && persOk;
    const sc = (x: number | null) => (x === null ? null : x / 1e6);
    const revM = rev / 1e6;
    const cogsM = cogs / 1e6;
    const opexM = opex / 1e6;
    const record: MonthlyFinancial = {
      companyId: company.id,
      month,
      currency: company.baseCurrency,
      revenue: revM,
      subscriptionRevenue: sc(sub),
      servicesRevenue: svc === null ? (sub === null ? null : 0) : svc / 1e6,
      directLabor: laborOk ? sc(dl) : null,
      otherCogs: laborOk ? sc(oc) : null,
      cogs: cogsM,
      grossProfit: revM - cogsM,
      salesMarketing: (g("OPEX_SALES_MARKETING") ?? 0) / 1e6,
      researchDevelopment: sc(g("OPEX_RD")),
      generalAdmin: (g("OPEX_GENERAL_ADMIN") ?? 0) / 1e6,
      otherOpex: (g("OPEX_OTHER") ?? 0) / 1e6,
      operatingExpenses: opexM,
      smPersonnel: laborOk ? sc(g("OPEX_SM_PERSONNEL")) : null,
      rdPersonnel: laborOk && g("OPEX_RD") !== null ? sc(g("OPEX_RD_PERSONNEL")) : null,
      gaPersonnel: laborOk ? sc(g("OPEX_GA_PERSONNEL")) : null,
      operatingPersonnel: laborOk ? ((g("OPEX_SM_PERSONNEL") ?? 0) + (g("OPEX_RD_PERSONNEL") ?? 0) + (g("OPEX_GA_PERSONNEL") ?? 0)) / 1e6 : null,
      ebitda: revM - cogsM - opexM,
      cashInterest: null,
      cashTaxes: null,
      changeInNwc: null,
      cashFromOperations: sc(g("CASH_FROM_OPERATIONS")),
      capex: sc(g("CAPEX")),
      acquisitions: null,
      financingFlows: null,
      cashBegin: null,
      cashEnd: sc(g("CASH_BALANCE")),
      accountsReceivable: null,
      deferredRevenue: null,
      accountsPayable: null,
      debt: null,
    };
    if (!laborOk) warnings.push({ level: "warning", month, message: `${key}: labor split incomplete (direct labor, other COGS and the personnel memo lines). Labor metrics will show N/A.` });
    if (g("CASH_FROM_OPERATIONS") === null) warnings.push({ level: "warning", month, message: `${key}: no cash from operations — cash-flow metrics will show N/A.` });
    if (g("HEADCOUNT") === null) warnings.push({ level: "warning", month, message: `${key}: no headcount — revenue per employee will show N/A.` });
    months.push({ month, values: v, note, record, employees: g("HEADCOUNT"), arr: sc(g("ARR")) });
  }

  // Cross-month checks: restatements, swings, gaps.
  const restatedMonths: number[] = [];
  const newMonths: number[] = [];
  const sorted = [...months].sort((a, b) => a.month - b.month);
  for (const pm of sorted) {
    const prior = existing[pm.month];
    if (prior) {
      const diff = ["revenue", "cogs", "operatingExpenses", "ebitda"].some((k) => Math.abs((prior[k as "revenue"] as number) - (pm.record[k as "revenue"] as number)) * 1e6 > CHECK_TOLERANCE);
      if (diff) restatedMonths.push(pm.month);
    } else newMonths.push(pm.month);
    const prev = sorted.find((x) => x.month === pm.month - 1)?.record ?? existing[pm.month - 1];
    if (prev && prev.revenue > 0) {
      const chg = pm.record.revenue / prev.revenue - 1;
      if (Math.abs(chg) > SWING_WARN && !pm.note)
        warnings.push({ level: "warning", month: pm.month, message: `${monthKey(pm.month)}: revenue moved ${(chg * 100).toFixed(0)}% vs the prior month with no NOTE. Add a note explaining the movement.` });
    }
  }
  if (restatedMonths.length)
    warnings.push({ level: "warning", message: `Restates ${restatedMonths.map(monthLabel).join(", ")} — figures differ from the version already accepted. A reason is required to accept.` });
  const lastExisting = existing.reduce((mx, r, i) => (r ? i : mx), -1);
  const firstNew = Math.min(...newMonths);
  if (newMonths.length && lastExisting >= 0 && firstNew > lastExisting + 1)
    warnings.push({ level: "warning", message: `Gap: no data for ${monthLabel(lastExisting + 1)}${firstNew - 1 > lastExisting + 1 ? ` – ${monthLabel(firstNew - 1)}` : ""}. Periods covering those months stay incomplete.` });

  return { ok: errors.length === 0 && months.length > 0, months: sorted, errors: dedupe(errors), warnings: dedupe(warnings), restatedMonths, newMonths };
}

function dedupe(xs: Issue[]): Issue[] {
  const s = new Set<string>();
  return xs.filter((x) => (s.has(x.message) ? false : (s.add(x.message), true)));
}

/** Months a sponsor would typically upload next: the months after the last reported one (or the requested history). */
export function nextMonthsToUpload(company: Company, historyFrom = 21): number[] {
  const from = company.lastReportedMonth >= 0 ? company.lastReportedMonth + 1 : historyFrom;
  const out: number[] = [];
  for (let m = from; m <= LAST_MONTH; m++) out.push(m);
  return out.length ? out : [LAST_MONTH];
}
