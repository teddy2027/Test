"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Star, XCircle } from "lucide-react";
import { validateDataset, type ValidationReport } from "@/lib/data/validate";
import { getData } from "@/lib/data";
import { analyzeCompany } from "@/lib/engine/company";
import { detectCompanyInsights, THRESHOLDS } from "@/lib/engine/insights";
import { MIN_COHORT, CAUTION_COHORT } from "@/lib/engine/benchmark";
import { fmtPct, fmtPp, fmtUsd } from "@/lib/format";
import { useScope } from "@/lib/state/hooks";
import { useApp } from "@/lib/state/store";
import { Dialog, EmptyState, Sheet } from "../ui/primitives";
import { ConnectionBadge, Delta, SeverityBadge, StatusPill, WatchButton } from "../fin/fin";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h4 className="mb-1.5 text-sm font-semibold text-ink">{title}</h4>
      <div className="space-y-1.5 text-sm leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

export function MethodologyDialog() {
  const open = useApp((s) => s.methodologyOpen);
  const setOpen = useApp((s) => s.setMethodologyOpen);
  const [report, setReport] = useState<ValidationReport | null>(null);
  useEffect(() => {
    if (open && !report) setReport(validateDataset(getData()));
  }, [open, report]);
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Methodology & definitions" description="How every number in Portfolio Intelligence is calculated." className="w-[min(820px,calc(100vw-32px))]">
      <Section title="Accounting convention">
        <p>Revenue − COGS = Gross profit. COGS = direct labor + other cost of revenue. Gross profit − operating expenses (S&M + R&D + G&A + other opex) = EBITDA (management-reported, unadjusted).</p>
        <p>Labor expense = direct labor (inside COGS) + operating personnel (the personnel portion inside S&M, R&D and G&A). The two categories are mutually exclusive; operating personnel is a memo split and is never added to EBITDA twice.</p>
        <p>Operating cash flow is reported by each company: EBITDA − cash interest − cash taxes − increase in net working capital. It is never approximated by EBITDA. Cash conversion = operating cash flow ÷ EBITDA (N/A when EBITDA ≤ 0).</p>
        <p>ARR = 12 × month-end subscription MRR, shown only for subscription businesses. ARR is not recognized revenue.</p>
      </Section>
      <Section title="Portfolio aggregation">
        <p><strong>Aggregate (portfolio-weighted)</strong> metrics sum the numerator and denominator across companies: portfolio EBITDA margin = Σ EBITDA ÷ Σ revenue; aggregate growth = Σ current ÷ Σ comparison − 1 over the same eligible cohort.</p>
        <p><strong>Average company</strong> metrics are the arithmetic mean of each eligible company&apos;s own ratio or growth rate. The two are always labelled and can be switched on the Overview.</p>
        <p>Only companies with complete data for every month of a period are included. Growth uses a like-for-like cohort with complete data in both periods; coverage (e.g. “10 of 12”) is always shown.</p>
        <p>Sums are management-view aggregates of operating companies — not GAAP-consolidated financial statements of the fund.</p>
      </Section>
      <Section title="Periods, comparisons and acquisitions">
        <p>All companies are shown on calendar quarters, calendarised from monthly data (exact, not approximated) — including companies with June or March fiscal year ends.</p>
        <p>Comparisons: prior quarter, same quarter last year, budget, trailing twelve months and fiscal year. Ratio differences are shown in percentage points (pp); growth rates as percentages; division by zero or a non-positive base returns N/A.</p>
        <p>A comparison is <strong>acquisition-affected</strong> when an acquisition closed after the start of the comparison period and on or before the end of the current period. Organic growth is only shown where entity-level ledger data (DualEntry-connected companies) allows a constant perimeter; otherwise it is reported as unavailable.</p>
      </Section>
      <Section title="Budget variance">
        <p>Variance = Actual − Budget; Variance % = (Actual − Budget) ÷ |Budget|. Positive is favorable for revenue, EBITDA and cash flow; for cost lines a positive variance is unfavorable. Budgets exclude acquisitions closed during the budget year. Non-USD budgets are translated at actual average rates, so variances exclude FX.</p>
      </Section>
      <Section title="Peer benchmarks">
        <p>Default benchmark statistic is the peer <strong>median</strong>; the subject company is always excluded from its own baseline. Peer cohorts respect global filters. Cohorts with fewer than {MIN_COHORT} eligible peers are flagged as not meaningful; fewer than {CAUTION_COHORT} carry a small-cohort caution; mixed software/services cohorts carry a heterogeneity warning.</p>
      </Section>
      <Section title="Currency">
        <p>Reporting currency is USD. Horizon Advisory reports in GBP: P&L and cash flows are translated at synthetic monthly average rates, balances at month-end rates. Growth in USD therefore includes FX movement.</p>
      </Section>
      <Section title="Insight thresholds (configurable constants)">
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <li>Labor growth − revenue growth &gt; {fmtPp(THRESHOLDS.laborGapPp, { signed: false, decimals: 0 })} (high ≥ {fmtPp(THRESHOLDS.laborGapHighPp, { signed: false, decimals: 0 })})</li>
          <li>EBITDA margin contraction &gt; {fmtPp(THRESHOLDS.marginContractionPp, { signed: false, decimals: 0 })} YoY</li>
          <li>Revenue below budget by &gt; {fmtPct(THRESHOLDS.revenueBudgetMissPct, { decimals: 0 })}</li>
          <li>EBITDA below budget by &gt; {fmtPct(THRESHOLDS.ebitdaBudgetMissPct, { decimals: 0 })}</li>
          <li>TTM cash conversion &lt; {fmtPct(THRESHOLDS.cashConversionFloor, { decimals: 0 })}</li>
          <li>Growth below peer median by &gt; {fmtPp(THRESHOLDS.cohortGrowthGapPp, { signed: false, decimals: 0 })}</li>
          <li>Gross margin decline &gt; {fmtPp(THRESHOLDS.grossMarginDeclinePp, { signed: false, decimals: 0 })} YoY</li>
          <li>Data older than {THRESHOLDS.staleDays} days flagged stale</li>
        </ul>
        <p className="text-xs text-muted">Insights describe observed differences. Possible explanations are hypotheses to investigate, not established causes.</p>
      </Section>
      <Section title="Live data-integrity checks">
        {!report ? (
          <p className="text-muted">Running…</p>
        ) : (
          <ul className="space-y-1" data-testid="validation-report">
            {report.checks.map((c) => (
              <li key={c.name} className="flex items-center gap-2 text-xs">
                {c.passed ? <CheckCircle2 className="h-3.5 w-3.5 text-pos" /> : <XCircle className="h-3.5 w-3.5 text-neg" />}
                <span className="flex-1">{c.name}</span>
                <span className="num text-faint">{c.count.toLocaleString()} records</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <p className="border-t border-line pt-3 text-xs text-muted">{getData().firm.disclaimer}</p>
    </Dialog>
  );
}

export function WatchlistSheet() {
  const open = useApp((s) => s.watchlistOpen);
  const setOpen = useApp((s) => s.setWatchlistOpen);
  const watch = useApp((s) => s.watchlist);
  const { period, companies, data } = useScope();
  const items = useMemo(
    () =>
      watch
        .map((id) => data.companyById.get(id))
        .filter((c): c is NonNullable<typeof c> => !!c)
        .map((c) => {
          const a = analyzeCompany(c.id, period);
          const ins = detectCompanyInsights(a, companies.length ? companies : data.companies, period).filter((i) => i.severity !== "low" && i.severity !== "positive");
          return { c, a, ins };
        }),
    [watch, period, companies, data],
  );
  return (
    <Sheet open={open} onOpenChange={setOpen} title="Watchlist" description={`Companies marked for follow-up · ${period.label}`} width={520}>
      <div className="space-y-3 p-4">
        {items.length === 0 && (
          <EmptyState icon={<Star className="h-6 w-6" />} title="No companies on the watchlist">
            Use the star next to any company to track it here.
          </EmptyState>
        )}
        {items.map(({ c, a, ins }) => (
          <div key={c.id} className="rounded-lg border border-line bg-surface p-3 shadow-card">
            <div className="flex items-center gap-2">
              <WatchButton id={c.id} />
              <Link href={`/companies/${c.id}`} onClick={() => setOpen(false)} className="font-semibold text-ink hover:text-brand">
                {c.name}
              </Link>
              <span className="text-xs text-muted">{c.subsector}</span>
              <span className="ml-auto">
                <ConnectionBadge company={c} compact />
              </span>
            </div>
            {a.current.status !== "complete" ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                <StatusPill status={a.current.status} months={a.current.monthsAvailable} expected={a.current.monthsExpected} /> No complete data for {period.label}.
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-muted">Revenue</div>
                  <div className="num font-semibold text-ink">{fmtUsd(a.current.metrics.revenue)}</div>
                  <Delta value={a.yoy?.revenueGrowth} metricKey="revenueGrowth" />
                </div>
                <div>
                  <div className="text-muted">EBITDA margin</div>
                  <div className="num font-semibold text-ink">{fmtPct(a.current.metrics.ebitdaMargin)}</div>
                  <Delta value={a.yoy?.ebitdaMarginChange} metricKey="ebitdaMarginChange" format="pp" />
                </div>
                <div>
                  <div className="text-muted">vs Budget (rev)</div>
                  <div className="num font-semibold text-ink">{fmtPct(a.budget.revenueVarPct, { signed: true })}</div>
                </div>
              </div>
            )}
            {ins.length > 0 && (
              <ul className="mt-2.5 space-y-1.5 border-t border-line pt-2.5">
                {ins.slice(0, 3).map((i) => (
                  <li key={i.id} className="flex items-start gap-2 text-xs">
                    <SeverityBadge severity={i.severity} />
                    <span className="text-ink-2">{i.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Sheet>
  );
}
