/**
 * Calendar utilities. All monthly data is indexed by a month index where
 * 0 = January 2024 and 32 = September 2026 (the last closed month in the demo).
 * Portfolio reporting uses calendar quarters for every company so that periods
 * are comparable (companies with non-December fiscal year ends are calendarised
 * from their monthly data, which is exact rather than an approximation).
 */
export const FIRST_YEAR = 2024;
export const MONTH_COUNT = 33; // Jan 2024 – Sep 2026
export const LAST_MONTH = MONTH_COUNT - 1;
export const DEMO_TODAY = "2026-10-14";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthYear(m: number): number {
  return FIRST_YEAR + Math.floor(m / 12);
}
export function monthOfYear(m: number): number {
  return ((m % 12) + 12) % 12; // 0..11
}
export function monthKey(m: number): string {
  return `${monthYear(m)}-${String(monthOfYear(m) + 1).padStart(2, "0")}`;
}
export function monthLabel(m: number): string {
  return `${MONTH_NAMES[monthOfYear(m)]} ${monthYear(m)}`;
}
export function monthShortLabel(m: number): string {
  return `${MONTH_NAMES[monthOfYear(m)]} ’${String(monthYear(m)).slice(2)}`;
}
export function monthIndexFromKey(key: string): number {
  const [y, mo] = key.split("-").map(Number);
  return (y - FIRST_YEAR) * 12 + (mo - 1);
}
export function monthIndexFromDate(iso: string): number {
  return monthIndexFromKey(iso.slice(0, 7));
}
export function quarterOfMonth(m: number): number {
  return Math.floor(monthOfYear(m) / 3) + 1;
}
export function quarterKey(m: number): string {
  return `${monthYear(m)}-Q${quarterOfMonth(m)}`;
}
export function quarterLabelFromKey(key: string): string {
  const [y, q] = key.split("-");
  return `${q} ${y}`;
}
/** End month index of a quarter key such as "2026-Q3". */
export function quarterEndMonth(key: string): number {
  const [y, q] = key.split("-Q").map(Number);
  return (y - FIRST_YEAR) * 12 + q * 3 - 1;
}
export function allQuarterKeys(): string[] {
  const out: string[] = [];
  for (let m = 2; m <= LAST_MONTH; m += 3) out.push(quarterKey(m));
  return out;
}
export function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}
