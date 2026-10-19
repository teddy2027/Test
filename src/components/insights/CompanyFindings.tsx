"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { CATEGORIES, type Insight, type InsightCategory } from "@/lib/engine/insights";
import { routes } from "@/lib/routes";
import { SeverityBadge } from "../fin/fin";
import { Segmented } from "../ui/primitives";
import { keyFigureText } from "../overview/Signals";
import { InsightCard } from "./InsightFeed";

const RANK = { high: 0, medium: 1, low: 2, positive: 3 } as const;
export type FindingsView = "attention" | "positive" | "all";

interface Row {
  companyId: string;
  companyName: string;
  findings: Insight[];
  top: Insight;
}

/**
 * Findings grouped by company, so one underlying problem isn't read as eight separate alarms.
 * Companies are ranked by their most severe finding, then by size (value at stake) — not by how many rules
 * fired (one cost problem trips several rules) and not by finding magnitude (not comparable across rules).
 */
export function CompanyFindings({ insights, view, setView, onOpen, sizeOf }: { insights: Insight[]; view: FindingsView; setView: (v: FindingsView) => void; onOpen: (i: Insight) => void; sizeOf: (companyId: string) => number }) {
  const [category, setCategory] = useState<InsightCategory | "all">("all");
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => {
    const by = new Map<string, Insight[]>();
    for (const i of insights.filter((x) => category === "all" || x.category === category)) by.set(i.companyId, [...(by.get(i.companyId) ?? []), i]);
    return [...by.values()].map((list): Row => {
      const sorted = [...list].sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.magnitude - a.magnitude);
      return { companyId: sorted[0].companyId, companyName: sorted[0].companyName, findings: sorted, top: sorted[0] };
    });
  }, [insights, category]);
  const attention = rows.filter((r) => r.top.severity === "high" || r.top.severity === "medium").sort((a, b) => RANK[a.top.severity] - RANK[b.top.severity] || sizeOf(b.companyId) - sizeOf(a.companyId));
  const positive = rows.filter((r) => r.findings.some((f) => f.severity === "positive") && !attention.includes(r));
  const quiet = rows.filter((r) => !attention.includes(r) && !positive.includes(r));
  const sections = [
    { key: "attention", title: "Needs attention", hint: "Ranked by the most severe finding, then by company size (latest twelve months' revenue)", rows: attention, show: view !== "positive" },
    { key: "positive", title: "Outperforming", hint: "Positive outliers this period", rows: positive, show: view !== "attention" },
    { key: "quiet", title: "Minor notes only", hint: "Low-severity items such as definition differences", rows: quiet, show: view === "all" },
  ];

  return (
    <div className="space-y-4" data-testid="company-findings">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<FindingsView>
          ariaLabel="Which companies"
          value={view}
          onChange={setView}
          options={[
            { value: "attention", label: `Needs attention (${attention.length})` },
            { value: "positive", label: `Outperforming (${positive.length})` },
            { value: "all", label: "All" },
          ]}
        />
        <select aria-label="Finding category" value={category} onChange={(e) => setCategory(e.target.value as InsightCategory | "all")} className="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm shadow-card">
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">Click a company to see every finding; click a finding for the supporting analysis.</span>
      </div>
      {sections
        .filter((s) => s.show && s.rows.length)
        .map((s) => (
          <section key={s.key} className="rounded-lg border border-line bg-surface shadow-card" data-testid={`findings-${s.key}`}>
            <div className="flex items-baseline gap-2 border-b border-line px-4 py-2.5">
              <h3 className="text-sm font-semibold text-ink">{s.title}</h3>
              <span className="text-xs text-muted">
                {s.rows.length} {s.rows.length === 1 ? "company" : "companies"} · {s.hint}
              </span>
            </div>
            <ul>
              {s.rows.map((r) => {
                const expanded = open === r.companyId;
                const f = keyFigureText(r.top);
                const cats = [...new Set(r.findings.slice(1).map((x) => x.category))];
                const counts = (["high", "medium", "low", "positive"] as const).map((sev) => [sev, r.findings.filter((x) => x.severity === sev).length] as const).filter(([, n]) => n);
                return (
                  <li key={r.companyId} className="border-b border-line/60 last:border-0" data-testid="findings-row" data-company={r.companyId}>
                    <div className="flex items-start gap-3 px-4 py-2.5">
                      <button onClick={() => setOpen(expanded ? null : r.companyId)} className="mt-0.5 rounded p-0.5 text-muted hover:bg-subtle" aria-label={`${expanded ? "Hide" : "Show"} all findings for ${r.companyName}`} aria-expanded={expanded} data-testid={`expand-${r.companyId}`}>
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={routes.company(r.companyId)} className="font-semibold text-ink hover:text-brand">
                            {r.companyName}
                          </Link>
                          <SeverityBadge severity={r.top.severity} />
                          <span className="text-[11px] text-faint">{counts.map(([sev, n]) => `${n} ${sev}`).join(" · ")}</span>
                        </div>
                        <button onClick={() => onOpen(r.top)} className="mt-0.5 block text-left text-sm text-ink-2 hover:text-brand" data-testid="findings-headline">
                          {r.top.title}
                          {f && <span className="num ml-1.5 font-medium text-ink">{f}</span>}
                        </button>
                        {cats.length > 0 && !expanded && <div className="mt-0.5 text-[11px] text-muted">Also: {cats.join(", ")}</div>}
                      </div>
                    </div>
                    {expanded && (
                      <div className={cn("grid gap-3 bg-subtle/40 px-4 pb-4 pt-1 lg:grid-cols-2 2xl:grid-cols-3")}>
                        {r.findings.map((i) => (
                          <InsightCard key={i.id} i={i} onOpen={onOpen} />
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      <p className="text-xs text-muted">Findings come from fixed rules with fixed thresholds (see Methodology) — the same data always gives the same findings. They describe what changed, not why.</p>
    </div>
  );
}
