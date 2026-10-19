"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { describeFilters } from "@/lib/engine/filters";
import { useScope } from "@/lib/state/hooks";
import { Button, Segmented } from "../ui/primitives";
import { BenchmarkMode } from "./BenchmarkMode";
import { PeersMode } from "./PeersMode";
import { SideBySide } from "./SideBySide";

export type CompareMode = "side" | "peers" | "benchmark";
const TITLES: Record<CompareMode, string> = {
  side: "Company comparison",
  peers: "Company vs peers",
  benchmark: "Cost and profitability benchmarks",
};

/** The one place to compare companies: side by side, against peers, or benchmarked by group. Every view prints. */
export function CompareWorkspace() {
  const { period, filters, data } = useScope();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("mode");
  const mode: CompareMode = raw === "peers" || raw === "benchmark" ? raw : "side";
  const setMode = (m: CompareMode) => {
    const next = new URLSearchParams(params.toString());
    next.set("mode", m);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return (
    <div className="space-y-3" data-testid="compare-workspace">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Segmented<CompareMode>
          ariaLabel="Comparison type"
          value={mode}
          onChange={setMode}
          options={[
            { value: "side", label: "Side by side", title: "2–5 companies on the same measures" },
            { value: "peers", label: "Company vs peers", title: "One company against similar companies" },
            { value: "benchmark", label: "Benchmark by group", title: "Cost and profitability medians by sector, business model, fund…" },
          ]}
        />
        <Button onClick={() => window.print()} data-testid="compare-print">
          <Printer className="h-3.5 w-3.5" /> Print / PDF
        </Button>
      </div>
      {/* Shown only on paper: what this is, for which period and scope, and that it is synthetic. */}
      <header className="hidden border-b-2 border-ink pb-2 print:block">
        <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">DualEntry | Portfolio Intelligence · {data.firm.name} · Concept demo · synthetic data</div>
        <h2 className="mt-1 text-xl font-semibold text-ink">{TITLES[mode]}</h2>
        <div className="text-sm text-ink-2">
          {period.label} · {describeFilters(filters, Object.fromEntries(data.funds.map((f) => [f.id, f.shortName])))}
        </div>
      </header>
      {mode === "side" ? <SideBySide /> : mode === "peers" ? <PeersMode /> : <BenchmarkMode />}
    </div>
  );
}
