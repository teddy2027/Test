"use client";
import { ArrowRight, Banknote, Gauge, LineChart, ShieldCheck, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Insight, InsightCategory } from "@/lib/engine/insights";
import { SeverityBadge } from "../fin/fin";
import { FigureGrid } from "./InsightDrawer";

export const CATEGORY_ICON: Record<InsightCategory, typeof TrendingUp> = {
  Growth: TrendingUp,
  Profitability: LineChart,
  "Cost Efficiency": Gauge,
  "Cash Flow": Banknote,
  "Reporting Quality": ShieldCheck,
};

export function InsightCard({ i, onOpen }: { i: Insight; onOpen: (i: Insight) => void }) {
  const Icon = CATEGORY_ICON[i.category];
  return (
    <button
      type="button"
      onClick={() => onOpen(i)}
      data-testid="insight-card"
      data-rule={i.rule}
      data-company={i.companyId}
      className={cn(
        "group flex w-full flex-col rounded-lg border bg-surface p-4 text-left shadow-card transition-all hover:border-brand/40 hover:shadow-pop",
        i.severity === "high" ? "border-neg/25" : "border-line",
      )}
    >
      <div className="flex items-center gap-2">
        <SeverityBadge severity={i.severity} />
        <span className="inline-flex items-center gap-1 text-xs text-muted">
          <Icon className="h-3.5 w-3.5" /> {i.category}
        </span>
        <span className="ml-auto text-xs text-faint">{i.period}</span>
      </div>
      <div className="mt-2 text-sm font-semibold text-ink">
        {i.companyName} <span className="font-normal text-muted">· {i.title}</span>
      </div>
      <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-ink-2">{i.finding}</p>
      {i.figures.length > 0 && (
        <div className="mt-3">
          <FigureGrid figures={i.figures.slice(0, 3)} />
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="truncate text-faint">{i.comparison}</span>
        <span className="inline-flex items-center gap-1 font-medium text-brand opacity-80 group-hover:opacity-100">
          Inspect underlying data <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </button>
  );
}

/** Labor cost growth vs revenue growth across companies in scope — computed from the engine (YoY). */
