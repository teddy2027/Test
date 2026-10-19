"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Download, GitCompare, GitMerge, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { getData } from "@/lib/data";
import type { CompanyAnalysis } from "@/lib/engine/company";
import { describeFilters, type Filters } from "@/lib/engine/filters";
import type { MetricFormat } from "@/lib/engine/metrics";
import { comparisonLabel, type ComparisonBasis, type Period } from "@/lib/engine/periods";
import type { PortfolioSummary } from "@/lib/engine/portfolio";
import { buildCsv, downloadText, slug, type CsvColumn } from "@/lib/export";
import { fmtMetric, fmtPct, fmtUsd } from "@/lib/format";
import { CardHeader, MetricLabel, Popover, PopoverContent, PopoverTrigger, Tip, Button } from "../ui/primitives";
import { Delta, StatusPill, WatchButton } from "../fin/fin";
import { routes } from "@/lib/routes";

const MAX_COMPARE = 5;

interface Row {
  a: CompanyAnalysis;
  id: string;
  name: string;
  subsector: string;
  fund: string;
  sector: string;
  vintage: number;
  revenue: number | null;
  revenueGrowth: number | null;
  acquisition: boolean;
  organic: number | null;
  ebitda: number | null;
  ebitdaMargin: number | null;
  ebitdaMarginChange: number | null;
  grossMargin: number | null;
  laborGrowth: number | null;
  cfo: number | null;
  ebitdaVsBudget: number | null;
  revenueVsBudget: number | null;
  status: string;
  arr: number | null;
  laborIntensity: number | null;
  cogsRatio: number | null;
  gaRatio: number | null;
  smRatio: number | null;
  revenuePerEmployee: number | null;
  hasData: boolean;
  system: string;
}

const NUM_SORT = (a: number | null, b: number | null) => {
  if (a === null && b === null) return 0;
  if (a === null) return -1; // nulls sort to the bottom in desc (TanStack inverts)
  if (b === null) return 1;
  return a - b;
};

