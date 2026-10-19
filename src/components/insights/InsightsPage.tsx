"use client";
import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Lightbulb, Sparkles } from "lucide-react";
import { detectInsights, type Insight, type InsightCategory, type Severity } from "@/lib/engine/insights";
import { comparisonLabel } from "@/lib/engine/periods";
import { useScope } from "@/lib/state/hooks";
import { PageHeader } from "../overview/OverviewPage";
import { Badge, Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/primitives";
import { AskPanel } from "./AskPanel";
import { InsightDrawer } from "./InsightDrawer";
import { InsightFeed, LaborSpotlight } from "./InsightFeed";

export function InsightsPage() {
  const { companies, period, basis } = useScope();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // Old cost-benchmarking links fall back to the insights tab (benchmarking now lives on the Portfolio chart).
  const tab = params.get("tab") === "ask" ? "ask" : "insights";
  const category = (params.get("category") as InsightCategory | null) ?? "all";
  const severity = (params.get("severity") as Severity | null) ?? "all";
  const insightId = params.get("insight");
  const insights = useMemo(() => detectInsights(companies, period), [companies, period]);
  const open = insightId ? insights.find((i) => i.id === insightId) ?? null : null;

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "all") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  };
  const counts = { high: insights.filter((i) => i.severity === "high").length, positive: insights.filter((i) => i.severity === "positive").length };

  return (
    <div>
      <PageHeader
        title="Insights"
        subtitle="What the engine found across the portfolio this period — and answers to your own questions."
      >
        <Badge tone="outline">{period.label} · {comparisonLabel(basis === "budget" ? "yoy" : basis, period)}</Badge>
        <Badge tone="neg">{counts.high} high</Badge>
        <Badge tone="pos">{counts.positive} positive</Badge>
      </PageHeader>
      <Tabs value={tab} onValueChange={(v) => setParam({ tab: v === "insights" ? null : v, q: null })}>
        <TabsList className="mb-4">
          <TabsTrigger value="insights" data-testid="tab-insights">
            <Lightbulb className="h-3.5 w-3.5" /> Insights <span className="rounded bg-subtle px-1.5 text-xs text-muted">{insights.length}</span>
          </TabsTrigger>
          <TabsTrigger value="ask" data-testid="tab-ask">
            <Sparkles className="h-3.5 w-3.5" /> Ask Your Portfolio
          </TabsTrigger>
        </TabsList>
        <TabsContent value="insights" className="space-y-4 focus:outline-none">
          <LaborSpotlight companies={companies} period={period} onSelectCompany={(id) => router.push(`/companies/${id}`)} />
          <InsightFeed
            insights={insights}
            category={category}
            severity={severity}
            setCategory={(c) => setParam({ category: c })}
            setSeverity={(s) => setParam({ severity: s })}
            onOpen={(i: Insight) => setParam({ insight: i.id })}
          />
        </TabsContent>
        <TabsContent value="ask" className="focus:outline-none">
          <AskPanel initialQuestion={params.get("q")} />
        </TabsContent>
      </Tabs>
      <InsightDrawer insight={open} onClose={() => setParam({ insight: null })} />
    </div>
  );
}
