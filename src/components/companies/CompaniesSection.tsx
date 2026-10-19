"use client";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Building2, Columns3, Plus, Sparkles } from "lucide-react";
import { ttmRevenue } from "@/lib/engine/benchmark";
import { detectInsights, type Insight } from "@/lib/engine/insights";
import { comparisonLabel } from "@/lib/engine/periods";
import { usePortfolio } from "@/lib/state/hooks";
import { PageHeader } from "../overview/OverviewPage";
import { PortfolioTable } from "../overview/PortfolioTable";
import { CompareWorkspace } from "../compare/CompareWorkspace";
import { AskPanel } from "../insights/AskPanel";
import { CompanyFindings, type FindingsView } from "../insights/CompanyFindings";
import { InsightDrawer } from "../insights/InsightDrawer";
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/primitives";
import { AddCompanyDialog } from "./AddCompanyDialog";

type Tab = "list" | "findings" | "compare" | "ask";
const TABS: Tab[] = ["list", "findings", "compare", "ask"];

/** Everything at company level: the list, what needs attention, comparisons and benchmarks, and questions. */
export function CompaniesSection() {
  const { summary, companies, period, basis, filters } = usePortfolio();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [adding, setAdding] = useState(false);
  const raw = params.get("tab") as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : "list";
  const insights = useMemo(() => detectInsights(companies, period), [companies, period]);
  const insightId = params.get("insight");
  const open = insightId ? insights.find((i) => i.id === insightId) ?? null : null;
  const view: FindingsView = params.get("severity") === "positive" || params.get("view") === "positive" ? "positive" : params.get("view") === "all" ? "all" : "attention";
  const attention = new Set(insights.filter((i) => i.severity === "high" || i.severity === "medium").map((i) => i.companyId)).size;

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  };
  // Switching tabs drops the other tabs' parameters so links stay short and unambiguous.
  const setTab = (t: string) => router.replace(t === "list" ? pathname : `${pathname}?tab=${t}`, { scroll: false });

  return (
    <div>
      <PageHeader title="Companies" subtitle={`${summary.analyses.length} companies · ${period.label} · ${comparisonLabel(basis === "budget" ? "yoy" : basis, period)}`}>
        <Button variant="primary" onClick={() => setAdding(true)} data-testid="add-company">
          <Plus className="h-3.5 w-3.5" /> Add portfolio company
        </Button>
      </PageHeader>
      <AddCompanyDialog open={adding} onOpenChange={setAdding} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="no-print mb-4">
          <TabsTrigger value="list" data-testid="tab-list">
            <Building2 className="h-3.5 w-3.5" /> All companies
          </TabsTrigger>
          <TabsTrigger value="findings" data-testid="tab-findings">
            <AlertTriangle className="h-3.5 w-3.5" /> Findings <span className="rounded bg-subtle px-1.5 text-xs text-muted">{attention} need attention</span>
          </TabsTrigger>
          <TabsTrigger value="compare" data-testid="tab-compare">
            <Columns3 className="h-3.5 w-3.5" /> Compare
          </TabsTrigger>
          <TabsTrigger value="ask" data-testid="tab-ask">
            <Sparkles className="h-3.5 w-3.5" /> Ask Your Portfolio
          </TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="focus:outline-none">
          {tab === "list" && <PortfolioTable s={summary} basis={basis} filters={filters} />}
        </TabsContent>
        <TabsContent value="findings" className="focus:outline-none">
          {tab === "findings" && <CompanyFindings insights={insights} view={view} setView={(v) => setParams({ view: v === "attention" ? null : v, severity: null })} onOpen={(i: Insight) => setParams({ insight: i.id })} sizeOf={(id) => ttmRevenue(id, period) ?? 0} />}
        </TabsContent>
        <TabsContent value="compare" className="focus:outline-none">
          {tab === "compare" && <CompareWorkspace />}
        </TabsContent>
        <TabsContent value="ask" className="focus:outline-none">
          {tab === "ask" && <AskPanel initialQuestion={params.get("q")} />}
        </TabsContent>
      </Tabs>
      <InsightDrawer insight={open} onClose={() => setParams({ insight: null })} />
    </div>
  );
}
