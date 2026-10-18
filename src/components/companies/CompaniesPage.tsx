"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { GitMerge } from "lucide-react";
import { analyzeCompany } from "@/lib/engine/company";
import { companyQuarterly } from "@/lib/engine/series";
import { fmtPct, fmtUsd, formatDate } from "@/lib/format";
import { useScope } from "@/lib/state/hooks";
import { ConnectionBadge, Delta, FreshnessDot, Sparkline, StatusPill, WatchButton } from "../fin/fin";
import { PageHeader } from "../overview/OverviewPage";
import { Button, Segmented } from "../ui/primitives";
import { Plus } from "lucide-react";
import { AddCompanyDialog } from "./AddCompanyDialog";

type Group = "fund" | "sector" | "connection";

export function CompaniesPage() {
  const { companies, period, data } = useScope();
  const [group, setGroup] = useState<Group>("fund");
  const [add, setAdd] = useState(false);
  const items = useMemo(
    () =>
      companies.map((c) => ({
        c,
        a: analyzeCompany(c.id, period),
        spark: companyQuarterly(c.id, period.end, 8).map((r) => r.revenue),
      })),
    [companies, period],
  );
  const keyOf = (c: (typeof companies)[number]) =>
    group === "fund" ? data.funds.find((f) => f.id === c.fund)!.name : group === "sector" ? c.sector : c.lastReportedMonth < 0 ? "Awaiting data" : c.connection === "dualentry" ? "DualEntry · live" : "Uploaded by Northbridge";
  const groups = [...new Set(items.map((i) => keyOf(i.c)))];
  return (
    <div>
      <PageHeader title="Portfolio Companies" subtitle={`${companies.length} companies · ${period.label} · fictional companies and synthetic data`}>
        <Button variant="primary" onClick={() => setAdd(true)} data-testid="add-company">
          <Plus className="h-3.5 w-3.5" /> Add portfolio company
        </Button>
        <Segmented<Group>
          ariaLabel="Group companies by"
          value={group}
          onChange={setGroup}
          options={[
            { value: "fund", label: "By fund" },
            { value: "sector", label: "By sector" },
            { value: "connection", label: "By data connection" },
          ]}
        />
      </PageHeader>
      {groups.map((g) => (
        <section key={g} className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted">
            {g} · {items.filter((i) => keyOf(i.c) === g).length}
          </h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {items
              .filter((i) => keyOf(i.c) === g)
              .map(({ c, a, spark }) => (
                <Link key={c.id} href={`/companies/${c.id}`} className="group rounded-lg border border-line bg-surface p-4 shadow-card transition-all hover:border-brand/40 hover:shadow-pop" data-testid="company-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <WatchButton id={c.id} />
                        <span className="truncate font-semibold text-ink group-hover:text-brand">{c.name}</span>
                      </div>
                      <div className="truncate pl-5 text-xs text-muted">
                        {c.subsector} · {data.funds.find((f) => f.id === c.fund)!.shortName} · invested {formatDate(c.investmentDate)}
                      </div>
                    </div>
                    <Sparkline values={spark} width={70} height={26} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div>
                      <div className="text-[11px] text-muted">Revenue</div>
                      <div className="num text-sm font-semibold text-ink">{fmtUsd(a.current.metrics.revenue)}</div>
                      <Delta value={a.yoy?.revenueGrowth} metricKey="revenueGrowth" className="text-[11px]" />
                    </div>
                    <div>
                      <div className="text-[11px] text-muted">EBITDA margin</div>
                      <div className="num text-sm font-semibold text-ink">{fmtPct(a.current.metrics.ebitdaMargin)}</div>
                      <Delta value={a.yoy?.ebitdaMarginChange} metricKey="ebitdaMarginChange" format="pp" className="text-[11px]" />
                    </div>
                    <div>
                      <div className="text-[11px] text-muted">vs Budget</div>
                      <div className="num text-sm font-semibold text-ink">{fmtPct(a.budget.revenueVarPct, { signed: true })}</div>
                      <span className="text-[11px] text-muted">revenue</span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
                    <ConnectionBadge company={c} compact />
                    <StatusPill status={a.current.status} months={a.current.monthsAvailable} expected={a.current.monthsExpected} awaiting={c.lastReportedMonth < 0} />
                    {(a.yoy?.acquisitions.length ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-warn-soft px-1 text-[10px] font-medium text-warn">
                        <GitMerge className="h-2.5 w-2.5" /> M&A
                      </span>
                    )}
                    <span className="ml-auto">
                      <FreshnessDot company={c} />
                    </span>
                  </div>
                </Link>
              ))}
          </div>
        </section>
      ))}
      <AddCompanyDialog open={add} onOpenChange={setAdd} />
      {companies.length === 0 && <p className="rounded-lg border border-line bg-surface p-10 text-center text-sm text-muted">No companies match the current filters.</p>}
    </div>
  );
}
