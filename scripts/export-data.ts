/**
 * Writes the deterministic synthetic dataset to ./data as JSON and CSV for inspection.
 * Usage: npm run data:export
 */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { getData } from "../src/lib/data";
import { monthKey } from "../src/lib/data/calendar";
import { validateDataset } from "../src/lib/data/validate";

const out = path.resolve(__dirname, "..", "data");
mkdirSync(out, { recursive: true });
const d = getData();

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
const withKey = <T extends { month: number }>(rows: T[]) => rows.map((r) => ({ period: monthKey(r.month), ...r }));

const tables: Record<string, Record<string, unknown>[]> = {
  funds: d.funds as unknown as Record<string, unknown>[],
  companies: d.companies as unknown as Record<string, unknown>[],
  entities: d.entities as unknown as Record<string, unknown>[],
  monthly_financials_usd: withKey(d.monthly),
  monthly_financials_local: withKey(d.monthlyLocal),
  budgets_usd: withKey(d.budgets),
  operational_metrics: withKey(d.operational),
  entity_monthly: withKey(d.entityMonthly),
  transactions: d.transactions as unknown as Record<string, unknown>[],
  fx_rates: withKey(d.fx),
};
for (const [name, rows] of Object.entries(tables)) {
  writeFileSync(path.join(out, `${name}.csv`), toCsv(rows));
}
writeFileSync(path.join(out, "dataset.json"), JSON.stringify({ firm: d.firm, ...Object.fromEntries(Object.entries(tables)) }, null, 1));
const v = validateDataset(d);
writeFileSync(path.join(out, "validation.json"), JSON.stringify(v, null, 2));
console.log(`Wrote ${Object.keys(tables).length} tables to ${out}. Validation: ${v.passed ? "PASSED" : "FAILED"} (${v.checks.length} checks).`);
