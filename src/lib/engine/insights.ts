/**
 * Deterministic, explainable insight detection.
 *
 * Each rule reads metrics computed by the analytics engine and fires when a
 * configurable threshold is crossed. Findings describe observed differences —
 * possible explanations are framed as hypotheses to investigate, never as causes.
 */
import { DEMO_TODAY, lastReportedLabel, monthLabel } from "../data/calendar";
import { getData, type IndexedDataset } from "../data";
import type { Company } from "../data/types";
import { ppChange, safeDiv, type N } from "./core";
import { analyzeCompany, type CompanyAnalysis } from "./company";
import { benchmarkMetric, buildBenchmark } from "./benchmark";
import type { MetricFormat } from "./metrics";
import { comparisonPeriod, makePeriod, trendQuarters, type Period } from "./periods";

export const THRESHOLDS = {
  /** Labor cost growth minus revenue growth (YoY). */
  laborGapPp: 0.08,
  laborGapHighPp: 0.1,
  /** EBITDA margin contraction YoY. */
  marginContractionPp: 0.03,
  marginContractionHighPp: 0.05,
  marginExpansionPp: 0.03,
  grossMarginDeclinePp: 0.02,
  /** Revenue below budget. */
  revenueBudgetMissPct: 0.1,
  revenueBudgetMissHighPct: 0.15,
  persistentMissPct: 0.05,
  persistentMissQuarters: 3,
  ebitdaBudgetMissPct: 0.15,
  ebitdaBudgetMissHighPct: 0.25,
  cfoBudgetMissPct: 0.25,
  /** TTM operating cash flow ÷ EBITDA. */
  cashConversionFloor: 0.5,
  cashConversionHigh: 0.4,
  cfoDeclinePct: 0.15,
  /** Gap versus peer-cohort median. */
  cohortGrowthGapPp: 0.08,
  cohortMarginGapPp: 0.08,
  growthAccelerationPp: 0.05,
  operatingLeveragePp: 0.08,
  gaRatioRisePp: 0.015,
  /** Period-over-period anomaly detection. */
  unusualRevenueQoQ: 0.15,
  gmStepPp: 0.025,
  ebitdaStableBandPp: 0.012,
  staleDays: 30,
} as const;

export type InsightCategory = "Growth" | "Profitability" | "Cost Efficiency" | "Cash Flow" | "Reporting Quality";
export type Severity = "high" | "medium" | "low" | "positive";

export const CATEGORIES: InsightCategory[] = ["Growth", "Profitability", "Cost Efficiency", "Cash Flow", "Reporting Quality"];

export interface InsightFigure {
  label: string;
  value: N;
  format: MetricFormat;
}

