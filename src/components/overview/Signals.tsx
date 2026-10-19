"use client";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CircleDashed, TrendingUp } from "lucide-react";
import type { Insight } from "@/lib/engine/insights";
import { fmtMetric } from "@/lib/format";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";
import { SeverityBadge } from "../fin/fin";

const KEY_LABELS = ["Gap", "Variance", "Change", "Cash conversion", "Months received", "Days since refresh", "Gross margin change", "Operating leverage"];
export function keyFigure(i: Insight) {
  for (const l of KEY_LABELS) {
    const f = i.figures.find((x) => x.label === l && x.value !== null);
    if (f) return f;
  }
  return i.figures.find((x) => x.value !== null);
}

/** The headline number of a finding, as shown next to it in lists. */
export function keyFigureText(i: Insight): string | null {
  const f = keyFigure(i);
  if (!f) return null;
  if (f.label === "Months received") return `${f.value}/3 mo`;
  if (f.label === "Days since refresh") return `${f.value}d old`;
  return fmtMetric(f.value, f.format, { signed: f.format === "pp" || /gap|variance|change|growth/i.test(f.label) });
}

function Item({ i, count }: { i: Insight; count: number }) {
  const f = keyFigure(i);
  return (
    <Link href={routes.findings({ insight: i.id })} className="group flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-subtle" data-testid="signal-item">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-ink group-hover:text-brand">{i.companyName}</span>
          <SeverityBadge severity={i.severity} />
        </div>
        <div className="truncate text-xs text-muted">
          {i.title}
          {count > 1 && <span className="text-faint"> · +{count - 1} more</span>}
        </div>
      </div>
      {f && <span className="num whitespace-nowrap pt-0.5 text-xs font-medium text-ink-2">{keyFigureText(i)}</span>}
    </Link>
  );
}

export function Signals({ insights }: { insights: Insight[] }) {
  const attention = insights.filter((i) => (i.severity === "high" || i.severity === "medium") && i.category !== "Reporting Quality");
  // One line per company (its most severe finding) keeps the panel scannable.
  const dedupe = (xs: Insight[]) => xs.filter((x, idx) => xs.findIndex((y) => y.companyId === x.companyId) === idx);
  const att = dedupe(attention).slice(0, 5);
  const pos = dedupe(insights.filter((i) => i.severity === "positive")).slice(0, 5);
  const gaps = dedupe(insights.filter((i) => i.category === "Reporting Quality" && i.severity !== "low")).slice(0, 5);
  const cols = [
    { title: "Needs attention", icon: AlertTriangle, tone: "text-neg", items: att, all: attention, empty: "No high or medium-severity findings.", href: routes.findings() },
    { title: "Outperforming", icon: TrendingUp, tone: "text-pos", items: pos, all: insights.filter((i) => i.severity === "positive"), empty: "No positive outliers detected for this period.", href: routes.findings({ severity: "positive" }) },
    { title: "Incomplete or stale data", icon: CircleDashed, tone: "text-warn", items: gaps, all: insights.filter((i) => i.category === "Reporting Quality" && i.severity !== "low"), empty: "All companies in scope have complete, fresh data.", href: "/connections" },
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-3" data-testid="signals">
      {cols.map((c) => (
        <div key={c.title} className="flex flex-col rounded-lg border border-line bg-surface shadow-card">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <c.icon className={cn("h-4 w-4", c.tone)} />
              {c.title}
              <span className="rounded bg-subtle px-1.5 text-xs font-medium text-muted">{c.items.length}</span>
            </div>
            <Link href={c.href} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex-1 p-2">
            {c.items.length ? c.items.map((i) => <Item key={i.id} i={i} count={c.all.filter((x) => x.companyId === i.companyId).length} />) : <p className="px-2 py-4 text-sm text-muted">{c.empty}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
