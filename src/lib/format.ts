/** Single source of number formatting so every view renders values identically. Amounts are USD millions. */
import type { MetricFormat } from "./engine/metrics";

export const NA = "N/A";
const MINUS = "−";

export function fmtUsd(v: number | null | undefined, opts: { signed?: boolean; decimals?: number } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  const sign = v < 0 ? MINUS : opts.signed && v > 0 ? "+" : "";
  const a = Math.abs(v);
  let body: string;
  if (a >= 1000) body = `$${(a / 1000).toFixed(2)}B`;
  else if (a >= 1) body = `$${a.toFixed(opts.decimals ?? 1)}M`;
  else if (a >= 0.001) body = `$${(a * 1000).toFixed(0)}K`;
  else body = "$0";
  return sign + body;
}

export function fmtUsdK(v: number | null | undefined, opts: { signed?: boolean } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  const k = Math.round(v * 1000);
  const sign = k < 0 ? MINUS : opts.signed && k > 0 ? "+" : "";
  return `${sign}$${Math.abs(k).toLocaleString("en-US")}K`;
}

export function fmtPct(v: number | null | undefined, opts: { signed?: boolean; decimals?: number } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  const d = opts.decimals ?? 1;
  const x = v * 100;
  const rounded = Number(x.toFixed(d));
  const sign = rounded < 0 ? MINUS : opts.signed && rounded > 0 ? "+" : "";
  return `${sign}${Math.abs(rounded).toFixed(d)}%`;
}

/** Percentage-point difference (input is a fraction difference, e.g. 0.012 → "+1.2 pp"). */
export function fmtPp(v: number | null | undefined, opts: { signed?: boolean; decimals?: number } = { signed: true }): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  const d = opts.decimals ?? 1;
  const rounded = Number((v * 100).toFixed(d));
  const sign = rounded < 0 ? MINUS : (opts.signed ?? true) && rounded > 0 ? "+" : "";
  return `${sign}${Math.abs(rounded).toFixed(d)} pp`;
}

export function fmtCount(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  return Math.round(v).toLocaleString("en-US");
}

export function fmtMultiple(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  return `${v.toFixed(1)}×`;
}

export function fmtMetric(v: number | null | undefined, format: MetricFormat, opts: { signed?: boolean } = {}): string {
  switch (format) {
    case "usd":
      return fmtUsd(v, opts);
    case "usdk":
      return fmtUsdK(v, opts);
    case "pct":
      return fmtPct(v, opts);
    case "pp":
      return fmtPp(v, { signed: opts.signed ?? true });
    case "count":
      return fmtCount(v);
    case "multiple":
      return fmtMultiple(v);
    case "ratio":
      return v === null || v === undefined ? NA : v.toFixed(2);
  }
}

/** Raw numeric value for CSV export (no thousands separators, fractions as %). */
export function csvValue(v: number | null | undefined, format: MetricFormat): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "N/A";
  if (format === "pct") return (v * 100).toFixed(2);
  if (format === "pp") return (v * 100).toFixed(2);
  if (format === "usd") return v.toFixed(4);
  if (format === "usdk") return (v * 1000).toFixed(1);
  return String(Math.round(v * 100) / 100);
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}
export function formatDate(iso: string): string {
  const d = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