export interface Insight {
  id: string;
  rule: string;
  companyId: string;
  companyName: string;
  category: InsightCategory;
  severity: Severity;
  title: string;
  finding: string;
  period: string;
  comparison: string;
  figures: InsightFigure[];
  explanations: string[];
  caveats: string[];
  /** Metric keys to chart in the drill-down. */
  chartMetrics: string[];
  magnitude: number;
}

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const ppAdj = (v: number, d = 1) => `${Math.abs(v * 100).toFixed(d)}-percentage-point`;
const pp = (v: number, d = 1) => `${Math.abs(v * 100).toFixed(d)} percentage point${Math.abs(v * 100).toFixed(d) === "1.0" ? "" : "s"}`;
const signedPct = (v: number, d = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(d)}%`;
const usd = (v: number) => `$${Math.abs(v) >= 1 ? v.toFixed(1) + "M" : (v * 1000).toFixed(0) + "K"}`;

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2, positive: 3 };

function acqCaveat(a: CompanyAnalysis): string[] {
  const acqs = a.yoy?.acquisitions ?? [];
  if (!acqs.length) return [];
  return acqs.map(
    (t) =>
      `Comparison spans the ${t.target} acquisition (closed ${monthLabel(t.closeMonth!)}); reported growth is not constant-perimeter.` +
      (a.yoy?.organicAvailable && a.yoy.organicRevenueGrowth !== null ? ` Organic revenue growth from entity ledgers: ${pct(a.yoy.organicRevenueGrowth)}.` : " Organic split not available from submitted data."),
  );
}

function sourceCaveat(c: Company): string[] {
  return c.connection === "dualentry" ? [] : [`Source: ${c.dataSource}. Figures as submitted; account-level drill-down not available.`];
}

export function detectCompanyInsights(a: CompanyAnalysis, universe: Company[], p: Period, data: IndexedDataset = getData()): Insight[] {
  const out: Insight[] = [];
  const c = a.company;
  const m = a.current.metrics;
  const y = a.yoy;
  const T = THRESHOLDS;
  const yLabel = y ? `vs ${y.period.label}` : "";
  const push = (i: Omit<Insight, "id" | "companyId" | "companyName" | "period">) =>
    out.push({ ...i, id: `${i.rule}:${c.id}:${p.label}`, companyId: c.id, companyName: c.name, period: p.label });

  // ---------------- Reporting quality (evaluated even without current data) ----------------
  if (a.current.status !== "complete" && c.lastReportedMonth < 0) {
    push({
      rule: "awaiting_first_data",
      category: "Reporting Quality",
      severity: "medium",
      title: "Awaiting first data",
      finding:
        c.connection === "dualentry"
          ? `${c.name} was added to the portfolio; the data-sharing request is awaiting the company's approval in DualEntry.`
          : `${c.name} was added to the portfolio; no monthly pack has been uploaded yet.`,
      comparison: "",
      figures: [],
      explanations: c.connection === "dualentry" ? ["Company reviewing the requested scope"] : ["First pack not yet received from the company", "Upload pending on the Northbridge side"],
      caveats: [],
      chartMetrics: ["revenue"],
      magnitude: 1,
    });
    return out;
  }
  if (a.current.status !== "complete") {
    const missing = a.current.status === "missing";
    push({
      rule: missing ? "missing_submission" : "partial_submission",
      category: "Reporting Quality",
      severity: missing ? "high" : "medium",
      title: missing ? "No financial submission for the period" : "Incomplete submission for the period",
      finding: missing
        ? `${c.name} has not submitted financials for ${p.label}. Last reported month: ${lastReportedLabel(c.lastReportedMonth)}. The company is excluded from portfolio totals and like-for-like comparisons for this period.`
        : `${c.name} submitted ${a.current.monthsAvailable} of ${a.current.monthsExpected} months for ${p.label} (through ${lastReportedLabel(c.lastReportedMonth)}). Period totals are not computed from partial data; the company is excluded from period aggregates.`,
      comparison: "",
      figures: [
        { label: "Months received", value: a.current.monthsAvailable, format: "count" },
        { label: "Months expected", value: a.current.monthsExpected, format: "count" },
      ],
      explanations: ["Finance team capacity during close", "Manual reporting pack (no system connection)", "Pending sponsor follow-up on submission"],
      caveats: [],
      chartMetrics: ["revenue"],
      magnitude: missing ? 2 : 1,
    });
  }
  const daysSince = Math.round((Date.parse(DEMO_TODAY) - Date.parse(c.lastUpdated)) / 86400000);
  if (daysSince > T.staleDays) {
    push({
      rule: "stale_data",
      category: "Reporting Quality",
      severity: "medium",
      title: "Stale financial data",
      finding: `${c.name} data was last refreshed ${daysSince} days ago (${c.lastUpdated.slice(0, 10)}), beyond the ${T.staleDays}-day freshness standard.`,
      comparison: "",
      figures: [{ label: "Days since refresh", value: daysSince, format: "count" }],
      explanations: ["No automated connection — data arrives via emailed reporting pack", "Submission reminder not actioned"],
      caveats: [],
      chartMetrics: ["revenue"],
      magnitude: daysSince / 100,
    });
  }
  for (const note of c.definitionNotes.filter((n) => n.kind === "definition")) {
    push({
      rule: "definition_inconsistency",
      category: "Reporting Quality",
      severity: "low",
      title: "Financial definition differs from portfolio standard",
      finding: `${c.name}: ${note.text}`,
      comparison: "",
      figures: [],
      explanations: ["Chart-of-accounts mapping differs from the sponsor reporting template", "Classification change not restated for prior periods"],
      caveats: ["Peer comparisons of the affected ratios may be distorted."],
      chartMetrics: ["grossMargin", "gaRatio"],
      magnitude: 0.1,
    });
  }

  if (a.current.status !== "complete") return out;

  // Discontinuity scan (last four quarters, YoY to neutralise seasonality): when gross margin and the
  // opex ratio fall together by similar amounts while EBITDA margin barely moves, costs have most
  // likely been reclassified between COGS and operating expenses rather than changed economically.
  const qs = trendQuarters(p.end, 4);
  for (const q of qs) {
    const qa = analyzeCompany(c.id, q, data);
    const qy = qa.yoy;
    if (qa.current.status !== "complete" || !qy || qy.base.status !== "complete" || qy.acquisitions.length) continue;
    const dGm = qy.grossMarginChange;
    const dOpex = ppChange(qa.current.metrics.opexRatio, qy.base.metrics.opexRatio);
    if (dGm !== null && dOpex !== null && Math.abs(dGm) > T.gmStepPp && Math.sign(dOpex) === Math.sign(dGm) && Math.abs(dOpex) >= 0.6 * Math.abs(dGm)) {
      push({
        rule: "metric_discontinuity",
        category: "Reporting Quality",
        severity: "medium",
        title: "Possible cost reclassification (metric discontinuity)",
        finding: `${c.name} gross margin moved ${dGm > 0 ? "up" : "down"} ${pp(dGm)} year-over-year from ${q.label}, while the opex ratio moved ${dOpex > 0 ? "up" : "down"} ${pp(dOpex)} and EBITDA margin changed only ${pp(qy.ebitdaMarginChange ?? 0)}. Costs appear to have moved between COGS and operating expenses.`,
        comparison: `${q.label} vs ${qy.period.label}`,
        figures: [
          { label: "Gross margin change", value: dGm, format: "pp" },
          { label: "Opex / revenue change", value: dOpex, format: "pp" },
          { label: "EBITDA margin change", value: qy.ebitdaMarginChange, format: "pp" },
        ],
        explanations: ["Reclassification of costs between COGS and opex", "Change in chart-of-accounts mapping", "Prior periods not restated"],
        caveats: ["Gross-margin trends and peer comparisons should use consistently mapped data."],
        chartMetrics: ["grossMargin", "opexRatio", "ebitdaMargin"],
        magnitude: Math.abs(dGm),
      });
      break;
    }
  }
  if (p.kind === "quarter" && a.prior && a.prior.acquisitions.length === 0) {
    const dRev = a.prior.revenueGrowth;
    if (dRev !== null && Math.abs(dRev) > T.unusualRevenueQoQ) {
      push({
        rule: "unusual_change",
        category: "Reporting Quality",
        severity: "medium",
        title: "Unusual quarter-over-quarter revenue change",
        finding: `${c.name} revenue changed ${signedPct(dRev)} versus ${a.prior.period.label} with no acquisition in the period. Confirm cut-off and one-off items.`,
        comparison: `${p.label} vs ${a.prior.period.label}`,
        figures: [{ label: "Revenue QoQ", value: dRev, format: "pct" }],
        explanations: ["One-off or catch-up billing", "Revenue recognition cut-off", "Contract start or loss"],
        caveats: [],
        chartMetrics: ["revenue"],
        magnitude: Math.abs(dRev),
      });
    }
  }

  // ---------------- Cost efficiency ----------------
  if (y && y.laborGap !== null && y.laborGap > T.laborGapPp) {
    const hcG = y.employeesGrowth;
    const costPerHeadG =
      y.laborGrowth !== null && hcG !== null ? (1 + y.laborGrowth) / (1 + hcG) - 1 : null;
    push({
      rule: "labor_outpacing_revenue",
      category: "Cost Efficiency",
      severity: y.laborGap >= T.laborGapHighPp ? "high" : "medium",
      title: "Labor costs growing faster than revenue",
      finding: `${c.name} labor costs grew ${pct(y.laborGrowth!)} while revenue increased ${pct(y.revenueGrowth!)} (${p.label} ${yLabel}). The ${ppAdj(y.laborGap)} gap merits investigation.`,
      comparison: yLabel,
      figures: [
        { label: "Labor cost growth", value: y.laborGrowth, format: "pct" },
        { label: "Revenue growth", value: y.revenueGrowth, format: "pct" },
        { label: "Gap", value: y.laborGap, format: "pp" },
        { label: "Direct labor growth", value: y.directLaborGrowth, format: "pct" },
        { label: "Operating personnel growth", value: y.operatingPersonnelGrowth, format: "pct" },
        { label: "Headcount growth", value: hcG, format: "pct" },
        { label: "Labor cost per employee", value: costPerHeadG, format: "pct" },
        { label: "Labor intensity", value: m.laborIntensity, format: "pct" },
        { label: "Labor intensity change", value: y.laborIntensityChange, format: "pp" },
      ],
      explanations: [
        hcG !== null && y.revenueGrowth !== null && hcG > y.revenueGrowth
          ? `Headcount grew ${pct(hcG)} — faster than revenue — consistent with staffing ahead of demand or lower productivity`
          : "Headcount roughly tracking revenue — pressure may be in pay rates rather than staffing levels",
        costPerHeadG !== null ? `Cost per employee up ${pct(costPerHeadG)}: wage inflation, overtime or retention pay outpacing contract price escalators` : "Wage inflation outpacing pricing",
        "Mix shift toward more labor-intensive contracts or service lines",
        ...((data.transactionsByCompany.get(c.id) ?? []).some((t) => t.closeMonth !== null && t.closeMonth <= p.end && p.end - t.closeMonth <= 18)
          ? ["Integration staffing following a recent add-on acquisition (closed within the last 18 months)"]
          : []),
      ],
      caveats: [...acqCaveat(a), ...sourceCaveat(c)],
      chartMetrics: ["laborExpense", "revenue", "laborIntensity", "ebitdaMargin"],
      magnitude: y.laborGap,
    });
  }
  if (y && y.gaRatioChange !== null && y.gaRatioChange > T.gaRatioRisePp && !c.definitionNotes.some((n) => n.text.includes("G&A"))) {
    push({
      rule: "ga_ratio_rising",
      category: "Cost Efficiency",
      severity: "low",
      title: "G&A rising as a share of revenue",
      finding: `${c.name} G&A was ${pct(m.gaRatio!)} of revenue, up ${pp(y.gaRatioChange)} ${yLabel}. G&A grew ${y.gaGrowth !== null ? pct(y.gaGrowth) : "N/A"} against revenue growth of ${pct(y.revenueGrowth!)}.`,
      comparison: yLabel,
      figures: [
        { label: "G&A / revenue", value: m.gaRatio, format: "pct" },
        { label: "Change", value: y.gaRatioChange, format: "pp" },
        { label: "G&A growth", value: y.gaGrowth, format: "pct" },
        { label: "Revenue growth", value: y.revenueGrowth, format: "pct" },
      ],
      explanations: ["Back-office hiring ahead of scale", "Professional fees (audit, legal, integration)", "Systems and multi-entity consolidation overhead"],
      caveats: [...acqCaveat(a), ...sourceCaveat(c)],
      chartMetrics: ["gaRatio", "revenue"],
      magnitude: y.gaRatioChange,
    });
  }

  // ---------------- Profitability ----------------
  if (y && y.ebitdaMarginChange !== null && y.ebitdaMarginChange < -T.marginContractionPp) {
    push({
      rule: "margin_contraction",
      category: "Profitability",
      severity: y.ebitdaMarginChange <= -T.marginContractionHighPp ? "high" : "medium",
      title: "EBITDA margin contraction",
      finding: `${c.name} EBITDA margin fell to ${pct(m.ebitdaMargin!)} from ${pct(y.base.metrics.ebitdaMargin!)} — a ${ppAdj(y.ebitdaMarginChange)} contraction ${yLabel}.`,
      comparison: yLabel,
      figures: [
        { label: "EBITDA margin", value: m.ebitdaMargin, format: "pct" },
        { label: "Prior-year margin", value: y.base.metrics.ebitdaMargin, format: "pct" },
        { label: "Change", value: y.ebitdaMarginChange, format: "pp" },
        { label: "Gross margin change", value: y.grossMarginChange, format: "pp" },
        { label: "EBITDA growth", value: y.ebitdaGrowth, format: "pct" },
      ],
      explanations: [
        y.grossMarginChange !== null && y.grossMarginChange < -0.015 ? `Gross margin down ${pp(y.grossMarginChange)} — pressure is in cost of revenue` : "Pressure sits mainly below gross profit (operating expenses)",
        "Pricing not keeping pace with input cost inflation",
        "Investment spending ahead of growth",
      ],
      caveats: [...acqCaveat(a), ...sourceCaveat(c)],
      chartMetrics: ["ebitdaMargin", "grossMargin", "laborIntensity"],
      magnitude: -y.ebitdaMarginChange,
    });
  }
  if (y && y.ebitdaMarginChange !== null && y.ebitdaMarginChange > T.marginExpansionPp) {
    push({
      rule: "margin_expansion",
      category: "Profitability",
      severity: "positive",
      title: "EBITDA margin expansion",
      finding: `${c.name} EBITDA margin expanded ${pp(y.ebitdaMarginChange)} to ${pct(m.ebitdaMargin!)} ${yLabel}${y.operatingLeverage !== null ? `, with revenue growth exceeding total cost growth by ${pp(y.operatingLeverage)}` : ""}.`,
      comparison: yLabel,
      figures: [
        { label: "EBITDA margin", value: m.ebitdaMargin, format: "pct" },
        { label: "Change", value: y.ebitdaMarginChange, format: "pp" },
        { label: "Revenue growth", value: y.revenueGrowth, format: "pct" },
        { label: "Total cost growth", value: y.totalCostGrowth, format: "pct" },
      ],
      explanations: ["Operating leverage on a growing revenue base", "S&M and R&D efficiency", "Potential playbook to share across the portfolio"],
      caveats: [...acqCaveat(a)],
      chartMetrics: ["ebitdaMargin", "revenue", "opexRatio"],
      magnitude: y.ebitdaMarginChange,
    });
  }
  if (y && y.grossMarginChange !== null && y.grossMarginChange < -T.grossMarginDeclinePp) {
    const reclass = c.definitionNotes.some((n) => n.text.includes("reclassified"));
    push({
      rule: "gross_margin_decline",
      category: "Profitability",
      severity: reclass || y.acquisitions.length ? "low" : "medium",
      title: "Gross margin deterioration",
      finding: `${c.name} gross margin declined ${pp(y.grossMarginChange)} to ${pct(m.grossMargin!)} ${yLabel}.${reclass ? " Part of the decline reflects a reported cost reclassification into COGS." : ""}${y.acquisitions.length ? " The comparison includes acquired revenue at a different margin profile." : ""}`,
      comparison: yLabel,
      figures: [
        { label: "Gross margin", value: m.grossMargin, format: "pct" },
        { label: "Change", value: y.grossMarginChange, format: "pp" },
        { label: "Direct labor growth", value: y.directLaborGrowth, format: "pct" },
        { label: "Revenue growth", value: y.revenueGrowth, format: "pct" },
      ],
      explanations: reclass
        ? ["Cost reclassification (definition change)", "Underlying delivery-cost inflation"]
        : y.acquisitions.length
          ? ["Lower-margin acquired business mix", "Integration costs in cost of revenue"]
          : ["Delivery labor inflation", "Pricing pressure on renewals", "Mix shift toward lower-margin services"],
      caveats: [...acqCaveat(a), ...sourceCaveat(c)],
      chartMetrics: ["grossMargin", "cogsRatio"],
      magnitude: -y.grossMarginChange,
    });
  }
  if (y && y.operatingLeverage !== null && y.operatingLeverage > T.operatingLeveragePp && (y.ebitdaMarginChange ?? 0) <= T.marginExpansionPp) {
    push({
      rule: "operating_leverage",
      category: "Profitability",
      severity: "positive",
      title: "Strong operating leverage",
      finding: `${c.name} revenue grew ${pct(y.revenueGrowth!)} while total operating costs (COGS + opex) grew ${pct(y.totalCostGrowth!)} ${yLabel}.`,
      comparison: yLabel,
      figures: [
        { label: "Revenue growth", value: y.revenueGrowth, format: "pct" },
        { label: "Total cost growth", value: y.totalCostGrowth, format: "pct" },
        { label: "Operating leverage", value: y.operatingLeverage, format: "pp" },
      ],
      explanations: ["Scale efficiencies in S&M and G&A"],
      caveats: [...acqCaveat(a)],
      chartMetrics: ["opexRatio", "revenue"],
      magnitude: y.operatingLeverage,
    });
  }
  if (a.budget.status === "complete" && a.budget.ebitdaVarPct !== null && a.budget.ebitdaVarPct < -T.ebitdaBudgetMissPct) {
    push({
      rule: "ebitda_budget_miss",
      category: "Profitability",
      severity: a.budget.ebitdaVarPct < -T.ebitdaBudgetMissHighPct ? "high" : "medium",
      title: "EBITDA below budget",
      finding: `${c.name} EBITDA of ${usd(m.ebitda!)} was ${usd(Math.abs(a.budget.ebitdaVar!))} (${pct(Math.abs(a.budget.ebitdaVarPct))}) below the ${usd(a.budget.ebitda!)} budget for ${p.label}.`,
      comparison: "vs Budget",
      figures: [
        { label: "Actual EBITDA", value: m.ebitda, format: "usd" },
        { label: "Budget EBITDA", value: a.budget.ebitda, format: "usd" },
        { label: "Variance", value: a.budget.ebitdaVarPct, format: "pct" },
        { label: "Revenue vs budget", value: a.budget.revenueVarPct, format: "pct" },
        { label: "Margin vs budget", value: a.budget.ebitdaMarginVarPp, format: "pp" },
      ],
      explanations: [
        a.budget.revenueVarPct !== null && a.budget.revenueVarPct < -0.05 ? "Revenue shortfall flowing through to EBITDA" : "Revenue broadly on plan — shortfall driven by costs",
        "Cost assumptions in the budget not reflecting run-rate inflation",
      ],
      caveats: a.budget.acquisitions.length ? ["Budget excludes an acquisition closed during the budget year."] : [],
      chartMetrics: ["ebitda", "ebitdaMargin"],
      magnitude: -a.budget.ebitdaVarPct,
    });
  }

  // ---------------- Growth ----------------
  if (a.budget.status === "complete" && a.budget.revenueVarPct !== null && a.budget.revenueVarPct < -T.revenueBudgetMissPct) {
    const hist = trendQuarters(p.end, 4).map((q) => analyzeCompany(c.id, q, data).budget.revenueVarPct);
    const misses = hist.filter((v) => v !== null && v < -T.persistentMissPct).length;
    push({
      rule: "revenue_budget_miss",
      category: "Growth",
      severity: a.budget.revenueVarPct < -T.revenueBudgetMissHighPct || misses >= T.persistentMissQuarters ? "high" : "medium",
      title: misses >= T.persistentMissQuarters ? "Revenue persistently below budget" : "Revenue below budget",
      finding: `${c.name} revenue of ${usd(m.revenue!)} was ${pct(Math.abs(a.budget.revenueVarPct))} below budget for ${p.label}${misses >= T.persistentMissQuarters ? `, and has missed budget by more than ${pct(T.persistentMissPct, 0)} in ${misses} of the last 4 quarters` : ""}.`,
      comparison: "vs Budget",
      figures: [
        { label: "Actual revenue", value: m.revenue, format: "usd" },
        { label: "Budget revenue", value: a.budget.revenue, format: "usd" },
        { label: "Variance", value: a.budget.revenueVarPct, format: "pct" },
        { label: "YoY revenue growth", value: y?.revenueGrowth ?? null, format: "pct" },
        { label: "Quarters missed (of 4)", value: misses, format: "count" },
      ],
      explanations: ["Budget growth assumption above achievable run-rate", "Pipeline conversion or project delays", "Lower utilization of billable staff"],
      caveats: sourceCaveat(c),
      chartMetrics: ["revenue", "revenueVsBudget"],
      magnitude: -a.budget.revenueVarPct,
    });
  }
  if (y && y.acquisitions.length > 0) {
    push({
      rule: "acquisition_distortion",
      category: "Growth",
      severity: "low",
      title: "Growth distorted by acquisition",
      finding: `${c.name} reported revenue growth of ${y.revenueGrowth !== null ? pct(y.revenueGrowth) : "N/A"} ${yLabel} includes ${y.acquisitions.map((t) => `${t.target} (closed ${monthLabel(t.closeMonth!)})`).join(", ")}. ${
        y.organicAvailable && y.organicRevenueGrowth !== null
          ? `Constant-perimeter (organic) growth computed from DualEntry entity ledgers: ${pct(y.organicRevenueGrowth)}.`
          : "Organic growth cannot be determined from the submitted consolidated data, so it is not shown."
      }`,
      comparison: yLabel,
      figures: [
        { label: "Reported growth", value: y.revenueGrowth, format: "pct" },
        { label: "Organic growth", value: y.organicAvailable ? y.organicRevenueGrowth : null, format: "pct" },
        { label: "Acquired revenue (annualized at close)", value: y.acquisitions.reduce((s, t) => s + t.annualizedRevenueUsdM, 0), format: "usd" },
      ],
      explanations: ["Exclude from like-for-like growth rankings", "Request entity-level or pro-forma data to compute organic growth"],
      caveats: [],
      chartMetrics: ["revenue", "ebitdaMargin"],
      magnitude: 0.05,
    });
  }
  if (p.kind === "quarter" && y && y.revenueGrowth !== null && y.acquisitions.length === 0) {
    const prevQ = comparisonPeriod(p, "prior");
    const prevA = prevQ ? analyzeCompany(c.id, prevQ, data) : null;
    const prevG = prevA?.yoy && prevA.yoy.acquisitions.length === 0 ? prevA.yoy.revenueGrowth : null;
    if (prevG !== null && y.revenueGrowth - prevG > T.growthAccelerationPp) {
      push({
        rule: "growth_acceleration",
        category: "Growth",
        severity: "positive",
        title: "Revenue growth accelerating",
        finding: `${c.name} YoY revenue growth accelerated to ${pct(y.revenueGrowth)} from ${pct(prevG)} in ${prevQ!.label}.`,
        comparison: `YoY growth, ${p.label} vs ${prevQ!.label}`,
        figures: [
          { label: `YoY growth ${p.label}`, value: y.revenueGrowth, format: "pct" },
          { label: `YoY growth ${prevQ!.label}`, value: prevG, format: "pct" },
          { label: "ARR growth", value: y.arrGrowth, format: "pct" },
        ],
        explanations: ["New logo momentum", "Expansion revenue / net retention improvement"],
        caveats: [],
        chartMetrics: ["revenue", "arr"],
        magnitude: y.revenueGrowth - prevG,
      });
    }
  }

  // Peer-cohort comparison (sector peers by default, subject excluded).
  const bench = buildBenchmark(c.id, "sector", universe, p, data);
  if (bench.meaningful && y && y.acquisitions.length === 0) {
    const g = benchmarkMetric(bench, "revenueGrowth", (x) => (x.yoy && x.yoy.acquisitions.length === 0 ? x.yoy.revenueGrowth : null));
    if (g.deltaVsMedian !== null && g.stats.n >= 3 && g.deltaVsMedian < -T.cohortGrowthGapPp) {
      push({
        rule: "cohort_underperformance",
        category: "Growth",
        severity: "medium",
        title: `Growth below ${c.sector.toLowerCase()} peers`,
        finding: `${c.name} grew revenue ${pct(g.subject!)} ${yLabel}, ${pp(g.deltaVsMedian)} below the median of ${g.stats.n} ${c.sector.toLowerCase()} peers (${pct(g.stats.median!)}).`,
        comparison: `${c.sector} peer median (n = ${g.stats.n}, excl. ${c.name}; acquisition-affected peers excluded)`,
        figures: [
          { label: "Company growth", value: g.subject, format: "pct" },
          { label: "Peer median", value: g.stats.median, format: "pct" },
          { label: "Gap", value: g.deltaVsMedian, format: "pp" },
          { label: "Peers", value: g.stats.n, format: "count" },
        ],
        explanations: ["End-market softness specific to the company", "Sales capacity or pipeline constraints", "Pricing pressure"],
        caveats: bench.warnings,
        chartMetrics: ["revenue"],
        magnitude: -g.deltaVsMedian,
      });
    }
  }
  if (bench.meaningful) {
    const em = benchmarkMetric(bench, "ebitdaMargin", (x) => x.current.metrics.ebitdaMargin);
    if (em.deltaVsMedian !== null && em.deltaVsMedian < -T.cohortMarginGapPp) {
      push({
        rule: "cohort_margin_gap",
        category: "Profitability",
        severity: "low",
        title: `EBITDA margin below ${c.sector.toLowerCase()} peers`,
        finding: `${c.name} EBITDA margin of ${pct(em.subject!)} is ${pp(em.deltaVsMedian)} below the ${c.sector.toLowerCase()} peer median of ${pct(em.stats.median!)} (n = ${em.stats.n}).`,
        comparison: `${c.sector} peer median (excl. ${c.name})`,
        figures: [
          { label: "EBITDA margin", value: em.subject, format: "pct" },
          { label: "Peer median", value: em.stats.median, format: "pct" },
          { label: "Gap", value: em.deltaVsMedian, format: "pp" },
        ],
        explanations: ["Business-model differences within the sector (e.g., staffing vs managed services)", "Scale disadvantage", "Growth investment phase"],
        caveats: bench.warnings,
        chartMetrics: ["ebitdaMargin"],
        magnitude: -em.deltaVsMedian,
      });
    }
  }

  // ---------------- Cash flow (TTM to smooth tax timing and seasonal working capital) ----------------
  if (p.end >= 11) {
    const ttm = makePeriod("ttm", p.end - 11, p.end);
    const t = analyzeCompany(c.id, ttm, data);
    const cc = t.current.metrics.cashConversion;
    if (cc !== null && (t.current.metrics.ebitda ?? 0) > 0 && cc < T.cashConversionFloor) {
      push({
        rule: "weak_cash_conversion",
        category: "Cash Flow",
        severity: cc < T.cashConversionHigh ? "high" : "medium",
        title: "Weak operating cash conversion despite positive EBITDA",
        finding: `${c.name} converted ${pct(cc, 0)} of EBITDA into operating cash flow over the trailing twelve months (${usd(t.current.metrics.cfo!)} CFO on ${usd(t.current.metrics.ebitda!)} EBITDA, EBITDA margin ${pct(t.current.metrics.ebitdaMargin!)}).`,
        comparison: `TTM ${monthLabel(p.end)}`,
        figures: [
          { label: "TTM EBITDA", value: t.current.metrics.ebitda, format: "usd" },
          { label: "TTM operating cash flow", value: t.current.metrics.cfo, format: "usd" },
          { label: "Cash conversion", value: cc, format: "pct" },
          { label: "Prior TTM conversion", value: t.yoy?.base.metrics.cashConversion ?? null, format: "pct" },
          { label: "Change in NWC (TTM)", value: t.current.metrics.changeInNwc, format: "usd" },
        ],
        explanations: [
          "Receivables building (longer collection cycles or billing delays)",
          "Interest and tax payments absorbing EBITDA",
          "Working-capital investment to support growth",
        ],
        caveats: c.connection === "dualentry" ? [] : ["Working-capital bridge not submitted — the driver cannot be isolated without balance-sheet detail."],
        chartMetrics: ["cfo", "ebitda", "cashConversion"],
        magnitude: T.cashConversionFloor - cc,
      });
    }
  }
  if (y && y.cfoGrowth !== null && y.cfoGrowth < -T.cfoDeclinePct && (m.ebitda ?? 0) > 0 && (y.ebitdaGrowth ?? -1) > -0.05) {
    push({
      rule: "cfo_decline",
      category: "Cash Flow",
      severity: "medium",
      title: "Operating cash flow declining while EBITDA holds",
      finding: `${c.name} operating cash flow fell ${pct(Math.abs(y.cfoGrowth))} ${yLabel} while EBITDA ${y.ebitdaGrowth !== null && y.ebitdaGrowth >= 0 ? `grew ${pct(y.ebitdaGrowth)}` : "was broadly flat"}.`,
      comparison: yLabel,
      figures: [
        { label: "CFO growth", value: y.cfoGrowth, format: "pct" },
        { label: "EBITDA growth", value: y.ebitdaGrowth, format: "pct" },
        { label: "Operating cash flow", value: m.cfo, format: "usd" },
      ],
      explanations: ["Working-capital build", "Higher cash interest after incremental debt", "Tax payment timing"],
      caveats: sourceCaveat(c),
      chartMetrics: ["cfo", "ebitda"],
      magnitude: -y.cfoGrowth,
    });
  }
  if (a.budget.status === "complete" && a.budget.cfoVarPct !== null && a.budget.cfoVarPct < -T.cfoBudgetMissPct) {
    push({
      rule: "cfo_budget_miss",
      category: "Cash Flow",
      severity: "medium",
      title: "Operating cash flow below budget",
      finding: `${c.name} operating cash flow of ${usd(m.cfo!)} was ${pct(Math.abs(a.budget.cfoVarPct))} below the ${usd(a.budget.cfo!)} budget for ${p.label}.`,
      comparison: "vs Budget",
      figures: [
        { label: "Actual CFO", value: m.cfo, format: "usd" },
        { label: "Budget CFO", value: a.budget.cfo, format: "usd" },
        { label: "Variance", value: a.budget.cfoVarPct, format: "pct" },
        { label: "EBITDA vs budget", value: a.budget.ebitdaVarPct, format: "pct" },
      ],
      explanations: ["EBITDA shortfall", "Working capital above plan", "Budget cash-conversion assumption optimistic"],
      caveats: a.budget.acquisitions.length ? ["Budget excludes an acquisition closed during the budget year (incl. its financing)."] : [],
      chartMetrics: ["cfo"],
      magnitude: -a.budget.cfoVarPct,
    });
  }
  return out;
}

/** Editorial priority among rules of equal severity (magnitudes of different rules are not comparable). */
const RULE_PRIORITY: Record<string, number> = {
  missing_submission: 0,
  labor_outpacing_revenue: 1,
  margin_contraction: 2,
  weak_cash_conversion: 3,
  revenue_budget_miss: 4,
  ebitda_budget_miss: 5,
  cohort_underperformance: 6,
  gross_margin_decline: 7,
  cfo_decline: 8,
  cfo_budget_miss: 9,
  margin_expansion: 1,
  growth_acceleration: 2,
  operating_leverage: 3,
};

export function detectInsights(companies: Company[], p: Period, data: IndexedDataset = getData()): Insight[] {
  const all = companies.flatMap((c) => detectCompanyInsights(analyzeCompany(c.id, p, data), companies, p, data));
  return all.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (RULE_PRIORITY[a.rule] ?? 20) - (RULE_PRIORITY[b.rule] ?? 20) || b.magnitude - a.magnitude,
  );
}

export function severityRank(s: Severity) {
  return SEVERITY_RANK[s];
}

export { safeDiv };
