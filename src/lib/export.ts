import type { MetricFormat } from "./engine/metrics";
import { csvValue } from "./format";

export interface CsvColumn<T> {
  header: string;
  format: MetricFormat | "text";
  get: (row: T) => number | string | null | undefined;
}

function esc(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Builds a CSV with a provenance header: synthetic-data notice, period and filters. */
export function buildCsv<T>(rows: T[], cols: CsvColumn<T>[], meta: { title: string; period: string; scope: string; comparison?: string }): string {
  const lines: string[] = [];
  lines.push(esc(`${meta.title}`));
  lines.push(esc("CONCEPT DEMO - SYNTHETIC DATA. Northbridge Equity Partners and all portfolio companies are fictional."));
  lines.push(esc(`Period: ${meta.period}${meta.comparison ? ` | Comparison: ${meta.comparison}` : ""}`));
  lines.push(esc(`Scope: ${meta.scope}`));
  lines.push(esc("Units: USD millions for amounts; percentages and percentage points as numbers (e.g. 12.5 = 12.5%)."));
  lines.push("");
  lines.push(cols.map((c) => esc(c.header + (c.format === "pct" ? " (%)" : c.format === "pp" ? " (pp)" : c.format === "usd" ? " ($M)" : ""))).join(","));
  for (const r of rows) {
    lines.push(
      cols
        .map((c) => {
          const v = c.get(r);
          if (c.format === "text") return esc(v === null || v === undefined ? "" : String(v));
          return esc(typeof v === "number" ? csvValue(v, c.format) : v === null || v === undefined ? "N/A" : String(v));
        })
        .join(","),
    );
  }
  return lines.join("\n");
}

export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["﻿" + text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
