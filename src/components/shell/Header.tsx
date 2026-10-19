"use client";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import * as RDropdown from "@radix-ui/react-dropdown-menu";
import { BookOpen, Building2, CalendarRange, ChevronDown, FileText, FlaskConical, RotateCcw, Search, SlidersHorizontal, Star } from "lucide-react";
import { cn } from "@/lib/cn";
import { getData } from "@/lib/data";
import type { BusinessModel, FundId, Geography, Sector } from "@/lib/data/types";
import { activeFilterCount } from "@/lib/engine/filters";
import { selectableQuarters, selectableYears, type ComparisonBasis, type PeriodKind } from "@/lib/engine/periods";
import { useApp } from "@/lib/state/store";
import { useDataVersion, useWorkspace } from "@/lib/workspace/store";
import { Badge, Button, MultiSelect, Popover, PopoverContent, PopoverTrigger, Select, Tip } from "../ui/primitives";

const TITLES: [string, string][] = [
  ["/companies/", "Companies · Company"],
  ["/companies", "Companies"],
  ["/connections", "Data Connections"],
  ["/reporting", "Portfolio · Quarterly pack"],
  ["/", "Portfolio"],
];

function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const rev = useDataVersion();
  const data = getData();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement))) {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 10);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const pages = [
    { label: "Portfolio", href: "/" },
    { label: "Companies", href: "/companies" },
    { label: "Findings — companies needing attention", href: routes.findings() },
    { label: "Compare companies", href: "/companies?tab=compare" },
    { label: "Benchmark by group (cost benchmarking)", href: routes.benchmark() },
    { label: "Ask Your Portfolio", href: routes.ask() },
    { label: "Data Connections", href: "/connections" },
    { label: "Quarterly portfolio pack", href: "/reporting" },
  ];
  const term = q.trim().toLowerCase();
  const results = useMemo(() => {
    const cos = data.companies
      .filter((c) => !term || `${c.name} ${c.subsector} ${c.sector} ${c.accountingSystem}`.toLowerCase().includes(term))
      .map((c) => ({ label: c.name, sub: `${c.subsector} · ${data.funds.find((f) => f.id === c.fund)!.shortName}`, href: `/companies/${c.id}`, kind: "company" as const }));
    const pg = pages.filter((p) => !term || p.label.toLowerCase().includes(term)).map((p) => ({ ...p, sub: "Page", kind: "page" as const }));
    return [...cos, ...pg].slice(0, 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, rev]);
  const [idx, setIdx] = useState(0);
  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          data-testid="global-search"
          className="flex h-8 w-[220px] items-center gap-2 rounded-md border border-line-strong bg-surface px-2.5 text-sm text-muted shadow-card hover:bg-subtle"
          onClick={() => setTimeout(() => inputRef.current?.focus(), 10)}
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 truncate whitespace-nowrap text-left">Search companies…</span>
          <kbd className="rounded border border-line bg-subtle px-1 text-[10px] text-faint">⌘K</kbd>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="h-4 w-4 text-muted" />
          <input
            ref={inputRef}
            value={q}
            aria-label="Search"
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setIdx((i) => Math.min(i + 1, results.length - 1));
              if (e.key === "ArrowUp") setIdx((i) => Math.max(i - 1, 0));
              if (e.key === "Enter" && results[idx]) go(results[idx].href);
            }}
            placeholder="Search companies, sectors, systems, pages"
            className="h-10 flex-1 bg-transparent text-sm text-ink placeholder:text-faint focus:outline-none"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {results.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted">No matches for “{q}”.</div>}
          {results.map((r, i) => (
            <button
              key={r.href}
              onMouseEnter={() => setIdx(i)}
              onClick={() => go(r.href)}
              className={cn("flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left", i === idx ? "bg-subtle" : "")}
            >
              {r.kind === "company" ? <Building2 className="h-3.5 w-3.5 text-muted" /> : <FileText className="h-3.5 w-3.5 text-muted" />}
              <span className="flex-1 truncate text-sm text-ink">{r.label}</span>
              <span className="truncate text-xs text-faint">{r.sub}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function UserMenu() {
  const setMethodologyOpen = useApp((s) => s.setMethodologyOpen);
  const setWatchlistOpen = useApp((s) => s.setWatchlistOpen);
  const reset = useApp((s) => s.resetFilters);
  const clearChat = useApp((s) => s.clearChat);
  const resetWorkspace = useWorkspace((s) => s.reset);
  return (
    <RDropdown.Root>
      <RDropdown.Trigger asChild>
        <button className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-subtle" aria-label="User menu">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white">AM</span>
          <span className="hidden whitespace-nowrap text-left leading-tight 2xl:block">
            <span className="block text-xs font-medium text-ink">Alex Morgan</span>
            <span className="block text-[11px] text-muted">Operating Partner · Demo</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted" />
        </button>
      </RDropdown.Trigger>
      <RDropdown.Portal>
        <RDropdown.Content align="end" sideOffset={6} className="z-[70] w-60 rounded-lg border border-line bg-surface p-1 shadow-pop animate-in">
          <div className="px-2.5 py-2">
            <div className="text-sm font-medium text-ink">Alex Morgan (fictional)</div>
            <div className="text-xs text-muted">Northbridge Equity Partners · demo user</div>
          </div>
          <RDropdown.Separator className="my-1 h-px bg-line" />
          {[
            { label: "Watchlist", icon: Star, on: () => setWatchlistOpen(true) },
            { label: "Methodology & definitions", icon: BookOpen, on: () => setMethodologyOpen(true) },
            {
              label: "Reset filters & chat",
              icon: RotateCcw,
              on: () => {
                reset();
                clearChat();
              },
            },
            {
              label: "Reset demo data (remove added companies, uploads)",
              icon: RotateCcw,
              on: () => {
                if (window.confirm("Remove companies, uploads, DualEntry invites and data shares added in this browser, and restore the original demo portfolio?")) {
                  resetWorkspace();
                  reset();
                  clearChat();
                  window.location.assign("/");
                }
              },
            },
          ].map((i) => (
            <RDropdown.Item key={i.label} onSelect={i.on} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-ink outline-none data-[highlighted]:bg-subtle">
              <i.icon className="h-3.5 w-3.5 text-muted" /> {i.label}
            </RDropdown.Item>
          ))}
        </RDropdown.Content>
      </RDropdown.Portal>
    </RDropdown.Root>
  );
}

function MoreFilters() {
  const filters = useApp((s) => s.filters);
  const setFilters = useApp((s) => s.setFilters);
  const n = filters.businessModels.length + filters.geographies.length + (filters.investedFrom || filters.investedTo ? 1 : 0);
  const models: BusinessModel[] = ["Subscription software", "Recurring managed services", "Project-based services", "Workforce & staffing", "Tech-enabled services"];
  const geos: Geography[] = ["North America", "UK & Europe"];
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          data-testid="more-filters"
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm shadow-card",
            n ? "border-brand/40 bg-brand-soft text-brand-ink" : "border-line-strong bg-surface text-ink hover:bg-subtle",
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> More{n ? ` · ${n}` : ""}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3">
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Business model</div>
            <div className="flex flex-wrap gap-1.5">
              {models.map((m) => (
                <button
                  key={m}
                  onClick={() => setFilters({ businessModels: toggle(filters.businessModels, m) })}
                  className={cn("rounded-md border px-2 py-1 text-xs", filters.businessModels.includes(m) ? "border-brand bg-brand-soft text-brand-ink" : "border-line text-ink-2 hover:bg-subtle")}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Geography</div>
            <div className="flex flex-wrap gap-1.5">
              {geos.map((g) => (
                <button
                  key={g}
                  onClick={() => setFilters({ geographies: toggle(filters.geographies, g) })}
                  className={cn("rounded-md border px-2 py-1 text-xs", filters.geographies.includes(g) ? "border-brand bg-brand-soft text-brand-ink" : "border-line text-ink-2 hover:bg-subtle")}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <CalendarRange className="h-3.5 w-3.5" /> Investment date range
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                aria-label="Invested from"
                value={filters.investedFrom ?? ""}
                min="2019-01-01"
                max="2026-10-14"
                onChange={(e) => setFilters({ investedFrom: e.target.value || null })}
                className="h-8 flex-1 rounded-md border border-line-strong px-2 text-xs"
              />
              <span className="text-xs text-muted">to</span>
              <input
                type="date"
                aria-label="Invested to"
                value={filters.investedTo ?? ""}
                min="2019-01-01"
                max="2026-10-14"
                onChange={(e) => setFilters({ investedTo: e.target.value || null })}
                className="h-8 flex-1 rounded-md border border-line-strong px-2 text-xs"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="xs" variant="ghost" onClick={() => setFilters({ businessModels: [], geographies: [], investedFrom: null, investedTo: null })}>
              Clear these
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FilterBar() {
  const data = getData();
  const filters = useApp((s) => s.filters);
  const setFilters = useApp((s) => s.setFilters);
  const selection = useApp((s) => s.selection);
  const setSelection = useApp((s) => s.setSelection);
  const basis = useApp((s) => s.basis);
  const setBasis = useApp((s) => s.setBasis);
  const reset = useApp((s) => s.resetFilters);
  const nActive = activeFilterCount(filters);
  const periodChanged = selection.kind !== "quarter" || selection.quarter !== "2026-Q3" || basis !== "yoy";
  const vintages = Array.from(new Set(data.companies.map((c) => c.vintage))).sort();
  const fundValue = filters.funds.length === 1 ? filters.funds[0] : filters.funds.length === 0 ? "all" : "multi";
  const priorLabel = selection.kind === "quarter" ? "vs Prior quarter" : selection.kind === "ttm" ? "vs Prior TTM (−1Q)" : "vs Prior period";
  return (
    <div className="no-print flex flex-wrap items-center gap-2 border-b border-line bg-surface/80 px-6 py-2 backdrop-blur">
      <Select
        ariaLabel="Fund"
        prefix="Fund" compactPrefix
        value={fundValue}
        onChange={(v) => setFilters({ funds: v === "all" ? [] : [v as FundId] })}
        className={cn(filters.funds.length && "border-brand/40 bg-brand-soft")}
        options={[
          { value: "all", label: "All funds" },
          ...data.funds.map((f) => ({ value: f.id, label: `${f.shortName} (${f.vintage})` })),
          ...(fundValue === "multi" ? [{ value: "multi", label: "Multiple" }] : []),
        ]}
      />
      <div className="mx-1 h-5 w-px bg-line" />
      <Select
        ariaLabel="Period type"
        prefix="Period" compactPrefix
        value={selection.kind}
        onChange={(v) => setSelection({ kind: v as PeriodKind })}
        options={[
          { value: "quarter", label: "Quarter" },
          { value: "ytd", label: "Year to date" },
          { value: "ttm", label: "Trailing 12M" },
          { value: "fy", label: "Fiscal year" },
        ]}
      />
      {selection.kind === "fy" ? (
        <Select ariaLabel="Year" value={String(selection.year)} onChange={(v) => setSelection({ year: Number(v) })} options={selectableYears().map((y) => ({ value: String(y), label: `FY ${y}` }))} />
      ) : (
        <Select
          ariaLabel="Reporting period"
          value={selection.quarter}
          onChange={(v) => setSelection({ quarter: v })}
          options={selectableQuarters().map((q) => ({ value: q.key, label: selection.kind === "quarter" ? q.label : `through ${q.label}` }))}
        />
      )}
      <Select
        ariaLabel="Comparison"
        prefix="Compare" compactPrefix
        value={basis}
        onChange={(v) => setBasis(v as ComparisonBasis)}
        options={[
          { value: "yoy", label: selection.kind === "quarter" ? "vs Same quarter LY" : "vs Prior year" },
          { value: "prior", label: priorLabel, disabled: selection.kind === "fy" || selection.kind === "ytd" },
          { value: "budget", label: "vs Budget" },
        ]}
      />
      <div className="mx-1 h-5 w-px bg-line" />
      <MultiSelect<Sector>
        testId="filter-sector"
        label="Industry"
        values={filters.sectors}
        onChange={(v) => setFilters({ sectors: v })}
        options={(["Software", "Business Services"] as Sector[]).map((s) => ({ value: s, label: s, hint: String(data.companies.filter((c) => c.sector === s).length) }))}
      />
      <MultiSelect<number>
        testId="filter-vintage"
        label="Vintage"
        values={filters.vintages}
        onChange={(v) => setFilters({ vintages: v })}
        options={vintages.map((y) => ({ value: y, label: String(y), hint: String(data.companies.filter((c) => c.vintage === y).length) }))}
      />
      <MoreFilters />
      {(nActive > 0 || periodChanged) && (
        <Button data-testid="reset-filters" size="sm" variant="ghost" onClick={reset} className="text-brand">
          <RotateCcw className="h-3.5 w-3.5" /> Reset{nActive ? ` (${nActive})` : ""}
        </Button>
      )}
    </div>
  );
}

export function Header() {
  const path = usePathname();
  const title = TITLES.find(([p]) => (p === "/" ? path === "/" : path.startsWith(p)))?.[1] ?? "";
  const setWatchlistOpen = useApp((s) => s.setWatchlistOpen);
  const watch = useApp((s) => s.watchlist);
  const data = getData();
  return (
    <header className="no-print sticky top-0 z-40 bg-canvas">
      <div className="flex h-12 items-center gap-3 border-b border-line bg-surface px-6">
        <Link href="/" className="mr-1 whitespace-nowrap text-sm font-semibold text-ink lg:hidden" aria-label="Home">
          DualEntry
        </Link>
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="truncate text-muted">{data.firm.name}</span>
          <span className="text-faint">/</span>
          <span className="truncate font-semibold text-ink">{title}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Tip content="Concept demonstration. Northbridge Equity Partners, its funds and all companies are fictional; every figure is synthetic.">
            <span data-testid="demo-indicator">
              <Badge tone="warn" className="py-0.5">
                <FlaskConical className="h-3 w-3" /> Concept Demo · Fictional Data
              </Badge>
            </span>
          </Tip>
          <Tip content="Portfolio reporting currency is USD. Horizon Advisory reports in GBP and is translated at synthetic monthly average (P&L) and month-end (balance) rates.">
            <span>
              <Badge tone="outline" className="py-0.5">USD</Badge>
            </span>
          </Tip>
          <GlobalSearch />
          <Tip content="Watchlist">
            <button onClick={() => setWatchlistOpen(true)} className="relative rounded-md p-1.5 text-muted hover:bg-subtle hover:text-ink" aria-label="Open watchlist">
              <Star className="h-4 w-4" />
              {watch.length > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-warn px-1 text-[9px] font-semibold text-white">{watch.length}</span>}
            </button>
          </Tip>
          <UserMenu />
        </div>
      </div>
      <nav className="thin-scroll flex gap-1 overflow-x-auto border-b border-line bg-surface px-4 py-1.5 lg:hidden" aria-label="Sections">
        {[
          ["/", "Portfolio"],
          ["/companies", "Companies"],
          ["/connections", "Data Connections"],
        ].map(([href, label]) => (
          <Link key={href} href={href} className={cn("whitespace-nowrap rounded-md px-2.5 py-1 text-sm", (href === "/" ? path === "/" : path.startsWith(href)) ? "bg-brand-soft font-medium text-brand-ink" : "text-ink-2 hover:bg-subtle")}>
            {label}
          </Link>
        ))}
      </nav>
      <FilterBar />
    </header>
  );
}
