"use client";
import Link from "next/link";
import * as React from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, CircleDashed, Clock, Minus, Plug, Star, Upload, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { favorability, type MetricFormat } from "@/lib/engine/metrics";
import type { Company } from "@/lib/data/types";
import type { ReportingStatus } from "@/lib/engine/company";
import { fmtMetric } from "@/lib/format";
import { useApp } from "@/lib/state/store";
import { Badge, Tip } from "../ui/primitives";

/** Signed change with favourable/unfavourable colouring and an arrow (never colour alone). */
export function Delta({
  value,
  metricKey,
  format = "pct",
  className,
  showIcon = true,
  invert,
}: {
  value: number | null | undefined;
  metricKey: string;
  format?: MetricFormat;
  className?: string;
  showIcon?: boolean;
  invert?: boolean;
}) {
  const v = value ?? null;
  let fav = favorability(metricKey, v);
  if (invert && fav !== "neutral") fav = fav === "pos" ? "neg" : "pos";
  const Icon = v === null || Math.abs(v) < 1e-9 ? Minus : v > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "num inline-flex items-center gap-0.5 whitespace-nowrap font-medium",
        v === null ? "text-faint" : fav === "pos" ? "text-pos" : fav === "neg" ? "text-neg" : "text-ink-2",
        className,
      )}
    >
      {showIcon && v !== null && <Icon className="h-3 w-3 shrink-0" />}
      {fmtMetric(v, format, { signed: true })}
    </span>
  );
}

export function StatusPill({ status, months, expected, awaiting }: { status: ReportingStatus; months?: number; expected?: number; awaiting?: boolean }) {
  if (awaiting && status !== "complete")
    return (
      <Badge tone="info">
        <Clock className="h-3 w-3" /> Awaiting data
      </Badge>
    );
  if (status === "complete")
    return (
      <Badge tone="pos">
        <CheckCircle2 className="h-3 w-3" /> Complete
      </Badge>
    );
  if (status === "partial")
    return (
      <Badge tone="warn">
        <CircleDashed className="h-3 w-3" /> Partial {months !== undefined ? `${months}/${expected}` : ""}
      </Badge>
    );
  return (
    <Badge tone="neg">
      <XCircle className="h-3 w-3" /> Missing
    </Badge>
  );
}

export function ConnectionBadge({ company, compact }: { company: Company; compact?: boolean }) {
  if (company.connection === "dualentry" && company.lastReportedMonth < 0)
    return (
      <Tip content="Data-sharing request sent. Data appears once the company approves the scope in DualEntry.">
        <Badge tone="info">
          <Clock className="h-3 w-3" />
          {compact ? "Awaiting approval" : "DualEntry · awaiting approval"}
        </Badge>
      </Tip>
    );
  if (company.connection === "dualentry")
    return (
      <Tip content="Authorized live connection to the company's DualEntry ledger: published at each close, entity-level and account-level detail within the scope the company approved.">
        <Badge tone="brand">
          <Plug className="h-3 w-3" />
          {compact ? "DualEntry" : "DualEntry · live"}
        </Badge>
      </Tip>
    );
  return (
    <Tip content={`Monthly pack from ${company.accountingSystem}, uploaded by Northbridge on the company's behalf. Consolidated lines as submitted.`}>
      <Badge tone="outline">
        <Upload className="h-3 w-3" />
        {compact ? "Uploaded" : `Uploaded by Northbridge · ${company.accountingSystem}`}
      </Badge>
    </Tip>
  );
}

export function FreshnessDot({ company }: { company: Company }) {
  const days = Math.max(0, Math.round((Date.parse("2026-10-14") - Date.parse(company.lastUpdated)) / 86400000));
  const tone = days <= 2 ? "bg-pos" : days <= 14 ? "bg-info" : days <= 30 ? "bg-warn" : "bg-neg";
  const label = days === 0 ? (company.connection === "dualentry" ? "Synced today" : "Updated today") : `Updated ${days}d ago`;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted">
      <span className={cn("h-1.5 w-1.5 rounded-full", tone)} />
      {label}
    </span>
  );
}

export function QualityBadge({ q, short = false }: { q: "High" | "Medium" | "Low"; short?: boolean }) {
  const tone = q === "High" ? "pos" : q === "Medium" ? "info" : "warn";
  return (
    <Tip content="Data confidence based on connection type, completeness, freshness and definition consistency.">
      <Badge tone={tone}>{short ? q : `${q} confidence`}</Badge>
    </Tip>
  );
}

export function CompanyLink({ id, name, className }: { id: string; name: string; className?: string }) {
  return (
    <Link href={`/companies/${id}`} className={cn("font-medium text-ink hover:text-brand hover:underline", className)}>
      {name}
    </Link>
  );
}

export function WatchButton({ id, className }: { id: string; className?: string }) {
  const watch = useApp((s) => s.watchlist);
  const toggle = useApp((s) => s.toggleWatch);
  const on = watch.includes(id);
  return (
    <Tip content={on ? "Remove from watchlist" : "Add to watchlist"}>
      <button
        type="button"
        aria-label={on ? "Remove from watchlist" : "Add to watchlist"}
        aria-pressed={on}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          toggle(id);
        }}
        className={cn("inline-flex rounded p-0.5 transition-colors", on ? "text-warn" : "text-faint hover:text-muted", className)}
      >
        <Star className={cn("h-3.5 w-3.5", on && "fill-current")} />
      </button>
    </Tip>
  );
}

/** Minimal inline sparkline (SVG). Gaps (null) break the line. */
export function Sparkline({ values, className, height = 28, width = 96, tone = "brand" }: { values: (number | null)[]; className?: string; height?: number; width?: number; tone?: "brand" | "muted" }) {
  const v = values.filter((x): x is number => x !== null);
  if (v.length < 2) return <div style={{ width, height }} />;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;
  const pad = 3;
  const step = (width - pad * 2) / (values.length - 1);
  let d = "";
  values.forEach((x, i) => {
    if (x === null) return;
    const px = pad + i * step;
    const py = pad + (height - pad * 2) * (1 - (x - min) / span);
    d += `${d === "" || values[i - 1] === null ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)} `;
  });
  const lastIdx = values.length - 1 - [...values].reverse().findIndex((x) => x !== null);
  const lx = pad + lastIdx * step;
  const ly = pad + (height - pad * 2) * (1 - ((values[lastIdx] as number) - min) / span);
  const color = tone === "brand" ? "var(--series-1)" : "var(--series-muted)";
  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={2.5} fill={color} />
    </svg>
  );
}

export function SeverityBadge({ severity }: { severity: "high" | "medium" | "low" | "positive" }) {
  if (severity === "high")
    return (
      <Badge tone="neg">
        <AlertTriangle className="h-3 w-3" /> High
      </Badge>
    );
  if (severity === "medium")
    return (
      <Badge tone="warn">
        <AlertTriangle className="h-3 w-3" /> Medium
      </Badge>
    );
  if (severity === "low")
    return (
      <Badge tone="neutral">
        <Clock className="h-3 w-3" /> Low
      </Badge>
    );
  return (
    <Badge tone="pos">
      <ArrowUpRight className="h-3 w-3" /> Positive
    </Badge>
  );
}

export function Stat({ label, value, sub, className }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-xs text-muted">{label}</div>
      <div className="num mt-0.5 text-base font-semibold text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}