export function PortfolioTable({ s, basis, filters }: { s: PortfolioSummary; basis: ComparisonBasis; filters: Filters }) {
  const router = useRouter();
  const data = getData();
  const p: Period = s.period;
  const gb = basis === "budget" ? "yoy" : basis;
  const [sorting, setSorting] = useState<SortingState>([{ id: "revenue", desc: true }]);
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<VisibilityState>({ arr: false, laborIntensity: false, cogsRatio: false, gaRatio: false, smRatio: false, revenuePerEmployee: false, revenueVsBudget: false, system: false });
  const [selected, setSelected] = useState<string[]>([]);
  const toggleSelect = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX_COMPARE ? cur : [...cur, id]));

  const rows: Row[] = useMemo(
    () =>
      s.analyses.map((a) => {
        const c = gb === "prior" ? a.prior : a.yoy;
        const m = a.current.metrics;
        return {
          a,
          id: a.company.id,
          name: a.company.name,
          subsector: a.company.subsector,
          fund: data.funds.find((f) => f.id === a.company.fund)!.shortName,
          sector: a.company.sector,
          vintage: a.company.vintage,
          revenue: m.revenue,
          revenueGrowth: c?.revenueGrowth ?? null,
          acquisition: (c?.acquisitions.length ?? 0) > 0,
          organic: c && c.acquisitions.length && c.organicAvailable ? c.organicRevenueGrowth : null,
          ebitda: m.ebitda,
          ebitdaMargin: m.ebitdaMargin,
          ebitdaMarginChange: c?.ebitdaMarginChange ?? null,
          grossMargin: m.grossMargin,
          laborGrowth: c?.laborGrowth ?? null,
          cfo: m.cfo,
          ebitdaVsBudget: a.budget.ebitdaVarPct,
          revenueVsBudget: a.budget.revenueVarPct,
          status: a.current.status,
          arr: m.arr,
          laborIntensity: m.laborIntensity,
          cogsRatio: m.cogsRatio,
          gaRatio: m.gaRatio,
          smRatio: m.smRatio,
          revenuePerEmployee: m.revenuePerEmployee,
          hasData: a.company.lastReportedMonth >= 0,
          system: a.company.accountingSystem,
        };
      }),
    [s.analyses, gb, data.funds],
  );

  const gLabel = gb === "yoy" ? "YoY" : "QoQ";
  const num = (key: keyof Row, header: React.ReactNode, format: MetricFormat, opts: { metricKey?: string; delta?: boolean; title?: string } = {}): ColumnDef<Row> => ({
    id: key as string,
    // null → undefined so that sortUndefined: "last" keeps N/A at the bottom in both directions.
    accessorFn: (r) => (r[key] as number | null) ?? undefined,
    header: () => header,
    sortingFn: (a, b) => NUM_SORT(a.getValue(key as string) as number, b.getValue(key as string) as number),
    sortUndefined: "last",
    meta: { align: "right", title: opts.title ?? (typeof header === "string" ? header : String(key)), format },
    cell: (ctx) => {
      const v = (ctx.getValue() as number | undefined) ?? null;
      return opts.delta ? <Delta value={v} metricKey={opts.metricKey ?? (key as string)} format={format} showIcon={false} /> : <span className={cn("num", v === null && "text-faint")}>{fmtMetric(v, format)}</span>;
    },
  });

  const columns: ColumnDef<Row>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: "Portfolio Company",
      enableHiding: false,
      meta: { title: "Portfolio Company" },
      cell: ({ row }) => (
        <div className="flex min-w-[210px] items-center gap-1.5">
          <Tip content={!row.original.hasData ? "No figures yet — can be compared after the first upload" : selected.includes(row.original.id) ? "Remove from comparison" : selected.length >= MAX_COMPARE ? `Compare up to ${MAX_COMPARE} companies` : "Select to compare"}>
            <input
              type="checkbox"
              aria-label={`Select ${row.original.name} to compare`}
              checked={selected.includes(row.original.id)}
              disabled={!row.original.hasData || (!selected.includes(row.original.id) && selected.length >= MAX_COMPARE)}
              onClick={(e) => e.stopPropagation()}
              onChange={() => toggleSelect(row.original.id)}
              className="h-3.5 w-3.5 cursor-pointer accent-[rgb(var(--brand))] disabled:cursor-not-allowed disabled:opacity-30"
              data-testid={`select-${row.original.id}`}
            />
          </Tip>
          <WatchButton id={row.original.id} />
          <div className="min-w-0">
            <div className="truncate font-medium text-ink group-hover:text-brand">{row.original.name}</div>
            <div className="truncate text-[11px] text-muted">{row.original.subsector}</div>
          </div>
        </div>
      ),
    },
    { id: "fund", accessorKey: "fund", header: "Fund", meta: { title: "Fund" } },
    { id: "sector", accessorKey: "sector", header: "Sector", meta: { title: "Sector" }, cell: (c) => <span className="whitespace-nowrap">{c.getValue() as string}</span> },
    { id: "vintage", accessorKey: "vintage", header: "Vintage", meta: { title: "Investment vintage", align: "right" }, cell: (c) => <span className="num">{c.getValue() as number}</span> },
    num("revenue", <MetricLabel k="revenue" />, "usd", { title: "Revenue" }),
    {
      ...num("revenueGrowth", <MetricLabel k="revenueGrowth" label={`Rev. growth (${gLabel})`} />, "pct", { delta: true, title: `Revenue growth (${gLabel})` }),
      cell: ({ row }) => (
        <span className="inline-flex items-center justify-end gap-1">
          {row.original.acquisition && (
            <Tip content={`Acquisition-affected comparison (not constant-perimeter).${row.original.organic !== null ? ` Organic growth from DualEntry entity ledgers: ${fmtPct(row.original.organic)}.` : " Organic growth not determinable from submitted data."}`}>
              <span className="inline-flex items-center gap-0.5 rounded bg-warn-soft px-1 text-[10px] font-medium text-warn">
                <GitMerge className="h-2.5 w-2.5" />
                M&A
              </span>
            </Tip>
          )}
          <Delta value={row.original.revenueGrowth} metricKey="revenueGrowth" showIcon={false} />
        </span>
      ),
    },
    num("ebitda", <MetricLabel k="ebitda" />, "usd", { title: "EBITDA" }),
    {
      ...num("ebitdaMargin", <MetricLabel k="ebitdaMargin" />, "pct", { title: "EBITDA margin" }),
      cell: ({ row }) => (
        <div className="flex flex-col items-end leading-tight">
          <span className="num">{fmtPct(row.original.ebitdaMargin)}</span>
          <Delta value={row.original.ebitdaMarginChange} metricKey="ebitdaMarginChange" format="pp" showIcon={false} className="text-[11px]" />
        </div>
      ),
    },
    num("grossMargin", <MetricLabel k="grossMargin" />, "pct", { title: "Gross margin" }),
    num("laborGrowth", <MetricLabel k="laborGrowth" label={`Labor growth (${gLabel})`} />, "pct", { delta: true, metricKey: "laborGrowth", title: `Labor cost growth (${gLabel})` }),
    num("cfo", <MetricLabel k="cfo" />, "usd", { title: "Operating cash flow" }),
    num("ebitdaVsBudget", <MetricLabel k="ebitdaVsBudget" label="EBITDA vs Bud." />, "pct", { delta: true, metricKey: "ebitdaVsBudget", title: "EBITDA vs budget" }),
    num("revenueVsBudget", <MetricLabel k="revenueVsBudget" label="Rev. vs Bud." />, "pct", { delta: true, metricKey: "revenueVsBudget", title: "Revenue vs budget" }),
    num("laborIntensity", <MetricLabel k="laborIntensity" />, "pct", { title: "Labor intensity" }),
    num("cogsRatio", <MetricLabel k="cogsRatio" label="Cost of services %" />, "pct", { title: "Cost of services / revenue" }),
    num("gaRatio", <MetricLabel k="gaRatio" label="G&A %" />, "pct", { title: "G&A / revenue" }),
    num("smRatio", <MetricLabel k="smRatio" label="S&M %" />, "pct", { title: "S&M / revenue" }),
    num("revenuePerEmployee", <MetricLabel k="revenuePerEmployee" label="Rev. / employee" />, "usdk", { title: "Revenue per employee" }),
    num("arr", <MetricLabel k="arr" />, "usd", { title: "ARR" }),
    { id: "system", accessorKey: "system", header: "Finance system", meta: { title: "Finance system" } },
    {
      id: "status",
      accessorKey: "status",
      header: "Reporting",
      meta: { title: "Reporting status" },
      cell: ({ row }) => <StatusPill status={row.original.a.current.status} months={row.original.a.current.monthsAvailable} expected={row.original.a.current.monthsExpected} awaiting={row.original.a.company.lastReportedMonth < 0} />,
    },
  ];

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter: query, columnVisibility: visibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setQuery,
    onColumnVisibilityChange: setVisibility,
    globalFilterFn: (row, _id, value: string) => {
      const v = value.toLowerCase();
      const r = row.original;
      return `${r.name} ${r.subsector} ${r.sector} ${r.fund} ${r.system}`.toLowerCase().includes(v);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const exportCsv = () => {
    const visibleCols = table.getVisibleLeafColumns();
    const cols: CsvColumn<Row>[] = visibleCols.map((c) => {
      const meta = c.columnDef.meta as { title?: string; format?: MetricFormat } | undefined;
      if (c.id === "status") return { header: "Reporting status", format: "text", get: (r) => (r.status === "complete" ? "Complete" : r.status === "partial" ? `Partial (${r.a.current.monthsAvailable}/${r.a.current.monthsExpected})` : "Missing") };
      if (c.id === "revenueGrowth") return { header: meta?.title ?? c.id, format: "pct", get: (r) => r.revenueGrowth };
      if (!meta?.format) return { header: meta?.title ?? c.id, format: "text", get: (r) => r[c.id as keyof Row] as string };
      return { header: meta.title ?? c.id, format: meta.format, get: (r) => r[c.id as keyof Row] as number | null };
    });
    if (visibleCols.some((c) => c.id === "revenueGrowth")) cols.push({ header: "Acquisition-affected", format: "text", get: (r) => (r.acquisition ? "Yes" : "No") });
    const csv = buildCsv(
      table.getRowModel().rows.map((r) => r.original),
      cols,
      {
        title: "DualEntry Portfolio Intelligence - Portfolio companies",
        period: p.label,
        comparison: comparisonLabel(gb, p),
        scope: `${describeFilters(filters, Object.fromEntries(data.funds.map((f) => [f.id, f.shortName])))}${query ? ` · Search: "${query}"` : ""}`,
      },
    );
    downloadText(`portfolio-companies-${slug(p.label)}.csv`, csv);
  };

  const totalsCohort = s.analyses.filter((a) => a.current.status === "complete");
  const sumOf = (f: "revenue" | "ebitda" | "cfo") => (totalsCohort.length ? totalsCohort.reduce((x, a) => x + (a.current.metrics[f] ?? 0), 0) : null);
  const totRev = sumOf("revenue");
  const totals: Record<string, React.ReactNode> = {
    name: (
      <div className="pl-11">
        <div className="font-semibold text-ink">Portfolio (Σ)</div>
        <div className="text-[11px] font-normal text-muted">{totalsCohort.length} of {s.analyses.length} companies with complete data</div>
      </div>
    ),
    revenue: <span className="num font-semibold">{fmtUsd(totRev)}</span>,
    revenueGrowth: <Delta value={s.revenueGrowth[gb].aggregate} metricKey="revenueGrowth" showIcon={false} className="font-semibold" />,
    ebitda: <span className="num font-semibold">{fmtUsd(sumOf("ebitda"))}</span>,
    ebitdaMargin: <span className="num font-semibold">{fmtPct(s.kpis.ebitdaMargin.aggregate)}</span>,
    grossMargin: <span className="num font-semibold">{fmtPct(s.kpis.grossMargin.aggregate)}</span>,
    cfo: <span className="num font-semibold">{fmtUsd(sumOf("cfo"))}</span>,
    ebitdaVsBudget: <Delta value={s.kpis.ebitda.comparisons.budget.aggregateChange} metricKey="ebitdaVsBudget" showIcon={false} className="font-semibold" />,
    revenueVsBudget: <Delta value={s.kpis.revenue.comparisons.budget.aggregateChange} metricKey="revenueVsBudget" showIcon={false} className="font-semibold" />,
  };

  return (
    <div className="rounded-lg border border-line bg-surface shadow-card" data-testid="portfolio-table">
      <CardHeader
        title="Portfolio companies"
        description={`${p.label} · growth ${comparisonLabel(gb, p)}${basis === "budget" ? " (budget variance in dedicated columns)" : ""} · USD millions · click a row to open the company`}
        actions={
          <>
            {selected.length > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-muted">
                {selected.length} selected
                <button className="text-brand hover:underline" onClick={() => setSelected([])}>
                  Clear
                </button>
              </span>
            )}
            <Tip content={selected.length < 2 ? `Tick 2–${MAX_COMPARE} companies to compare them side by side` : "Open a side-by-side comparison"}>
              <span>
                <Button size="sm" variant={selected.length >= 2 ? "primary" : "secondary"} disabled={selected.length < 2} onClick={() => router.push(routes.compareSide(selected))} data-testid="compare-selected">
                  <GitCompare className="h-3.5 w-3.5" /> Compare{selected.length >= 2 ? ` (${selected.length})` : ""}
                </Button>
              </span>
            </Tip>
            <label className="flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2 shadow-card">
              <Search className="h-3.5 w-3.5 text-muted" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter table…" aria-label="Filter table" className="w-36 bg-transparent text-sm focus:outline-none" />
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" data-testid="column-visibility">
                  <Columns3 className="h-3.5 w-3.5" /> Columns
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-2">
                <div className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">Visible columns</div>
                {table
                  .getAllLeafColumns()
                  .filter((c) => c.getCanHide())
                  .map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-subtle">
                      <input type="checkbox" className="accent-[rgb(var(--brand))]" checked={c.getIsVisible()} onChange={c.getToggleVisibilityHandler()} />
                      {(c.columnDef.meta as { title?: string })?.title ?? c.id}
                    </label>
                  ))}
              </PopoverContent>
            </Popover>
            <Button size="sm" onClick={exportCsv} data-testid="export-csv">
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          </>
        }
      />
      <div className="thin-scroll overflow-x-auto">
        <table className="w-full min-w-[1180px] border-collapse text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-line bg-subtle">
                {hg.headers.map((h) => {
                  const align = (h.column.columnDef.meta as { align?: string })?.align;
                  const sorted = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      className={cn("whitespace-nowrap px-3 py-2 text-xs font-medium text-muted", align === "right" ? "text-right" : "text-left", h.id === "name" && "sticky left-0 z-10 bg-subtle")}
                    >
                      <button
                        type="button"
                        onClick={h.column.getToggleSortingHandler()}
                        className={cn("inline-flex items-center gap-1 hover:text-ink", align === "right" && "flex-row-reverse", sorted && "text-ink")}
                        data-testid={`sort-${h.id}`}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sorted === "asc" ? <ArrowUp className="h-3 w-3" /> : sorted === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr
                key={r.id}
                data-testid={`row-${r.original.id}`}
                onClick={() => router.push(`/companies/${r.original.id}`)}
                className={cn("group cursor-pointer border-b border-line/70 transition-colors hover:bg-brand-soft/40", r.original.status !== "complete" && "bg-subtle/60")}
              >
                {r.getVisibleCells().map((c) => {
                  const align = (c.column.columnDef.meta as { align?: string })?.align;
                  return (
                    <td key={c.id} className={cn("whitespace-nowrap px-3 py-2 text-ink-2", align === "right" ? "text-right" : "text-left", c.column.id === "name" && "sticky left-0 z-[1] bg-surface group-hover:bg-[#f3f6fe]")}>
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length} className="px-3 py-10 text-center text-sm text-muted">
                  No companies match the current filters{query ? ` and “${query}”` : ""}.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line-strong bg-subtle/70">
              {table.getVisibleLeafColumns().map((c) => {
                const align = (c.columnDef.meta as { align?: string })?.align;
                return (
                  <td key={c.id} className={cn("whitespace-nowrap px-3 py-2.5", align === "right" ? "text-right" : "text-left", c.id === "name" && "sticky left-0 bg-subtle")}>
                    {totals[c.id] ?? ""}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-[11px] text-muted">
        <span>Totals are management-view sums of operating companies with complete data, not GAAP-consolidated fund financials.</span>
        <span>Growth on totals row = aggregate (Σ) on the like-for-like cohort.</span>
        <span className="inline-flex items-center gap-1">
          <GitMerge className="h-3 w-3 text-warn" /> M&A = comparison spans an acquisition.
        </span>
      </div>
    </div>
  );
}
