/**
 * Executes a parsed question against the deterministic analytics engine and
 * returns a structured answer: direct answer, supporting metrics, why it
 * matters, explore-further links, and methodology. Never fabricates values:
 * anything the engine cannot compute is reported as unavailable.
 */
import { getData } from "../data";
import { routes } from "../routes";
import { lastReportedLabel } from "../data/calendar";
import type { Company } from "../data/types";
import { mean, median, safeDiv, type N } from "../engine/core";
import { analyzeCompany, type CompanyAnalysis } from "../engine/company";
import { benchmarkMetric, buildBenchmark, type CohortDimension } from "../engine/benchmark";
import { applyFilters, type Filters } from "../engine/filters";
import { detectCompanyInsights, THRESHOLDS } from "../engine/insights";
import { METRICS, type MetricFormat } from "../engine/metrics";
import {
  comparisonLabel,
  comparisonPeriod,
  makePeriod,
  resolvePeriod,
  selectableQuarters,
  trendQuarters,
  type ComparisonBasis,
  type Period,
  type PeriodSelection,
} from "../engine/periods";
import { portfolioSummary } from "../engine/portfolio";
import { fmtMetric, fmtPct, fmtPp, fmtUsd } from "../format";
import { INTENT_LABELS, SUGGESTED_QUESTIONS, type ParsedQuery, type QueryMetric } from "./parser";

export interface AnswerColumn {
  key: string;
  label: string;
  format: MetricFormat | "text";
}
export interface AnswerRow {
  companyId?: string;
  label: string;
  values: Record<string, N | string>;
  tone?: "neg" | "pos" | "muted";
  note?: string;
  /** Overrides the column format for value columns (used when rows are different metrics). */
  rowFormat?: MetricFormat;
}
export interface ExploreLink {
  label: string;
  href: string;
  kind: "company" | "page" | "compare";
}
export interface AnswerChart {
  type: "bar" | "line";
  title: string;
  format: MetricFormat;
  data: { label: string; value: N; companyId?: string; secondary?: N }[];
  secondaryLabel?: string;
  referenceValue?: N;
  referenceLabel?: string;
}

export interface Answer {
  intent: ParsedQuery["intent"];
  intentLabel: string;
  supported: boolean;
  headline: string;
  kpis: { label: string; value: string; sub?: string }[];
  columns: AnswerColumn[];
  rows: AnswerRow[];
  chart: AnswerChart | null;
  whyItMatters: string;
  explore: ExploreLink[];
  methodology: string[];
  scope: string;
  followUps: string[];
  caveats: string[];
}

export interface AskContext {
  filters: Filters;
  selection: PeriodSelection;
  basis: ComparisonBasis;
}

const ROUTE = (id: string) => `/companies/${id}`;

function resolveScope(q: ParsedQuery, ctx: AskContext): { companies: Company[]; label: string; parts: string[] } {
  const d = getData();
  const base = applyFilters(d.companies, ctx.filters);
  const parts: string[] = [];
  let companies = base;
  if (q.sector) {
    companies = companies.filter((c) => c.sector === q.sector);
    parts.push(`sector = ${q.sector}`);
  }
  if (q.businessModel && !(q.sector === "Software" && q.businessModel === "Subscription software")) {
    const narrowed = companies.filter((c) => c.businessModel === q.businessModel);
    if (narrowed.length) {
      companies = narrowed;
      parts.push(`business model = ${q.businessModel}`);
    }
  }
  if (q.fund) {
    companies = companies.filter((c) => c.fund === q.fund);
    parts.push(`fund = ${d.funds.find((f) => f.id === q.fund)!.shortName}`);
  }
  const label = parts.length ? parts.join(", ") : "all companies in the current filter";
  return { companies, label, parts };
}

function resolvePeriodFor(q: ParsedQuery, ctx: AskContext): { period: Period | null; error: string | null } {
  const sel: PeriodSelection = { ...ctx.selection, ...(q.period ?? {}) } as PeriodSelection;
  if (q.period?.kind === "quarter" && !q.period.quarter) sel.quarter = ctx.selection.quarter;
  if (q.relativePeriod === "previous") {
    const p = resolvePeriod({ ...sel, kind: "quarter" });
    const prev = comparisonPeriod(p, "prior");
    if (!prev) return { period: null, error: "There is no quarter before the earliest period in the dataset (Q1 2024)." };
    return { period: prev, error: null };
  }
  const valid = selectableQuarters().map((x) => x.key);
  if (sel.kind !== "fy" && !valid.includes(sel.quarter))
    return { period: null, error: `${sel.quarter.replace("-", " ")} is outside the dataset, which covers Q1 2024 to Q3 2026 (latest closed quarter).` };
  return { period: resolvePeriod(sel), error: null };
}

function growthBasis(q: ParsedQuery, ctx: AskContext): "prior" | "yoy" {
  if (q.basis === "prior") return "prior";
  if (q.basis === "yoy") return "yoy";
  return ctx.basis === "prior" ? "prior" : "yoy";
}

function exclusionNotes(as: CompanyAnalysis[], needs: (a: CompanyAnalysis) => string | null): string[] {
  return as
    .map((a) => {
      const r = needs(a);
      return r ? `${a.company.name}: ${r}` : null;
    })
    .filter((x): x is string => !!x);
}

function curReason(a: CompanyAnalysis): string | null {
  if (a.current.status === "missing") return `no data for ${a.current.period.label} (last reported ${lastReportedLabel(a.company.lastReportedMonth)})`;
  if (a.current.status === "partial") return `partial period (${a.current.monthsAvailable} of ${a.current.monthsExpected} months)`;
  return null;
}

function cmpOf(a: CompanyAnalysis, b: "prior" | "yoy") {
  return b === "prior" ? a.prior : a.yoy;
}

const METRIC_LABEL: Record<QueryMetric, string> = {
  revenue: "revenue",
  ebitda: "EBITDA",
  ebitdaMargin: "EBITDA margin",
  grossMargin: "gross margin",
  laborExpense: "labor expense",
  laborIntensity: "labor intensity",
  gaRatio: "G&A as a % of revenue",
  smRatio: "S&M as a % of revenue",
  cfo: "operating cash flow",
  cashConversion: "cash conversion",
  arr: "ARR",
  revenueGrowth: "revenue growth",
};

function unsupported(q: ParsedQuery, reason: string, scope = ""): Answer {
  return {
    intent: "unsupported",
    intentLabel: INTENT_LABELS.unsupported,
    supported: false,
    headline: reason,
    kpis: [],
    columns: [],
    rows: [],
    chart: null,
    whyItMatters: "Answers are limited to questions the analytics engine can compute exactly from reported actuals, budgets and operating KPIs. Nothing is estimated or generated.",
    explore: [{ label: "Findings by company", href: routes.findings(), kind: "page" }],
    methodology: ["Question interpretation is rule-based and local; no figures are produced by a language model.", `Supported question types: ${Object.values(INTENT_LABELS).filter((l) => l !== "Not supported").join(", ")}.`],
    scope,
    followUps: SUGGESTED_QUESTIONS.slice(0, 4),
    caveats: [],
  };
}

