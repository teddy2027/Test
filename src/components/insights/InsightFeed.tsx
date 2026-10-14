"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Banknote, Gauge, LineChart, ShieldCheck, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Company } from "@/lib/data/types";
import { analyzeCompany } from "@/lib/engine/company";
import { CATEGORIES, THRESHOLDS, type Insight, type InsightCategory, type Severity } from "@/lib/engine/insights";
import type { Period } from "@/lib/engine/periods";
import { fmtPct, fmtPp } from "@/lib/format";
import { GrowthScatter, PairedBars } from "../charts/charts";
import { SeverityBadge } from "../fin/fin";
import { Badge, CardHeader, Segmented } from "../ui/primitives";
import { FigureGrid } from "./InsightDrawer";

export const CATEGORY_ICON: Record<InsightCategory, typeof TrendingUp> = {
  Growth: TrendingUp,
  Profitability: LineChart,
  "Cost Efficiency": Gauge,
  "Cash Flow": Banknote,
  "Reporting Quality": ShieldCheck,
};

const SECTION_HINT: Record<InsightCategory, string> = {
  Growth: "Revenue growth, acceleration, growth vs budget and vs peers",
  Profitability: "EBITDA and gross margin levels, expansion/contraction, operating leverage",
  "Cost Efficiency": "Labor cost growth, labor intensity, G&A and other cost ratios",
  "Cash Flow": "Operating cash flow, cash conversion, cash vs budget",
  "Reporting Quality": "Missing or stale submissions, discontinuities, definitions",
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
export function LaborSpotlight({ companies, period, onSelectCompany }: { companies: Company[]; period: Period; onSelectCompany: (id: string) => void }) {
  const rows = useMemo(
    () =>
      companies
        .map((c) => {
          const a = analyzeCompany(c.id, period);
          return { id: c.id, label: c.name, a: a.yoy?.laborGrowth ?? null, b: a.yoy?.revenueGrowth ?? null, gap: a.yoy?.laborGap ?? null, rev: a.current.metrics.revenue };
        })
        .filter((r) => r.a !== null && r.b !== null)
        .sort((x, y) => (y.gap ?? 0) - (x.gap ?? 0)),
    [companies, period],
  );
  const missing = companies.length - rows.length;
  const flagged = rows.filter((r) => (r.gap ?? 0) > THRESHOLDS.laborGapPp).map((r) => r.id);
  const sectorLabel = new Set(companies.map((c) => c.sector)).size === 1 ? companies[0]?.sector.toLowerCase() + " companies" : "companies in scope";
  return (
    <div className="rounded-lg border border-line bg-surface shadow-card" data-testid="labor-spotlight">
      <CardHeader
        title="Labor cost growth vs revenue growth"
        info="Labor = direct labor (COGS) + operating personnel (opex). Both growth rates year-over-year for the same months. Highlighted: gap above the attention threshold."
        description={`${period.label} vs prior year · ${rows.length} ${sectorLabel}${missing ? ` · ${missing} without complete labor data` : ""} · threshold ${fmtPp(THRESHOLDS.laborGapPp, { signed: false, decimals: 0 })}`}
        actions={
          flagged.length ? (
            <Badge tone="neg">
              {flagged.length} above threshold
            </Badge>
          ) : (
            <Badge tone="pos">None above threshold</Badge>
          )
        }
      />
      <div className="grid gap-2 p-3 lg:grid-cols-2">
        <div>
          <PairedBars data={rows} a="Labor cost growth" b="Revenue growth" format="pct" highlight={flagged.length ? flagged : undefined} onSelect={onSelectCompany} />
        </div>
        <div>
          <GrowthScatter data={rows.map((r) => ({ id: r.id, label: r.label, x: r.b!, y: r.a!, size: r.rev ?? 1 }))} highlight={flagged.length ? flagged : undefined} onSelect={onSelectCompany} height={Math.max(260, rows.length * 44 + 50)} />
          <p className="px-3 text-[11px] text-muted">Points above the diagonal grew labor faster than revenue. Bubble size = period revenue. Click to open the company.</p>
        </div>
      </div>
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line px-4 py-2 text-xs text-ink-2">
          {rows.slice(0, 4).map((r) => (
            <span key={r.id}>
              <span className="font-medium text-ink">{r.label}</span>: labor {fmtPct(r.a, { signed: true })} vs revenue {fmtPct(r.b, { signed: true })} ({fmtPp(r.gap)})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function InsightFeed({
  insights,
  category,
  severity,
  setCategory,
  setSeverity,
  onOpen,
}: {
  insights: Insight[];
  category: InsightCategory | "all";
  severity: Severity | "all";
  setCategory: (c: InsightCategory | "all") => void;
  setSeverity: (s: Severity | "all") => void;
  onOpen: (i: Insight) => void;
}) {
  const router = useRouter();
  const shown = insights.filter((i) => (category === "all" || i.category === category) && (severity === "all" || i.severity === severity));
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, insights.filter((i) => i.category === c)]));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {CATEGORIES.map((c) => {
          const Icon = CATEGORY_ICON[c];
          const list = counts[c] as Insight[];
          const high = list.filter((i) => i.severity === "high").length;
          const pos = list.filter((i) => i.severity === "positive").length;
          return (
            <button
              key={c}
              data-testid={`category-${c}`}
              onClick={() => setCategory(category === c ? "all" : c)}
              className={cn(
                "rounded-lg border bg-surface p-3 text-left shadow-card transition-colors",
                category === c ? "border-brand ring-1 ring-brand/30" : "border-line hover:border-line-strong",
              )}
            >
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
                <Icon className="h-3.5 w-3.5" /> {c}
              </div>
              <div className="num mt-1 text-xl font-semibold text-ink">{list.length}</div>
              <div className="text-[11px] text-muted">
                {high} high · {pos} positive
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted">
          Showing <span className="font-medium text-ink">{shown.length}</span> of {insights.length} findings
          {category !== "all" && (
            <button className="ml-2 text-brand hover:underline" onClick={() => setCategory("all")}>
              Clear category
            </button>
          )}
        </div>
        <Segmented<Severity | "all">
          ariaLabel="Severity filter"
          value={severity}
          onChange={setSeverity}
          options={[
            { value: "all", label: "All" },
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "low", label: "Low" },
            { value: "positive", label: "Positive" },
          ]}
        />
      </div>
      {shown.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface p-10 text-center text-sm text-muted">No findings match these filters for the current scope.</div>
      ) : (
        CATEGORIES.filter((c) => shown.some((i) => i.category === c)).map((c) => {
          const Icon = CATEGORY_ICON[c];
          const list = shown.filter((i) => i.category === c);
          return (
            <section key={c} className="space-y-2" data-testid={`section-${c}`}>
              <h3 className="flex items-center gap-2 pt-2 text-sm font-semibold text-ink">
                <Icon className="h-4 w-4 text-muted" /> {c}
                <span className="rounded bg-subtle px-1.5 text-xs font-medium text-muted">{list.length}</span>
                <span className="text-xs font-normal text-muted">{SECTION_HINT[c]}</span>
              </h3>
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {list.map((i) => (
                  <InsightCard key={i.id} i={i} onOpen={onOpen} />
                ))}
              </div>
            </section>
          );
        })
      )}
      <p className="text-xs text-muted">
        Findings are produced by a deterministic rules engine over the computed metrics (thresholds in Methodology). They describe observed differences; they do not establish causes.{" "}
        <button className="text-brand hover:underline" onClick={() => router.push("/insights?tab=ask")}>
          Ask a follow-up question →
        </button>
      </p>
    </div>
  );
}
