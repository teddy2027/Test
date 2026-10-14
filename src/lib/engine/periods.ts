import { LAST_MONTH, monthLabel, monthShortLabel, monthYear, quarterEndMonth, quarterKey, quarterLabelFromKey } from "../data/calendar";

export type PeriodKind = "quarter" | "ytd" | "ttm" | "fy";
export type ComparisonBasis = "prior" | "yoy" | "budget";

export interface PeriodSelection {
  kind: PeriodKind;
  /** Quarter key such as "2026-Q3" — anchors quarter, YTD and TTM periods. */
  quarter: string;
  /** Calendar year for full-year periods (only complete years are selectable). */
  year: number;
}

export interface Period {
  kind: PeriodKind;
  start: number; // month index, inclusive
  end: number; // month index, inclusive
  label: string;
  shortLabel: string;
}

export const DEFAULT_SELECTION: PeriodSelection = { kind: "quarter", quarter: "2026-Q3", year: 2025 };

export function months(p: Period): number[] {
  const out: number[] = [];
  for (let m = p.start; m <= p.end; m++) out.push(m);
  return out;
}
export function length(p: Period): number {
  return p.end - p.start + 1;
}

export function makePeriod(kind: PeriodKind, start: number, end: number): Period {
  const y = monthYear(end);
  let label: string;
  let shortLabel: string;
  switch (kind) {
    case "quarter":
      label = quarterLabelFromKey(quarterKey(end));
      shortLabel = label;
      break;
    case "ytd":
      label = `YTD ${quarterLabelFromKey(quarterKey(end))}`;
      shortLabel = `YTD ${monthShortLabel(end)}`;
      break;
    case "ttm":
      label = `TTM ${monthLabel(end)}`;
      shortLabel = `TTM ${monthShortLabel(end)}`;
      break;
    case "fy":
      label = `FY ${y}`;
      shortLabel = label;
      break;
  }
  return { kind, start, end, label, shortLabel };
}

export function resolvePeriod(sel: PeriodSelection): Period {
  if (sel.kind === "fy") {
    const start = (sel.year - 2024) * 12;
    return makePeriod("fy", start, start + 11);
  }
  const end = quarterEndMonth(sel.quarter);
  if (sel.kind === "quarter") return makePeriod("quarter", end - 2, end);
  if (sel.kind === "ytd") return makePeriod("ytd", end - (end % 12), end);
  return makePeriod("ttm", end - 11, end);
}

/**
 * Comparable prior period. "prior" = the immediately preceding period of the
 * same length (previous quarter, prior TTM window, prior year for FY); "yoy" =
 * the same period one year earlier. Returns null when it falls before the data.
 */
export function comparisonPeriod(p: Period, basis: Exclude<ComparisonBasis, "budget">): Period | null {
  let shift: number;
  if (basis === "yoy" || p.kind === "fy" || p.kind === "ytd") shift = 12;
  else shift = length(p); // prior quarter / prior TTM window
  if (p.kind === "ttm" && basis === "prior") shift = 3; // TTM vs TTM one quarter earlier
  const start = p.start - shift;
  const end = p.end - shift;
  if (start < 0) return null;
  return makePeriod(p.kind, start, end);
}

export function comparisonLabel(basis: ComparisonBasis, p: Period): string {
  if (basis === "budget") return "vs Budget";
  if (basis === "yoy") return p.kind === "quarter" ? "vs same quarter last year" : "vs prior year";
  if (p.kind === "quarter") return "vs prior quarter";
  if (p.kind === "ttm") return "vs TTM one quarter earlier";
  return "vs prior year";
}
export function comparisonShortLabel(basis: ComparisonBasis, p: Period): string {
  if (basis === "budget") return "vs Bud";
  if (basis === "yoy") return p.kind === "quarter" ? "YoY" : "vs PY";
  if (p.kind === "quarter") return "QoQ";
  if (p.kind === "ttm") return "vs prior TTM";
  return "vs PY";
}

export function selectableQuarters(): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  for (let m = LAST_MONTH; m >= 2; m -= 3) out.push({ key: quarterKey(m), label: quarterLabelFromKey(quarterKey(m)) });
  return out;
}
export function selectableYears(): number[] {
  const years: number[] = [];
  for (let y = 2024; (y - 2024) * 12 + 11 <= LAST_MONTH; y++) years.push(y);
  return years;
}

/** The rolling list of quarters for trend charts, ending with the selected period end. */
export function trendQuarters(end: number, count = 11): Period[] {
  const out: Period[] = [];
  const lastQEnd = end - ((end + 1) % 3);
  for (let e = lastQEnd; e >= 2 && out.length < count; e -= 3) out.unshift(makePeriod("quarter", e - 2, e));
  return out;
}