export function answerQuestion(q: ParsedQuery, ctx: AskContext): Answer {
  if (q.intent === "unsupported")
    return unsupported(q, q.unsupportedReason ?? "I can't map that question to a supported financial analysis. Try one of the suggested questions — for example growth, margins, labor costs, budget variance, cash flow, peer comparisons or reporting status.");
  const { period, error } = resolvePeriodFor(q, ctx);
  if (!period) return unsupported(q, error!);
  const scope = resolveScope(q, ctx);
  const scopeText = `${period.label} · ${scope.label} (${scope.companies.length} compan${scope.companies.length === 1 ? "y" : "ies"})`;
  if (scope.companies.length === 0 && !["compare_companies", "company_summary", "compare_to_cohort"].includes(q.intent))
    return unsupported(q, "No companies match that scope under the current global filters. Reset filters or broaden the question.", scopeText);
  const analyses = scope.companies.map((c) => analyzeCompany(c.id, period));
  const base: Pick<Answer, "intent" | "intentLabel" | "supported" | "scope" | "caveats"> = {
    intent: q.intent,
    intentLabel: INTENT_LABELS[q.intent],
    supported: true,
    scope: scopeText,
    caveats: [],
  };
  const b = growthBasis(q, ctx);
  const cmpLabel = comparisonLabel(b, period);

  switch (q.intent) {
    // ------------------------------------------------------------------ portfolio growth
    case "portfolio_growth": {
      const metric = q.metric === "ebitda" ? "ebitda" : q.metric === "arr" ? "arr" : q.metric === "cfo" ? "cfo" : "revenue";
      const s = portfolioSummary(scope.companies.map((c) => c.id), period);
      if (metric === "arr") {
        const elig = analyses.filter((a) => a.company.hasArr && a.current.status === "complete" && cmpOf(a, b)?.base.metrics.arr);
        const cur = elig.reduce((x, a) => x + a.current.metrics.arr!, 0);
        const prev = elig.reduce((x, a) => x + cmpOf(a, b)!.base.metrics.arr!, 0);
        const g = prev > 0 ? cur / prev - 1 : null;
        return {
          ...base,
          headline: `Aggregate ARR across ${elig.length} subscription businesses grew ${fmtPct(g)} ${cmpLabel} to ${fmtUsd(cur)} at the end of ${period.label}. Average company ARR growth was ${fmtPct(mean(elig.map((a) => cmpOf(a, b)!.arrGrowth)))}.`,
          kpis: [
            { label: "Aggregate ARR growth", value: fmtPct(g) },
            { label: "Average company ARR growth", value: fmtPct(mean(elig.map((a) => cmpOf(a, b)!.arrGrowth))) },
            { label: "Period-end ARR", value: fmtUsd(cur) },
          ],
          columns: [
            { key: "arr", label: "ARR", format: "usd" },
            { key: "arrGrowth", label: `ARR growth (${b === "yoy" ? "YoY" : "QoQ"})`, format: "pct" },
            { key: "revenueGrowth", label: "Revenue growth", format: "pct" },
          ],
          rows: elig
            .map((a) => ({ companyId: a.company.id, label: a.company.name, values: { arr: a.current.metrics.arr, arrGrowth: cmpOf(a, b)!.arrGrowth, revenueGrowth: cmpOf(a, b)!.revenueGrowth } }))
            .sort((x, y) => (y.values.arrGrowth as number) - (x.values.arrGrowth as number)),
          chart: { type: "bar", title: "ARR growth by company", format: "pct", data: elig.map((a) => ({ label: a.company.name, value: cmpOf(a, b)!.arrGrowth, companyId: a.company.id })) },
          whyItMatters: "ARR is a point-in-time run-rate of contracted subscription revenue and typically leads recognized revenue. It is shown only for subscription businesses.",
          explore: elig.map((a) => ({ label: a.company.name, href: ROUTE(a.company.id), kind: "company" as const })),
          methodology: [
            "ARR = 12 × month-end subscription MRR at the period end; it is not recognized revenue.",
            `Aggregate growth = Σ ARR (current) ÷ Σ ARR (comparison) − 1 over the same ${elig.length} companies.`,
          ],
          followUps: ["Which software companies are growing fastest?", "What was portfolio revenue growth in Q3 2026?"],
        };
      }
      const kpi = s.kpis[metric];
      const cmp = kpi.comparisons[b];
      const pc = analyses.filter((a) => !cmp.coverage.excluded.some((e) => e.companyId === a.company.id));
      const growthOf = (a: CompanyAnalysis) =>
        metric === "revenue" ? cmpOf(a, b)!.revenueGrowth : metric === "ebitda" ? cmpOf(a, b)!.ebitdaGrowth : cmpOf(a, b)!.cfoGrowth;
      const affected = new Set(cmp.acquisitionAffected);
      const clean = pc.filter((a) => !affected.has(a.company.id));
      const field = metric as "revenue" | "ebitda" | "cfo";
      const cleanCur = clean.reduce((x, a) => x + (a.current.metrics[field] ?? 0), 0);
      const cleanPrev = clean.reduce((x, a) => x + (cmpOf(a, b)!.base.metrics[field] ?? 0), 0);
      const cleanG = clean.length && cleanPrev > 0 ? cleanCur / cleanPrev - 1 : null;
      const avg = mean(pc.map(growthOf));
      const med = median(pc.map(growthOf));
      const label = METRIC_LABEL[metric as QueryMetric];
      const rows = pc
        .map((a) => ({
          companyId: a.company.id,
          label: a.company.name,
          values: {
            current: a.current.metrics[field],
            comparison: cmpOf(a, b)!.base.metrics[field],
            growth: growthOf(a),
            organic: metric === "revenue" ? (cmpOf(a, b)!.organicAvailable ? cmpOf(a, b)!.organicRevenueGrowth : null) : null,
          },
          note: affected.has(a.company.id) ? "Acquisition-affected" : undefined,
          tone: affected.has(a.company.id) ? ("muted" as const) : undefined,
        }))
        .sort((x, y) => ((y.values.growth as number) ?? -9) - ((x.values.growth as number) ?? -9));
      return {
        ...base,
        headline: `Portfolio ${label} grew ${fmtPct(cmp.aggregateChange)} ${cmpLabel} in ${period.label} on an aggregate basis (${fmtUsd(cmp.currentOnCohort)} vs ${fmtUsd(cmp.comparisonOnCohort)} across ${cmp.coverage.included} like-for-like companies). The average company grew ${fmtPct(avg)} (median ${fmtPct(med)}).${
          affected.size ? ` Excluding ${affected.size} acquisition-affected compan${affected.size === 1 ? "y" : "ies"}, aggregate growth was ${fmtPct(cleanG)}.` : ""
        }`,
        kpis: [
          { label: "Aggregate growth (Σ-based)", value: fmtPct(cmp.aggregateChange), sub: `${cmp.coverage.included} of ${cmp.coverage.total} companies` },
          { label: "Average company growth", value: fmtPct(avg), sub: `Median ${fmtPct(med)}` },
          ...(affected.size ? [{ label: "Excl. acquisitions", value: fmtPct(cleanG), sub: `${clean.length} companies` }] : []),
        ],
        columns: [
          { key: "current", label: period.label, format: "usd" },
          { key: "comparison", label: cmpOf(pc[0] ?? analyses[0], b)?.period.label ?? "Comparison", format: "usd" },
          { key: "growth", label: "Growth", format: "pct" },
          ...(metric === "revenue" ? [{ key: "organic", label: "Organic growth", format: "pct" as const }] : []),
        ],
        rows,
        chart: { type: "bar", title: `${label[0].toUpperCase() + label.slice(1)} growth by company (${b === "yoy" ? "YoY" : "QoQ"})`, format: "pct", data: rows.map((r) => ({ label: r.label, value: r.values.growth as N, companyId: r.companyId })), referenceValue: cmp.aggregateChange, referenceLabel: "Portfolio aggregate" },
        whyItMatters:
          "Aggregate growth weights companies by size, so the largest platforms dominate; average company growth treats each company equally. A gap between them signals that growth is concentrated in a few large (or small) businesses.",
        explore: [
          { label: "Portfolio", href: "/", kind: "page" },
          ...rows.slice(0, 3).map((r) => ({ label: r.label, href: ROUTE(r.companyId!), kind: "company" as const })),
        ],
        methodology: [
          `Aggregate growth = Σ ${label} in ${period.label} ÷ Σ ${label} in the comparison period − 1, over the same cohort of companies with complete data in both periods.`,
          "Average company growth = arithmetic mean of each eligible company's own growth rate.",
          "Acquisition-affected companies are included in reported figures and flagged; organic growth is shown only where entity-level ledger data allows a constant perimeter.",
          ...cmp.coverage.excluded.map((e) => `Excluded — ${getData().companyById.get(e.companyId)!.name}: ${e.reason}.`),
          "Amounts are management-view sums of operating companies, not GAAP-consolidated fund financials.",
        ],
        followUps: ["Which software companies are growing fastest?", "What about Fund III?", "Which companies missed EBITDA budget?"],
      };
    }

    // ------------------------------------------------------------------ portfolio margin
    case "portfolio_margin": {
      const key = q.metric === "grossMargin" ? "grossMargin" : "ebitdaMargin";
      const s = portfolioSummary(scope.companies.map((c) => c.id), period);
      const k = s.kpis[key];
      const cmp = k.comparisons[b];
      const label = key === "grossMargin" ? "gross margin" : "EBITDA margin";
      const elig = analyses.filter((a) => a.current.status === "complete" && a.current.metrics[key] !== null);
      const rows = elig
        .map((a) => ({
          companyId: a.company.id,
          label: a.company.name,
          values: { margin: a.current.metrics[key], change: key === "grossMargin" ? cmpOf(a, b)?.grossMarginChange ?? null : cmpOf(a, b)?.ebitdaMarginChange ?? null, revenue: a.current.metrics.revenue },
        }))
        .sort((x, y) => (y.values.margin as number) - (x.values.margin as number));
      return {
        ...base,
        headline: `Portfolio ${label} (Σ ${key === "grossMargin" ? "gross profit" : "EBITDA"} ÷ Σ revenue) was ${fmtPct(k.aggregate)} in ${period.label}, ${fmtPp(cmp.aggregateChange)} ${cmpLabel}. The average company ${label} was ${fmtPct(k.average)} (median ${fmtPct(k.median)}) across ${k.coverage.included} companies.`,
        kpis: [
          { label: `Portfolio ${label} (weighted)`, value: fmtPct(k.aggregate), sub: `${fmtPp(cmp.aggregateChange)} ${cmpLabel}` },
          { label: `Average company ${label}`, value: fmtPct(k.average), sub: `Median ${fmtPct(k.median)}` },
          { label: "Coverage", value: `${k.coverage.included} of ${k.coverage.total}`, sub: "companies with complete data" },
        ],
        columns: [
          { key: "margin", label: label[0].toUpperCase() + label.slice(1), format: "pct" },
          { key: "change", label: `Change (${b === "yoy" ? "YoY" : "QoQ"})`, format: "pp" },
          { key: "revenue", label: "Revenue", format: "usd" },
        ],
        rows,
        chart: { type: "bar", title: `${label[0].toUpperCase() + label.slice(1)} by company`, format: "pct", data: rows.map((r) => ({ label: r.label, value: r.values.margin as N, companyId: r.companyId })), referenceValue: k.aggregate, referenceLabel: "Portfolio (weighted)" },
        whyItMatters: `The weighted portfolio margin reflects where the dollars are; the average company margin reflects the typical business. Software and services margins are structurally different, so mix shifts can move the portfolio figure without any company changing.`,
        explore: [{ label: "Cost benchmarking", href: routes.benchmark(), kind: "page" }, ...rows.slice(-2).map((r) => ({ label: r.label, href: ROUTE(r.companyId!), kind: "company" as const }))],
        methodology: [
          `Portfolio ${label} = Σ numerator ÷ Σ revenue across companies with complete ${period.label} data.`,
          `Average company ${label} = arithmetic mean of individual company margins.`,
          "Margin changes are shown in percentage points (pp).",
          ...k.coverage.excluded.map((e) => `Excluded — ${getData().companyById.get(e.companyId)!.name}: ${e.reason}.`),
        ],
        followUps: ["Which businesses have deteriorating gross margins?", "What about services companies?", "Which companies are outperforming their peers?"],
      };
    }

    // ------------------------------------------------------------------ totals
    case "portfolio_total": {
      const field = (["revenue", "ebitda", "cfo", "arr"].includes(q.metric ?? "") ? q.metric : "revenue") as "revenue" | "ebitda" | "cfo" | "arr";
      if (["ebitdaMargin", "grossMargin"].includes(q.metric ?? "")) return answerQuestion({ ...q, intent: "portfolio_margin" }, ctx);
      if (["laborIntensity", "gaRatio", "smRatio", "laborExpense"].includes(q.metric ?? "")) return answerQuestion({ ...q, intent: "trend_summary" }, ctx);
      const elig = analyses.filter((a) => a.current.status === "complete" && a.current.metrics[field] !== null);
      const total = elig.reduce((x, a) => x + (a.current.metrics[field] as number), 0);
      const label = METRIC_LABEL[field];
      return {
        ...base,
        headline: `Total ${label} across ${elig.length} reporting companies was ${fmtUsd(total)} for ${period.label}.`,
        kpis: [
          { label: `Total ${label}`, value: fmtUsd(total) },
          { label: "Companies included", value: `${elig.length} of ${analyses.length}` },
        ],
        columns: [
          { key: "value", label: label[0].toUpperCase() + label.slice(1), format: "usd" },
          { key: "share", label: "Share of total", format: "pct" },
        ],
        rows: elig
          .map((a) => ({ companyId: a.company.id, label: a.company.name, values: { value: a.current.metrics[field], share: safeDiv(a.current.metrics[field], total) } }))
          .sort((x, y) => (y.values.value as number) - (x.values.value as number)),
        chart: { type: "bar", title: `${label} by company`, format: "usd", data: elig.map((a) => ({ label: a.company.name, value: a.current.metrics[field], companyId: a.company.id })) },
        whyItMatters: "Totals are management-view sums of operating companies and are dominated by the largest platforms.",
        explore: [{ label: "Portfolio", href: "/", kind: "page" }],
        methodology: ["Σ of company values for companies with complete data in the period. Not GAAP-consolidated fund financials.", ...exclusionNotes(analyses, curReason)],
        followUps: ["What was portfolio revenue growth in Q3 2026?", "What is our average EBITDA margin?"],
      };
    }

    // ------------------------------------------------------------------ labor vs revenue
    case "labor_growth_outliers": {
      const rows: AnswerRow[] = [];
      const excluded: string[] = [];
      for (const a of analyses) {
        const c = cmpOf(a, b);
        if (curReason(a)) excluded.push(`${a.company.name}: ${curReason(a)}`);
        else if (!c || c.laborGrowth === null) excluded.push(`${a.company.name}: labor cost split not reported`);
        else if (c.revenueGrowth !== null)
          rows.push({
            companyId: a.company.id,
            label: a.company.name,
            values: { labor: c.laborGrowth, revenue: c.revenueGrowth, gap: c.laborGap, intensity: a.current.metrics.laborIntensity, emChange: c.ebitdaMarginChange },
            tone: c.laborGap! > THRESHOLDS.laborGapPp ? "neg" : c.laborGap! > 0 ? undefined : "pos",
            note: c.acquisitions.length ? "Acquisition-affected comparison" : undefined,
          });
      }
      rows.sort((x, y) => (y.values.gap as number) - (x.values.gap as number));
      const faster = rows.filter((r) => (r.values.gap as number) > 0);
      const flagged = faster.filter((r) => (r.values.gap as number) > THRESHOLDS.laborGapPp);
      const desc = faster.map((r) => `${r.label} by ${fmtPp(r.values.gap as number, { signed: false })} (labor ${fmtPct(r.values.labor as number, { signed: true })} vs revenue ${fmtPct(r.values.revenue as number, { signed: true })})`);
      const scopeWord = q.sector === "Business Services" ? "services companies" : q.sector === "Software" ? "software companies" : "companies";
      return {
        ...base,
        headline: faster.length
          ? `${faster.length} of ${rows.length} ${scopeWord} grew labor costs faster than revenue in ${period.label} (${cmpLabel}): ${desc.join("; ")}.${flagged.length ? ` ${flagged.map((r) => r.label).join(" and ")} exceed${flagged.length === 1 ? "s" : ""} the ${fmtPp(THRESHOLDS.laborGapPp, { signed: false, decimals: 0 })} attention threshold.` : ""}`
          : `None of the ${rows.length} ${scopeWord} with labor data grew labor costs faster than revenue in ${period.label} (${cmpLabel}).`,
        kpis: [
          { label: "Labor growing faster than revenue", value: `${faster.length} of ${rows.length}` },
          { label: `Above ${fmtPp(THRESHOLDS.laborGapPp, { signed: false, decimals: 0 })} threshold`, value: String(flagged.length) },
          { label: "Largest gap", value: rows[0] ? fmtPp(rows[0].values.gap as number) : "N/A", sub: rows[0]?.label },
        ],
        columns: [
          { key: "labor", label: "Labor cost growth", format: "pct" },
          { key: "revenue", label: "Revenue growth", format: "pct" },
          { key: "gap", label: "Gap", format: "pp" },
          { key: "intensity", label: "Labor / revenue", format: "pct" },
          { key: "emChange", label: "EBITDA margin Δ", format: "pp" },
        ],
        rows,
        chart: {
          type: "bar",
          title: "Labor cost growth vs revenue growth",
          format: "pct",
          data: rows.map((r) => ({ label: r.label, value: r.values.labor as N, secondary: r.values.revenue as N, companyId: r.companyId })),
          secondaryLabel: "Revenue growth",
        },
        whyItMatters:
          "When labor grows faster than revenue in a people-intensive business, margin compression usually follows. The gap is a signal to investigate — staffing levels, pay rates, utilization and pricing — not proof of a specific cause.",
        explore: [
          ...faster.slice(0, 3).map((r) => ({ label: r.label, href: ROUTE(r.companyId!), kind: "company" as const })),
          ...(faster[0] ? [{ label: `Compare ${faster[0].label} with peers`, href: routes.comparePeers(faster[0].companyId!), kind: "compare" as const }] : []),
          { label: "Cost benchmarking", href: routes.benchmark(), kind: "page" },
        ],
        methodology: [
          "Labor expense = direct labor (in COGS) + operating personnel (personnel within S&M, R&D and G&A). Categories are mutually exclusive.",
          `Growth = ${period.label} ÷ ${cmpOf(analyses.find((a) => cmpOf(a, b)) ?? analyses[0], b)?.period.label ?? "comparison period"} − 1, same months for each company.`,
          "Gap = labor cost growth − revenue growth, in percentage points.",
          ...excluded.map((e) => `Excluded — ${e}.`),
        ],
        followUps: faster[0] ? [`Compare ${faster[0].label} with other services businesses`, "What about software companies?", "Which companies missed EBITDA budget?"] : ["Which companies missed EBITDA budget?"],
      };
    }

    // ------------------------------------------------------------------ budget variance
    case "budget_variance": {
      const field = q.metric === "ebitda" || q.metric === "ebitdaMargin" ? "ebitda" : q.metric === "cfo" ? "cfo" : "revenue";
      const label = METRIC_LABEL[field as QueryMetric];
      const rows: AnswerRow[] = [];
      const excluded: string[] = [];
      for (const a of analyses) {
        if (curReason(a)) excluded.push(`${a.company.name}: ${curReason(a)}`);
        else if (a.budget.status !== "complete") excluded.push(`${a.company.name}: no budget for ${period.label}`);
        else if (a.budget[field] === null) excluded.push(`${a.company.name}: budget ${label} not provided`);
        else {
          const varPct = field === "revenue" ? a.budget.revenueVarPct : field === "ebitda" ? a.budget.ebitdaVarPct : a.budget.cfoVarPct;
          const varAbs = field === "revenue" ? a.budget.revenueVar : field === "ebitda" ? a.budget.ebitdaVar : a.budget.cfoVar;
          rows.push({
            companyId: a.company.id,
            label: a.company.name,
            values: { actual: a.current.metrics[field], budget: a.budget[field], varAbs, varPct },
            tone: (varPct ?? 0) < 0 ? "neg" : "pos",
            note: a.budget.acquisitions.length ? "Budget excludes acquisition" : undefined,
          });
        }
      }
      const wantBeat = q.polarity === "positive";
      rows.sort((x, y) => (wantBeat ? -1 : 1) * ((x.values.varPct as number) - (y.values.varPct as number)));
      const hits = rows.filter((r) => (wantBeat ? (r.values.varPct as number) > 0 : (r.values.varPct as number) < 0));
      const totA = rows.reduce((s, r) => s + (r.values.actual as number), 0);
      const totB = rows.reduce((s, r) => s + (r.values.budget as number), 0);
      return {
        ...base,
        headline: hits.length
          ? `${hits.length} of ${rows.length} companies with a ${period.label} budget ${wantBeat ? "beat" : "missed"} ${label} budget: ${hits
              .slice(0, 6)
              .map((r) => `${r.label} ${fmtPct(r.values.varPct as number, { signed: true })} (${fmtUsd(r.values.varAbs as number, { signed: true })})`)
              .join("; ")}. In aggregate, ${label} was ${fmtPct(totB ? (totA - totB) / Math.abs(totB) : null, { signed: true })} versus budget.`
          : `No company ${wantBeat ? "beat" : "missed"} its ${label} budget in ${period.label}.`,
        kpis: [
          { label: `${wantBeat ? "Beat" : "Missed"} budget`, value: `${hits.length} of ${rows.length}` },
          { label: "Aggregate variance", value: fmtPct(totB ? (totA - totB) / Math.abs(totB) : null, { signed: true }), sub: `${fmtUsd(totA - totB, { signed: true })}` },
          { label: "Budget coverage", value: `${rows.length} of ${analyses.length}`, sub: "companies with complete budget data" },
        ],
        columns: [
          { key: "actual", label: "Actual", format: "usd" },
          { key: "budget", label: "Budget", format: "usd" },
          { key: "varAbs", label: "Variance", format: "usd" },
          { key: "varPct", label: "Variance %", format: "pct" },
        ],
        rows,
        chart: { type: "bar", title: `${label[0].toUpperCase() + label.slice(1)} variance to budget`, format: "pct", data: rows.map((r) => ({ label: r.label, value: r.values.varPct as N, companyId: r.companyId })), referenceValue: 0 },
        whyItMatters: "Budget variance shows where the operating plan approved by the board is off track. Persistent misses usually indicate either execution issues or plan assumptions that need resetting.",
        explore: hits.slice(0, 3).map((r) => ({ label: r.label, href: ROUTE(r.companyId!), kind: "company" as const })),
        methodology: [
          "Variance = Actual − Budget; Variance % = (Actual − Budget) ÷ |Budget|. Positive is favorable for revenue, EBITDA and cash flow.",
          "Budgets are the annual operating plans approved at the start of each calendar year; they exclude acquisitions closed during the budget year.",
          "Non-USD budgets are translated at actual average rates, so variances exclude FX effects.",
          ...excluded.map((e) => `Excluded — ${e}.`),
        ],
        followUps: ["Which companies beat revenue budget?", "Which companies missed cash flow budget?", "What about Fund II?"],
      };
    }

    // ------------------------------------------------------------------ cash flow
    case "cash_flow_outliers": {
      const ttm = period.end >= 11 ? makePeriod("ttm", period.end - 11, period.end) : null;
      const rows: AnswerRow[] = [];
      const excluded: string[] = [];
      for (const a of analyses) {
        const c = cmpOf(a, b);
        if (curReason(a)) {
          excluded.push(`${a.company.name}: ${curReason(a)}`);
          continue;
        }
        const t = ttm ? analyzeCompany(a.company.id, ttm) : null;
        rows.push({
          companyId: a.company.id,
          label: a.company.name,
          values: {
            cfo: a.current.metrics.cfo,
            cfoGrowth: c?.cfoGrowth ?? null,
            ebitdaGrowth: c?.ebitdaGrowth ?? null,
            conversion: t?.current.metrics.cashConversion ?? null,
          },
          tone: (c?.cfoGrowth ?? 0) < 0 ? "neg" : undefined,
        });
      }
      const conversionMode = q.metric === "cashConversion";
      rows.sort((x, y) =>
        conversionMode
          ? ((x.values.conversion as number) ?? 9) - ((y.values.conversion as number) ?? 9)
          : ((x.values.cfoGrowth as number) ?? 9) - ((y.values.cfoGrowth as number) ?? 9),
      );
      const declining = rows.filter((r) => (r.values.cfoGrowth as number) < 0);
      const weak = rows.filter((r) => r.values.conversion !== null && (r.values.conversion as number) < THRESHOLDS.cashConversionFloor);
      return {
        ...base,
        headline: conversionMode
          ? `${weak.length} compan${weak.length === 1 ? "y" : "ies"} converted less than ${fmtPct(THRESHOLDS.cashConversionFloor, { decimals: 0 })} of TTM EBITDA into operating cash flow: ${weak.map((r) => `${r.label} (${fmtPct(r.values.conversion as number, { decimals: 0 })})`).join(", ") || "none"}.`
          : declining.length
            ? `${declining.length} of ${rows.length} companies reported lower operating cash flow in ${period.label} ${cmpLabel}: ${declining.map((r) => `${r.label} ${fmtPct(r.values.cfoGrowth as number, { signed: true })}${(r.values.ebitdaGrowth as number) > 0 ? ` despite EBITDA ${fmtPct(r.values.ebitdaGrowth as number, { signed: true })}` : ""}`).join("; ")}.`
            : `No company reported lower operating cash flow in ${period.label} ${cmpLabel}.`,
        kpis: [
          { label: "Declining operating cash flow", value: `${declining.length} of ${rows.length}` },
          { label: `TTM cash conversion < ${fmtPct(THRESHOLDS.cashConversionFloor, { decimals: 0 })}`, value: String(weak.length) },
          { label: "Median TTM conversion", value: fmtPct(median(rows.map((r) => r.values.conversion as N)), { decimals: 0 }) },
        ],
        columns: [
          { key: "cfo", label: "Operating cash flow", format: "usd" },
          { key: "cfoGrowth", label: `CFO change (${b === "yoy" ? "YoY" : "QoQ"})`, format: "pct" },
          { key: "ebitdaGrowth", label: "EBITDA growth", format: "pct" },
          { key: "conversion", label: "TTM cash conversion", format: "pct" },
        ],
        rows,
        chart: { type: "bar", title: conversionMode ? "TTM cash conversion (CFO ÷ EBITDA)" : "Operating cash flow change", format: "pct", data: rows.map((r) => ({ label: r.label, value: (conversionMode ? r.values.conversion : r.values.cfoGrowth) as N, companyId: r.companyId })), referenceValue: conversionMode ? THRESHOLDS.cashConversionFloor : 0 },
        whyItMatters: "EBITDA that does not convert into cash cannot service debt or fund growth. Divergence between EBITDA and operating cash flow usually points to working capital (receivables) or financing costs.",
        explore: [...(declining.length ? declining : weak).slice(0, 3).map((r) => ({ label: r.label, href: ROUTE(r.companyId!), kind: "company" as const })), { label: "Cash-flow findings", href: routes.findings({ category: "Cash Flow" }), kind: "page" }],
        methodology: [
          "Operating cash flow is reported by each company (EBITDA − cash interest − cash taxes − increase in net working capital); it is never approximated by EBITDA.",
          "Cash conversion = TTM operating cash flow ÷ TTM EBITDA; trailing twelve months smooths quarterly tax and working-capital timing. N/A when EBITDA ≤ 0.",
          "CFO change is N/A when the comparison-period CFO is zero or negative.",
          ...excluded.map((e) => `Excluded — ${e}.`),
        ],
        followUps: ["Which companies have weak cash conversion?", "Which companies missed cash flow budget?"],
      };
    }

    // ------------------------------------------------------------------ margin changes
    case "margin_changes": {
      const key = q.metric === "grossMargin" ? "grossMargin" : "ebitdaMargin";
      const label = key === "grossMargin" ? "gross margin" : "EBITDA margin";
      const improving = q.polarity === "positive";
      const rows: AnswerRow[] = [];
      const excluded: string[] = [];
      for (const a of analyses) {
        const c = cmpOf(a, b);
        if (curReason(a)) excluded.push(`${a.company.name}: ${curReason(a)}`);
        else if (!c || c.base.status !== "complete") excluded.push(`${a.company.name}: comparison period incomplete`);
        else {
          const ch = key === "grossMargin" ? c.grossMarginChange : c.ebitdaMarginChange;
          rows.push({
            companyId: a.company.id,
            label: a.company.name,
            values: { cur: a.current.metrics[key], prev: c.base.metrics[key], change: ch },
            tone: (ch ?? 0) < 0 ? "neg" : "pos",
            note: c.acquisitions.length ? "Acquisition-affected" : a.company.definitionNotes.some((n) => n.text.includes("reclassified")) && key === "grossMargin" ? "Cost reclassification" : undefined,
          });
        }
      }
      rows.sort((x, y) => (improving ? (y.values.change as number) - (x.values.change as number) : (x.values.change as number) - (y.values.change as number)));
      const threshold = key === "grossMargin" ? THRESHOLDS.grossMarginDeclinePp : THRESHOLDS.marginContractionPp;
      const hits = rows.filter((r) => (improving ? (r.values.change as number) > threshold : (r.values.change as number) < -threshold));
      return {
        ...base,
        headline: hits.length
          ? `${hits.length} compan${hits.length === 1 ? "y has" : "ies have"} ${improving ? "improved" : "deteriorating"} ${label}s (${improving ? "more than +" : "more than −"}${fmtPp(threshold, { signed: false, decimals: 0 }).replace(" pp", "")} pp ${cmpLabel}): ${hits.map((r) => `${r.label} ${fmtPp(r.values.change as number)} to ${fmtPct(r.values.cur as number)}${r.note ? ` (${r.note.toLowerCase()})` : ""}`).join("; ")}.`
          : `No company's ${label} ${improving ? "improved" : "declined"} by more than ${fmtPp(threshold, { signed: false, decimals: 0 })} ${cmpLabel}.`,
        kpis: [
          { label: improving ? "Improving" : "Deteriorating", value: `${hits.length} of ${rows.length}` },
          { label: `Median ${label} change`, value: fmtPp(median(rows.map((r) => r.values.change as N))) },
        ],
        columns: [
          { key: "cur", label: period.label, format: "pct" },
          { key: "prev", label: cmpOf(analyses.find((a) => cmpOf(a, b)) ?? analyses[0], b)?.period.label ?? "Prior", format: "pct" },
          { key: "change", label: "Change", format: "pp" },
        ],
        rows,
        chart: { type: "bar", title: `${label[0].toUpperCase() + label.slice(1)} change (pp)`, format: "pp", data: rows.map((r) => ({ label: r.label, value: r.values.change as N, companyId: r.companyId })), referenceValue: 0 },
        whyItMatters: key === "grossMargin" ? "Gross margin erosion means each dollar of revenue costs more to deliver — usually delivery labor, hosting or pricing. Definition changes (reclassifications) can mimic erosion, so they are flagged." : "EBITDA margin changes summarize cost discipline and operating leverage across the whole P&L.",
        explore: hits.slice(0, 3).map((r) => ({ label: r.label, href: ROUTE(r.companyId!), kind: "company" as const })),
        methodology: [
          `${label[0].toUpperCase() + label.slice(1)} change = current margin − comparison margin, in percentage points (pp).`,
          `Attention threshold: ${fmtPp(threshold, { signed: false, decimals: 0 })}.`,
          ...excluded.map((e) => `Excluded — ${e}.`),
        ],
        followUps: ["Which companies grew labor costs faster than revenue?", "What is our average EBITDA margin?"],
      };
    }

    // ------------------------------------------------------------------ trend
    case "trend_summary": {
      const key = (q.metric && ["gaRatio", "smRatio", "laborIntensity", "ebitdaMargin", "grossMargin"].includes(q.metric) ? q.metric : q.metric === "revenue" || q.metric === "revenueGrowth" ? "revenue" : q.metric === "ebitda" ? "ebitda" : q.metric === "cfo" ? "cfo" : q.metric === "laborExpense" ? "laborIntensity" : "ebitdaMargin") as
        | "gaRatio" | "smRatio" | "laborIntensity" | "ebitdaMargin" | "grossMargin" | "revenue" | "ebitda" | "cfo";
      const parts: Record<string, [string, string]> = {
        gaRatio: ["generalAdmin", "revenue"],
        smRatio: ["salesMarketing", "revenue"],
        laborIntensity: ["laborExpense", "revenue"],
        ebitdaMargin: ["ebitda", "revenue"],
        grossMargin: ["grossProfit", "revenue"],
      };
      const isRatio = key in parts;
      const qs = trendQuarters(period.end, 8);
      // Fixed cohort: companies with complete data in all quarters and the metric available.
      const cohort = analyses.filter((a) => qs.every((qq) => {
        const x = analyzeCompany(a.company.id, qq).current;
        return x.status === "complete" && (isRatio ? x.metrics[parts[key][0] as "revenue"] !== null : x.metrics[key as "revenue"] !== null);
      }));
      const series = qs.map((qq) => {
        const ms = cohort.map((a) => analyzeCompany(a.company.id, qq).current.metrics);
        if (!ms.length) return { label: qq.label, value: null as N };
        if (isRatio) {
          const [n, dd] = parts[key];
          return { label: qq.label, value: safeDiv(ms.reduce((s, m) => s + (m[n as "revenue"] as number), 0), ms.reduce((s, m) => s + (m[dd as "revenue"] as number), 0)) };
        }
        return { label: qq.label, value: ms.reduce((s, m) => s + (m[key as "revenue"] as number), 0) };
      });
      const first = series.find((s) => s.value !== null);
      const yAgo = series.length >= 5 ? series[series.length - 5] : first;
      const last = series[series.length - 1];
      const fmt: MetricFormat = isRatio ? "pct" : "usd";
      const delta = isRatio ? (last.value !== null && yAgo?.value != null ? last.value - yAgo.value : null) : last.value !== null && yAgo?.value ? last.value / yAgo.value - 1 : null;
      const yoyP = comparisonPeriod(period, "yoy");
      const rows: AnswerRow[] = cohort
        .map((a) => {
          const cur = analyzeCompany(a.company.id, makePeriod("quarter", qs[qs.length - 1].start, qs[qs.length - 1].end)).current.metrics[key as "revenue"];
          const prevQ = yoyP ? analyzeCompany(a.company.id, makePeriod("quarter", qs[qs.length - 5]?.start ?? qs[0].start, qs[qs.length - 5]?.end ?? qs[0].end)).current.metrics[key as "revenue"] : null;
          const ch = cur !== null && prevQ !== null ? (isRatio ? cur - prevQ : prevQ > 0 ? cur / prevQ - 1 : null) : null;
          return { companyId: a.company.id, label: a.company.name, values: { cur, prev: prevQ, change: ch } };
        })
        .sort((x, y) => ((y.values.change as number) ?? -9) - ((x.values.change as number) ?? -9));
      const label = METRICS[key].label;
      const lower = METRICS[key].direction === "lower";
      return {
        ...base,
        headline: `Portfolio ${label}${isRatio ? " (Σ ÷ Σ revenue)" : ""} moved from ${fmtMetric(yAgo?.value ?? null, fmt)} in ${yAgo?.label} to ${fmtMetric(last.value, fmt)} in ${last.label} (${isRatio ? fmtPp(delta) : fmtPct(delta, { signed: true })}) for a fixed cohort of ${cohort.length} companies. ${
          rows.length ? `Largest ${isRatio ? "increase" : "growth"}: ${rows[0].label} (${isRatio ? fmtPp(rows[0].values.change as N) : fmtPct(rows[0].values.change as N, { signed: true })}); largest ${isRatio ? "decrease" : "decline"}: ${rows[rows.length - 1].label} (${isRatio ? fmtPp(rows[rows.length - 1].values.change as N) : fmtPct(rows[rows.length - 1].values.change as N, { signed: true })}).` : ""
        }`,
        kpis: [
          { label: `${label} ${last.label}`, value: fmtMetric(last.value, fmt) },
          { label: `${label} ${yAgo?.label}`, value: fmtMetric(yAgo?.value ?? null, fmt) },
          { label: "Change", value: isRatio ? fmtPp(delta) : fmtPct(delta, { signed: true }), sub: isRatio ? (lower ? ((delta ?? 0) > 0 ? "Unfavorable" : "Favorable") : (delta ?? 0) > 0 ? "Favorable" : "Unfavorable") : undefined },
        ],
        columns: [
          { key: "cur", label: last.label, format: fmt },
          { key: "prev", label: yAgo?.label ?? "Prior", format: fmt },
          { key: "change", label: "Change", format: isRatio ? "pp" : "pct" },
        ],
        rows,
        chart: { type: "line", title: `Portfolio ${label} — trailing 8 quarters`, format: fmt, data: series },
        whyItMatters: isRatio ? `A portfolio-level ratio can move because individual companies change or because the mix shifts toward larger companies. The company table separates the two.` : "Trend shown for a fixed cohort so that reporting gaps do not distort the line.",
        explore: rows.slice(0, 3).map((r) => ({ label: r.label, href: ROUTE(r.companyId!), kind: "company" as const })),
        methodology: [
          `Fixed cohort: ${cohort.length} companies with complete data in every quarter shown.`,
          isRatio ? `Portfolio ratio = Σ numerator ÷ Σ revenue each quarter (weighted).` : "Portfolio value = Σ company values each quarter.",
          "Company change compares the latest quarter with the same quarter one year earlier.",
        ],
        followUps: ["Which companies grew labor costs faster than revenue?", "How has gross margin changed?"],
      };
    }

    // ------------------------------------------------------------------ ranking
    case "rank_companies": {
      const key = q.metric ?? "revenueGrowth";
      const getter = (a: CompanyAnalysis): N => {
        const c = cmpOf(a, b);
        switch (key) {
          case "revenueGrowth":
          case "revenue":
            return key === "revenue" && q.direction && !/grow/i.test(q.text) ? a.current.metrics.revenue : c?.revenueGrowth ?? null;
          case "arr":
            return c?.arrGrowth ?? null;
          case "laborExpense":
            return c?.laborGrowth ?? null;
          case "cfo":
            return a.current.metrics.cfo;
          default:
            return (a.current.metrics as unknown as Record<string, N>)[key] ?? null;
        }
      };
      const metricKey = key === "revenue" && !/grow/i.test(q.text) && q.direction ? "revenue" : key === "revenue" ? "revenueGrowth" : key === "arr" ? "arrGrowth" : key === "laborExpense" ? "laborGrowth" : key;
      const def = METRICS[metricKey];
      const rows: AnswerRow[] = [];
      const excluded: string[] = [];
      for (const a of analyses) {
        const v = curReason(a) ? null : getter(a);
        if (curReason(a)) excluded.push(`${a.company.name}: ${curReason(a)}`);
        else if (v === null) excluded.push(`${a.company.name}: ${def.label} not available`);
        else {
          const c = cmpOf(a, b);
          const acq = (metricKey === "revenueGrowth" || metricKey === "arrGrowth") && c?.acquisitions.length;
          rows.push({
            companyId: a.company.id,
            label: a.company.name,
            values: { value: v, organic: metricKey === "revenueGrowth" && acq ? (c!.organicAvailable ? c!.organicRevenueGrowth : null) : null, sector: a.company.subsector },
            note: acq ? "Includes acquisition" : undefined,
            tone: acq ? "muted" : undefined,
          });
        }
      }
      const desc = (q.direction ?? "desc") === "desc";
      rows.sort((x, y) => (desc ? (y.values.value as number) - (x.values.value as number) : (x.values.value as number) - (y.values.value as number)));
      const top = rows.slice(0, q.limit ?? 3);
      const scopeWord = q.sector === "Software" ? "software companies" : q.sector === "Business Services" ? "services companies" : "companies";
      return {
        ...base,
        headline: rows.length
          ? `${desc ? "Highest" : "Lowest"} ${def.label.toLowerCase()} among ${rows.length} ${scopeWord} in ${period.label}${def.format === "pct" && metricKey.includes("Growth") ? ` (${cmpLabel})` : ""}: ${top
              .map((r, i) => `${i + 1}. ${r.label} ${fmtMetric(r.values.value as number, def.format, { signed: metricKey.includes("Growth") })}${r.note ? ` — includes acquisition${r.values.organic !== null ? `; organic ${fmtPct(r.values.organic as number)}` : "; organic N/A"}` : ""}`)
              .join(", ")}.`
          : `No ${scopeWord} have ${def.label.toLowerCase()} available for ${period.label}.`,
        kpis: [
          { label: `#1 ${def.label}`, value: rows[0] ? fmtMetric(rows[0].values.value as number, def.format) : "N/A", sub: rows[0]?.label },
          { label: "Median", value: fmtMetric(median(rows.map((r) => r.values.value as N)), def.format) },
          { label: "Companies ranked", value: `${rows.length} of ${analyses.length}` },
        ],
        columns: [
          { key: "value", label: def.label, format: def.format },
          ...(metricKey === "revenueGrowth" ? [{ key: "organic", label: "Organic (if acquisition)", format: "pct" as const }] : []),
          { key: "sector", label: "Subsector", format: "text" },
        ],
        rows,
        chart: { type: "bar", title: def.label, format: def.format, data: rows.map((r) => ({ label: r.label, value: r.values.value as N, companyId: r.companyId })) },
        whyItMatters: metricKey.includes("Growth") ? "Growth rankings flag where momentum sits. Acquisition-affected growth is marked so that inorganic growth is not mistaken for operating performance." : "Ranking on normalized metrics avoids rewarding scale alone.",
        explore: top.map((r) => ({ label: r.label, href: ROUTE(r.companyId!), kind: "company" as const })),
        methodology: [def.definition, ...excluded.map((e) => `Excluded — ${e}.`)],
        followUps: ["What about services companies?", "Which companies are outperforming their peers?"],
      };
    }

    // ------------------------------------------------------------------ compare companies
    case "compare_companies": {
      const ids = q.companies.slice(0, 5);
      const as = ids.map((id) => analyzeCompany(id, period));
      const metrics: [string, string, MetricFormat, (a: CompanyAnalysis) => N][] = [
        ["revenue", "Revenue", "usd", (a) => a.current.metrics.revenue],
        ["revenueGrowth", `Revenue growth (${b === "yoy" ? "YoY" : "QoQ"})`, "pct", (a) => cmpOf(a, b)?.revenueGrowth ?? null],
        ["ebitdaMargin", "EBITDA margin", "pct", (a) => a.current.metrics.ebitdaMargin],
        ["grossMargin", "Gross margin", "pct", (a) => a.current.metrics.grossMargin],
        ["laborIntensity", "Labor / revenue", "pct", (a) => a.current.metrics.laborIntensity],
        ["laborGrowth", "Labor cost growth", "pct", (a) => cmpOf(a, b)?.laborGrowth ?? null],
        ["gaRatio", "G&A / revenue", "pct", (a) => a.current.metrics.gaRatio],
        ["cashConversion", "Cash conversion", "pct", (a) => a.current.metrics.cashConversion],
        ["revenueVsBudget", "Revenue vs budget", "pct", (a) => a.budget.revenueVarPct],
      ];
      const rows: AnswerRow[] = metrics.map(([k, l, , g]) => ({ label: l, values: Object.fromEntries(as.map((a) => [a.company.id, g(a)])), note: k }));
      const [x, y] = as;
      const diffs = [
        ["EBITDA margin", x.current.metrics.ebitdaMargin, y?.current.metrics.ebitdaMargin],
        ["revenue growth", cmpOf(x, b)?.revenueGrowth ?? null, y ? cmpOf(y, b)?.revenueGrowth ?? null : null],
        ["labor intensity", x.current.metrics.laborIntensity, y?.current.metrics.laborIntensity],
      ] as [string, N, N][];
      return {
        ...base,
        scope: `${period.label} · ${as.map((a) => a.company.name).join(" vs ")}`,
        headline: y
          ? `${x.company.name} vs ${y.company.name}, ${period.label}: ${diffs
              .map(([l, a1, a2]) => `${l} ${fmtPct(a1)} vs ${fmtPct(a2)} (${fmtPp(a1 !== null && a2 !== null ? a1 - a2 : null)})`)
              .join("; ")}.${x.company.sector !== y.company.sector ? " Note: these companies are in different sectors, so cost ratios are structurally different." : ""}`
          : `${x.company.name} in ${period.label}.`,
        kpis: as.map((a) => ({ label: a.company.name, value: fmtPct(a.current.metrics.ebitdaMargin), sub: `EBITDA margin · ${a.company.subsector}` })),
        columns: as.map((a) => ({ key: a.company.id, label: a.company.name, format: "text" as const })),
        rows: rows.map((r) => ({ ...r, values: Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, fmtMetric(v as N, metrics.find((m) => m[0] === r.note)![2])])) as Record<string, string>, note: undefined })),
        chart: { type: "bar", title: "EBITDA margin", format: "pct", data: as.map((a) => ({ label: a.company.name, value: a.current.metrics.ebitdaMargin, companyId: a.company.id })) },
        whyItMatters: "Normalized metrics (growth, margins, cost ratios) are compared rather than absolute size, so a larger company is not implied to be better run.",
        explore: [{ label: "Compare side by side", href: routes.compareSide(ids), kind: "compare" }, ...as.map((a) => ({ label: a.company.name, href: ROUTE(a.company.id), kind: "company" as const }))],
        methodology: ["All metrics from the same period and comparison basis for each company.", ...as.filter((a) => curReason(a)).map((a) => `${a.company.name}: ${curReason(a)}.`)],
        followUps: [`Compare ${x.company.name} with other ${x.company.sector === "Software" ? "software" : "services"} businesses`],
      };
    }

    // ------------------------------------------------------------------ compare to cohort
    case "compare_to_cohort": {
      const id = q.companies[0];
      const d = getData();
      const subj = d.companyById.get(id)!;
      const dim: CohortDimension = q.businessModel ? "businessModel" : q.fund ? "fund" : q.sector && q.sector !== subj.sector ? "portfolio" : "sector";
      const universe = applyFilters(d.companies, ctx.filters);
      const bm = buildBenchmark(id, dim, universe.some((c) => c.id === id) ? universe : [...universe, subj], period);
      const defs: [string, string, MetricFormat, (a: CompanyAnalysis) => N, boolean][] = [
        ["revenueGrowth", `Revenue growth (${b === "yoy" ? "YoY" : "QoQ"})`, "pct", (a) => cmpOf(a, b)?.revenueGrowth ?? null, true],
        ["ebitdaMargin", "EBITDA margin", "pct", (a) => a.current.metrics.ebitdaMargin, true],
        ["grossMargin", "Gross margin", "pct", (a) => a.current.metrics.grossMargin, true],
        ["laborIntensity", "Labor / revenue", "pct", (a) => a.current.metrics.laborIntensity, false],
        ["laborGrowth", "Labor cost growth", "pct", (a) => cmpOf(a, b)?.laborGrowth ?? null, false],
        ["ebitdaMarginChange", `EBITDA margin change (${b === "yoy" ? "YoY" : "QoQ"})`, "pp", (a) => cmpOf(a, b)?.ebitdaMarginChange ?? null, true],
        ["gaRatio", "G&A / revenue", "pct", (a) => a.current.metrics.gaRatio, false],
        ["cashConversion", "Cash conversion", "pct", (a) => a.current.metrics.cashConversion, true],
      ];
      const rows: AnswerRow[] = defs.map(([k, l, f, g, higher]) => {
        const mb = benchmarkMetric(bm, k, g);
        const delta = mb.deltaVsMedian;
        return {
          label: l,
          values: { subject: mb.subject, median: mb.stats.median, mean: mb.stats.mean, delta, n: mb.stats.n },
          tone: delta === null || Math.abs(delta) < 0.01 ? undefined : (delta > 0) === higher ? "pos" : "neg",
          rowFormat: f,
        };
      });
      const em = rows[1].values;
      const li = rows[3].values;
      const rg = rows[0].values;
      const lg = rows[4].values;
      const emc = rows[5].values;
      return {
        ...base,
        scope: `${period.label} · ${subj.name} vs ${bm.cohortLabel} peers (n = ${bm.peers.length}, excl. ${subj.name})`,
        headline: bm.peers.length
          ? `Versus the median of ${bm.peers.length} ${bm.cohortLabel.toLowerCase()} peers (${bm.peers.map((p) => p.company.name).join(", ")}): ${subj.name} labor costs grew ${fmtPct(lg.subject as N)} vs a peer median of ${fmtPct(lg.median as N)}; labor intensity is ${fmtPct(li.subject as N)} vs ${fmtPct(li.median as N)} (${fmtPp(li.delta as N)}); EBITDA margin is ${fmtPct(em.subject as N)} vs ${fmtPct(em.median as N)} (${fmtPp(em.delta as N)}) after a ${fmtPp(emc.subject as N)} change vs a peer median of ${fmtPp(emc.median as N)}; revenue growth is ${fmtPct(rg.subject as N)} vs ${fmtPct(rg.median as N)}.`
          : `No eligible peers for ${subj.name} under this cohort definition.`,
        kpis: [
          { label: "Peer cohort", value: `${bm.cohortLabel}`, sub: `n = ${bm.peers.length} (subject excluded)` },
          { label: "EBITDA margin vs median", value: fmtPp(em.delta as N) },
          { label: "Labor intensity vs median", value: fmtPp(li.delta as N) },
        ],
        columns: [
          { key: "subject", label: subj.name, format: "pct" },
          { key: "median", label: "Peer median", format: "pct" },
          { key: "mean", label: "Peer average", format: "pct" },
          { key: "delta", label: "vs median", format: "pp" },
          { key: "n", label: "n", format: "count" },
        ],
        rows,
        chart: {
          type: "bar",
          title: `EBITDA margin — ${subj.name} vs peers`,
          format: "pct",
          data: [bm.subject, ...bm.peers].map((a) => ({ label: a.company.name, value: a.current.metrics.ebitdaMargin, companyId: a.company.id })),
          referenceValue: em.median as N,
          referenceLabel: "Peer median",
        },
        whyItMatters: "Peer medians show what is achievable for similar businesses inside the same portfolio, which makes gaps more actionable than comparisons with external benchmarks of unknown definition.",
        explore: [
          { label: `Open ${subj.name}`, href: ROUTE(id), kind: "company" },
          { label: "Open full peer comparison", href: routes.comparePeers(id), kind: "compare" },
          ...bm.peers.slice(0, 3).map((p) => ({ label: p.company.name, href: ROUTE(p.company.id), kind: "company" as const })),
        ],
        methodology: [`Peer rule: ${bm.rule}`, "Benchmark statistic: median (robust to outliers); average shown for reference.", ...bm.warnings, ...bm.ineligible.map((x) => `Not eligible — ${x.company.name}: ${x.reason}.`)],
        followUps: [`Show me ${subj.name}`, "Which services companies have labor costs growing faster than revenue?"],
        caveats: bm.warnings,
      };
    }

    // ------------------------------------------------------------------ outperformers
    case "outperformers": {
      const d = getData();
      const rows: AnswerRow[] = [];
      const excluded: string[] = [];
      const universe = applyFilters(d.companies, ctx.filters);
      for (const a of analyses) {
        if (curReason(a)) {
          excluded.push(`${a.company.name}: ${curReason(a)}`);
          continue;
        }
        const bm = buildBenchmark(a.company.id, "sector", universe, period);
        if (!bm.meaningful) {
          excluded.push(`${a.company.name}: peer cohort too small (n = ${bm.peers.length})`);
          continue;
        }
        const g = benchmarkMetric(bm, "g", (x) => (cmpOf(x, b)?.acquisitions.length ? cmpOf(x, b)?.organicRevenueGrowth ?? null : cmpOf(x, b)?.revenueGrowth ?? null));
        const m = benchmarkMetric(bm, "m", (x) => x.current.metrics.ebitdaMargin);
        const mc = benchmarkMetric(bm, "mc", (x) => cmpOf(x, b)?.ebitdaMarginChange ?? null);
        const score = [g.deltaVsMedian, m.deltaVsMedian, mc.deltaVsMedian].filter((v): v is number => v !== null);
        const above = score.filter((v) => v > 0).length;
        rows.push({
          companyId: a.company.id,
          label: a.company.name,
          values: { growthVs: g.deltaVsMedian, marginVs: m.deltaVsMedian, marginChVs: mc.deltaVsMedian, above, cohort: `${a.company.sector} (n=${bm.peers.length})` },
          tone: above === 3 ? "pos" : above === 0 ? "neg" : undefined,
        });
      }
      const wantUnder = q.polarity === "negative";
      rows.sort((x, y) => (wantUnder ? (x.values.above as number) - (y.values.above as number) : (y.values.above as number) - (x.values.above as number)) || ((y.values.marginVs as number) - (x.values.marginVs as number)) * (wantUnder ? -1 : 1));
      const hits = rows.filter((r) => (wantUnder ? r.values.above === 0 : r.values.above === 3));
      return {
        ...base,
        headline: hits.length
          ? `${hits.length} compan${hits.length === 1 ? "y is" : "ies are"} ${wantUnder ? "below" : "above"} their sector-peer median on all three measures (growth, EBITDA margin, and margin trend) in ${period.label}: ${hits.map((r) => r.label).join(", ")}.`
          : `No company is ${wantUnder ? "below" : "above"} its sector-peer median on all three measures in ${period.label}.`,
        kpis: [
          { label: wantUnder ? "Underperforming on all 3" : "Outperforming on all 3", value: String(hits.length) },
          { label: "Companies assessed", value: `${rows.length} of ${analyses.length}` },
        ],
        columns: [
          { key: "growthVs", label: "Growth vs median", format: "pp" },
          { key: "marginVs", label: "EBITDA margin vs median", format: "pp" },
          { key: "marginChVs", label: "Margin trend vs median", format: "pp" },
          { key: "above", label: "Measures above", format: "count" },
          { key: "cohort", label: "Peer cohort", format: "text" },
        ],
        rows,
        chart: { type: "bar", title: "EBITDA margin vs sector-peer median (pp)", format: "pp", data: rows.map((r) => ({ label: r.label, value: r.values.marginVs as N, companyId: r.companyId })), referenceValue: 0 },
        whyItMatters: "Outperformance is judged against each company's own sector peers (median, subject excluded), so a software company is not compared with a staffing business.",
        explore: hits.slice(0, 3).map((r) => ({ label: r.label, href: ROUTE(r.companyId!), kind: "company" as const })),
        methodology: [
          "Measures: revenue growth (organic where acquisition-affected and available), EBITDA margin, and EBITDA margin change — each compared with the sector-peer median, excluding the company itself.",
          "Acquisition-affected peers without organic data are excluded from the growth median.",
          `Cohorts below ${3} eligible peers are not assessed.`,
          ...excluded.map((e) => `Excluded — ${e}.`),
        ],
        followUps: ["Which companies are underperforming their peers?", "Compare Meridian Services with other services businesses"],
      };
    }

    // ------------------------------------------------------------------ company summary
    case "company_summary": {
      const id = q.companies[0];
      const a = analyzeCompany(id, period);
      const d = getData();
      const c = cmpOf(a, b);
      const ins = detectCompanyInsights(a, applyFilters(d.companies, ctx.filters), period).filter((i) => i.severity !== "low");
      const m = a.current.metrics;
      if (curReason(a))
        return {
          ...base,
          headline: `${a.company.name} has ${curReason(a)} for ${period.label}. Its most recent data covers ${lastReportedLabel(a.company.lastReportedMonth)}.`,
          kpis: [],
          columns: [],
          rows: [],
          chart: null,
          whyItMatters: "Period figures are not computed from incomplete data.",
          explore: [{ label: `Open ${a.company.name}`, href: ROUTE(id), kind: "company" }, { label: "Data Connections", href: "/connections", kind: "page" }],
          methodology: ["Companies with missing or partial periods are excluded from period calculations."],
          followUps: ["Which companies have not reported?"],
        };
      return {
        ...base,
        scope: `${period.label} · ${a.company.name}`,
        headline: `${a.company.name} reported ${fmtUsd(m.revenue)} revenue in ${period.label} (${fmtPct(c?.revenueGrowth ?? null, { signed: true })} ${cmpLabel}${c?.acquisitions.length ? ", acquisition-affected" : ""}), EBITDA of ${fmtUsd(m.ebitda)} at a ${fmtPct(m.ebitdaMargin)} margin (${fmtPp(c?.ebitdaMarginChange ?? null)}), and operating cash flow of ${fmtUsd(m.cfo)}.${ins.length ? ` ${ins.length} flagged insight${ins.length === 1 ? "" : "s"}: ${ins.slice(0, 3).map((i) => i.title.toLowerCase()).join("; ")}.` : " No material flags."}`,
        kpis: [
          { label: "Revenue", value: fmtUsd(m.revenue), sub: fmtPct(c?.revenueGrowth ?? null, { signed: true }) },
          { label: "EBITDA margin", value: fmtPct(m.ebitdaMargin), sub: fmtPp(c?.ebitdaMarginChange ?? null) },
          { label: "Revenue vs budget", value: fmtPct(a.budget.revenueVarPct, { signed: true }) },
        ],
        columns: [{ key: "detail", label: "Finding", format: "text" }],
        rows: ins.map((i) => ({ label: i.title, values: { detail: i.finding }, tone: i.severity === "positive" ? "pos" : "neg" })),
        chart: null,
        whyItMatters: "Company summaries combine the period's key metrics with the insight engine's flags for that company.",
        explore: [{ label: `Open ${a.company.name}`, href: ROUTE(id), kind: "company" }, { label: "Compare with peers", href: routes.comparePeers(id), kind: "compare" }],
        methodology: ["Figures from the company's submitted or connected ledger data; insight thresholds as configured in the insight engine."],
        followUps: [`Compare ${a.company.name} with other ${a.company.sector === "Software" ? "software" : "services"} businesses`],
      };
    }

    // ------------------------------------------------------------------ reporting status
    case "reporting_status": {
      const rows: AnswerRow[] = analyses.map((a) => ({
        companyId: a.company.id,
        label: a.company.name,
        values: {
          status: a.current.status === "complete" ? "Complete" : a.current.status === "partial" ? `Partial (${a.current.monthsAvailable}/${a.current.monthsExpected})` : "Missing",
          last: lastReportedLabel(a.company.lastReportedMonth),
          source: a.company.connection === "dualentry" ? "DualEntry (live)" : a.company.connection === "upload" ? `Upload · ${a.company.accountingSystem}` : `Not connected · ${a.company.accountingSystem}`,
          budget: a.budget.status === "complete" ? "Yes" : "No",
        },
        tone: a.current.status === "complete" ? undefined : "neg",
      }));
      rows.sort((x, y) => (x.tone === "neg" ? -1 : 0) - (y.tone === "neg" ? -1 : 0));
      const gaps = analyses.filter((a) => a.current.status !== "complete");
      return {
        ...base,
        headline: gaps.length
          ? `${analyses.length - gaps.length} of ${analyses.length} companies have complete ${period.label} data. Gaps: ${gaps.map((a) => `${a.company.name} (${curReason(a)})`).join("; ")}.`
          : `All ${analyses.length} companies have complete ${period.label} data.`,
        kpis: [
          { label: "Complete", value: `${analyses.length - gaps.length} of ${analyses.length}` },
          { label: "Budget coverage", value: `${analyses.filter((a) => a.budget.status === "complete").length} of ${analyses.length}` },
        ],
        columns: [
          { key: "status", label: "Status", format: "text" },
          { key: "last", label: "Last month", format: "text" },
          { key: "source", label: "Source", format: "text" },
          { key: "budget", label: "Budget", format: "text" },
        ],
        rows,
        chart: null,
        whyItMatters: "Portfolio totals and comparisons only include companies with complete data, so reporting gaps change what the numbers represent.",
        explore: [{ label: "Data Connections", href: "/connections", kind: "page" }],
        methodology: ["A period is complete when every month has been submitted or synced."],
        followUps: ["What was portfolio revenue growth in Q3 2026?"],
      };
    }
  }
  return unsupported(q, "That question type is not supported yet.");
}
