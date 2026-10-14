/**
 * Local question interpreter for "Ask Your Portfolio".
 *
 * Maps a plain-English question onto one of an approved set of intents plus
 * structured parameters (metric, scope, period, comparison basis, companies).
 * It performs NO arithmetic — every figure is computed afterwards by the
 * analytics engine. Nothing leaves the browser; no API key is required.
 */
import { getData } from "../data";
import type { BusinessModel, FundId, Sector } from "../data/types";
import type { ComparisonBasis, PeriodSelection } from "../engine/periods";
import { selectableYears } from "../engine/periods";

export type Intent =
  | "portfolio_growth"
  | "portfolio_margin"
  | "portfolio_total"
  | "rank_companies"
  | "compare_companies"
  | "compare_to_cohort"
  | "labor_growth_outliers"
  | "budget_variance"
  | "cash_flow_outliers"
  | "margin_changes"
  | "trend_summary"
  | "outperformers"
  | "company_summary"
  | "reporting_status"
  | "unsupported";

export const INTENT_LABELS: Record<Intent, string> = {
  portfolio_growth: "Portfolio growth",
  portfolio_margin: "Portfolio margin",
  portfolio_total: "Portfolio totals",
  rank_companies: "Rank companies",
  compare_companies: "Compare companies",
  compare_to_cohort: "Compare to peer cohort",
  labor_growth_outliers: "Labor vs revenue growth",
  budget_variance: "Budget variance",
  cash_flow_outliers: "Cash-flow outliers",
  margin_changes: "Margin changes",
  trend_summary: "Trend summary",
  outperformers: "Peer out/under-performance",
  company_summary: "Company summary",
  reporting_status: "Reporting status",
  unsupported: "Not supported",
};

export type QueryMetric =
  | "revenue"
  | "ebitda"
  | "ebitdaMargin"
  | "grossMargin"
  | "laborExpense"
  | "laborIntensity"
  | "gaRatio"
  | "smRatio"
  | "cfo"
  | "cashConversion"
  | "arr"
  | "revenueGrowth";

export interface ParsedQuery {
  text: string;
  intent: Intent;
  metric: QueryMetric | null;
  companies: string[];
  sector: Sector | null;
  businessModel: BusinessModel | null;
  fund: FundId | null;
  period: Partial<PeriodSelection> | null;
  relativePeriod: "previous" | null;
  basis: ComparisonBasis | null;
  direction: "desc" | "asc" | null;
  /** "negative" = misses / declines / deterioration; "positive" = beats / improvements. */
  polarity: "negative" | "positive" | null;
  limit: number | null;
  isFollowUp: boolean;
  unsupportedReason: string | null;
  matched: string[];
}

const METRIC_PATTERNS: [RegExp, QueryMetric][] = [
  [/\bcash conversion\b/, "cashConversion"],
  [/\b(operating cash|cash flow|cash from operations|cfo|cash generation)\b/, "cfo"],
  [/\bgross margins?\b|\bgm\b/, "grossMargin"],
  [/\bebitda margins?\b|\bprofitability\b|\bmargins?\b/, "ebitdaMargin"],
  [/\blabou?r intensity\b|\blabou?r (as a )?(%|percent|percentage|share) of revenue\b/, "laborIntensity"],
  [/\b(labou?r|personnel|payroll|staff costs?|wages?|people costs?|headcount costs?)\b/, "laborExpense"],
  [/\b(g&a|g & a|g and a|general and admin\w*|general & admin\w*|overhead|admin costs?)\b/, "gaRatio"],
  [/\b(s&m|sales and marketing|sales & marketing)\b/, "smRatio"],
  [/\barr\b|\bannual recurring revenue\b|\brecurring revenue\b/, "arr"],
  [/\bebitda\b|\bearnings\b|\bprofits?\b/, "ebitda"],
  [/\b(revenue|sales|top[- ]line|turnover)\b/, "revenue"],
];

const SECTOR_PATTERNS: [RegExp, Sector][] = [
  [/\b(business services|services companies|services businesses|service businesses|service companies|services|asset[- ]light)\b/, "Business Services"],
  [/\b(software|saas|tech(nology)? companies)\b/, "Software"],
];

const MODEL_PATTERNS: [RegExp, BusinessModel][] = [
  [/\b(staffing|workforce)\b/, "Workforce & staffing"],
  [/\b(project[- ]based|consulting|advisory)\b/, "Project-based services"],
  [/\b(managed services|recurring services|outsourc\w*)\b/, "Recurring managed services"],
  [/\b(subscription)\b/, "Subscription software"],
  [/\b(tech[- ]enabled)\b/, "Tech-enabled services"],
];

const UNSUPPORTED: [RegExp, string][] = [
  [/\b(irr|moic|tvpi|dpi|rvpi|multiple of invested|returns?)\b/, "Fund returns (IRR, MOIC, TVPI) require investment cash flows and valuations, which are outside this operating-financial dataset."],
  [/\b(valuation|enterprise value|\bev\b|exit|marks?|fair value)\b/, "Valuations and exit analysis are not modeled. Portfolio Intelligence covers operating financials, not valuation."],
  [/\b(forecast|predict|projection|next quarter|next year|will .* (grow|be))\b/, "Forecasting is not supported — answers are restricted to reported actuals and approved budgets."],
  [/\b(stock|share price|public comps?|market multiple)\b/, "Public-market data is not part of the dataset."],
  [/\b(churn rate|ltv|cac|payback)\b/, "Unit-economics metrics (churn, LTV, CAC) are not reported in the standardized template."],
];

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[?!.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function companyAliases(): { id: string; aliases: string[] }[] {
  return getData().companies.map((c) => {
    const lower = c.name.toLowerCase();
    const first = lower.split(" ")[0];
    const aliases = [lower, first];
    if (first === "bluepeak") aliases.push("blue peak");
    if (first === "harbor") aliases.push("harbour");
    return { id: c.id, aliases };
  });
}

export function parseQuestion(raw: string, previous?: ParsedQuery | null): ParsedQuery {
  const text = norm(raw);
  const matched: string[] = [];

  // Companies (ordered by appearance)
  const found: { id: string; pos: number }[] = [];
  for (const { id, aliases } of companyAliases()) {
    let best = -1;
    for (const a of aliases) {
      const i = text.search(new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`));
      if (i >= 0 && (best < 0 || i < best)) best = i;
    }
    if (best >= 0) found.push({ id, pos: best });
  }
  const companies = found.sort((a, b) => a.pos - b.pos).map((f) => f.id);
  // Remove company names before scanning for sector words ("Meridian Services" ≠ "services").
  let scan = text;
  for (const { aliases } of companyAliases()) for (const a of aliases) scan = scan.replace(new RegExp(`\\b${a}\\b`, "g"), " ");

  let metric: QueryMetric | null = null;
  for (const [re, k] of METRIC_PATTERNS)
    if (re.test(scan)) {
      metric = k;
      matched.push(k);
      break;
    }

  let sector: Sector | null = null;
  for (const [re, s] of SECTOR_PATTERNS)
    if (re.test(scan)) {
      sector = s;
      matched.push(s);
      break;
    }
  let businessModel: BusinessModel | null = null;
  for (const [re, b] of MODEL_PATTERNS)
    if (re.test(scan)) {
      businessModel = b;
      break;
    }
  let fund: FundId | null = null;
  if (/\bfund (iii|3|three)\b/.test(text)) fund = "fund-iii";
  else if (/\bfund (ii|2|two)\b/.test(text)) fund = "fund-ii";

  // Period
  let period: Partial<PeriodSelection> | null = null;
  let relativePeriod: ParsedQuery["relativePeriod"] = null;
  const q1 = text.match(/\bq([1-4])\s*(?:fy)?\s*'?(20\d\d|\d\d)\b/) ?? null;
  const q2 = text.match(/\b(20\d\d)\s*q([1-4])\b/) ?? null;
  const fullYear = (y: string) => (y.length === 2 ? `20${y}` : y);
  if (q1) period = { kind: "quarter", quarter: `${fullYear(q1[2])}-Q${q1[1]}` };
  else if (q2) period = { kind: "quarter", quarter: `${q2[1]}-Q${q2[2]}` };
  if (/\b(ttm|trailing twelve|trailing 12|last twelve months|last 12 months|ltm)\b/.test(text)) period = { ...(period ?? {}), kind: "ttm" };
  else if (/\b(ytd|year to date|year-to-date)\b/.test(text)) period = { ...(period ?? {}), kind: "ytd" };
  else if (!period) {
    const fy = text.match(/\b(?:fy\s*|full[- ]year\s*|in\s+|for\s+)(20\d\d)\b/);
    if (fy && selectableYears().includes(Number(fy[1]))) period = { kind: "fy", year: Number(fy[1]) };
  }
  if (/\b(last|previous|prior) quarter\b/.test(text) && !/\bvs\.? (last|previous|prior) quarter\b|\bversus (last|previous|prior) quarter\b|\bthan (last|previous|prior) quarter\b/.test(text))
    relativePeriod = "previous";

  let basis: ComparisonBasis | null = null;
  if (/\b(budget|plan|forecasted)\b/.test(text)) basis = "budget";
  else if (/\b(qoq|quarter[- ]over[- ]quarter|sequential\w*|vs\.? (last|previous|prior) quarter|versus (last|previous|prior) quarter|than (last|previous|prior) quarter)\b/.test(text)) basis = "prior";
  else if (/\b(yoy|year[- ]over[- ]year|vs\.? last year|same quarter last year|prior year|last year)\b/.test(text)) basis = "yoy";

  let direction: ParsedQuery["direction"] = null;
  if (/\b(fastest|highest|top|best|most|largest|biggest|strongest|leading|leaders)\b/.test(text)) direction = "desc";
  if (/\b(slowest|lowest|bottom|worst|least|smallest|weakest|laggards?)\b/.test(text)) direction = "asc";

  let polarity: ParsedQuery["polarity"] = null;
  if (/\b(miss\w*|below|under|short\w*|behind|declin\w*|deteriorat\w*|worsen\w*|contract\w*|weak\w*|fall\w*|fell|drop\w*|shrink\w*|compress\w*|negative|underperform\w*)\b/.test(text)) polarity = "negative";
  else if (/\b(beat\w*|above|ahead|exceed\w*|improv\w*|expand\w*|grow\w*|increas\w*|strong\w*|outperform\w*|positive)\b/.test(text)) polarity = "positive";

  const limitMatch = text.match(/\btop (\d+)\b|\bbottom (\d+)\b/);
  const limit = limitMatch ? Number(limitMatch[1] ?? limitMatch[2]) : null;

  // ---------------- Intent classification (ordered, most specific first) ----------------
  let intent: Intent = "unsupported";
  let unsupportedReason: string | null = null;
  for (const [re, reason] of UNSUPPORTED)
    if (re.test(text)) {
      unsupportedReason = reason;
      break;
    }

  const laborVsRevenue =
    (metric === "laborExpense" || metric === "laborIntensity" || /\blabou?r|personnel|payroll|wage/.test(scan)) &&
    /(faster than|outpac\w*|ahead of|more than|exceed\w*|outgrow\w*|grew faster|growing faster|vs\.? revenue|versus revenue|relative to revenue|compared to revenue)/.test(text);
  const wantsPeers = /\b(peers?|cohort|benchmark\w*|other (business |asset[- ]light )?services|other software|similar companies|comparable)\b/.test(text);
  const wantsCompare = /\b(compare|comparison|versus|vs\.?|against|relative to|side by side)\b/.test(text);
  const isTrend = /\b(how has|how have|changed|trend\w*|over time|evolv\w*|trajectory|history)\b/.test(text);

  if (unsupportedReason) intent = "unsupported";
  else if (/\b(report\w*|submi\w*|missing|stale|overdue|fresh\w*|data quality|haven't|have not|late)\b/.test(text) && /\b(data|report|submi|missing|stale|overdue|late|fresh|quality)\w*/.test(text) && !metric)
    intent = "reporting_status";
  else if (laborVsRevenue) intent = "labor_growth_outliers";
  else if (/\b(outperform\w*|underperform\w*|beating (their )?peers|lagging (their )?peers|ahead of (their )?peers|behind (their )?peers)\b/.test(text) && companies.length === 0)
    intent = "outperformers";
  else if (companies.length >= 2) intent = "compare_companies";
  else if (companies.length === 1 && (wantsPeers || wantsCompare)) intent = "compare_to_cohort";
  else if (basis === "budget" && companies.length === 0) intent = "budget_variance";
  else if ((metric === "cfo" || metric === "cashConversion") && (polarity !== null || direction !== null || /\bwhich\b/.test(text)) && !isTrend)
    intent = metric === "cfo" && direction !== null ? "rank_companies" : "cash_flow_outliers";
  else if ((metric === "ebitdaMargin" || metric === "grossMargin") && /\b(deteriorat\w*|declin\w*|contract\w*|compress\w*|expand\w*|improv\w*|worsen\w*|eroding|erosion|falling|rising)\b/.test(text))
    intent = "margin_changes";
  else if (isTrend && companies.length === 0) intent = "trend_summary";
  else if (companies.length === 1) intent = "company_summary";
  else if (/\bwhich\b|\bwho\b|\brank\w*|\blist\b|\bshow me\b/.test(text) && (direction !== null || /\bgrow\w*\b/.test(text))) intent = "rank_companies";
  else if (/\bwhich\b/.test(text) && metric && polarity) intent = metric === "ebitdaMargin" || metric === "grossMargin" ? "margin_changes" : "rank_companies";
  else if ((metric === "ebitdaMargin" || metric === "grossMargin") && /\b(average|mean|portfolio|our|overall|aggregate|weighted|what is|what was)\b/.test(text)) intent = "portfolio_margin";
  else if (/\b(growth|grow\w*|increase)\b/.test(text) && /\b(portfolio|our|overall|aggregate|total|what was|what is|how much)\b/.test(text)) intent = "portfolio_growth";
  else if (metric && /\b(portfolio|our|overall|aggregate|total|what was|what is|how much)\b/.test(text)) intent = "portfolio_total";
  else if (/\bwhich\b|\bwho\b/.test(text) && metric) intent = "rank_companies";

  if (intent === "rank_companies" && metric === null) metric = "revenueGrowth";
  if (intent === "rank_companies" && /\b(grow\w*|growth)\b/.test(text) && (metric === "revenue" || metric === null)) metric = "revenueGrowth";
  if (intent === "rank_companies" && direction === null) direction = polarity === "negative" ? "asc" : "desc";

  // Follow-up support: "what about software?", "and for Fund III?", "how about Q2 2026?"
  const followUpCue = /^(what about|how about|and( for| in)?|same for|now for|what if|show me the same|ok,? (and|now))\b/.test(text) || text.split(" ").length <= 4;
  let isFollowUp = false;
  if (previous && previous.intent !== "unsupported" && (intent === "unsupported" || (followUpCue && intent !== "labor_growth_outliers" && !metric && companies.length === 0))) {
    if (sector || businessModel || fund || period || basis || companies.length || relativePeriod || direction) {
      isFollowUp = true;
      if (companies.length >= 2) intent = "compare_companies";
      else if (companies.length === 1) intent = previous.intent === "compare_to_cohort" ? "compare_to_cohort" : "company_summary";
      else intent = previous.intent;
      return {
        ...previous,
        text: raw,
        intent,
        companies: companies.length ? companies : previous.companies,
        sector: sector ?? (companies.length ? null : previous.sector),
        businessModel: businessModel ?? previous.businessModel,
        fund: fund ?? previous.fund,
        period: period ?? previous.period,
        relativePeriod: relativePeriod ?? previous.relativePeriod,
        basis: basis ?? previous.basis,
        direction: direction ?? previous.direction,
        isFollowUp,
        unsupportedReason: null,
        matched,
      };
    }
  }

  return {
    text: raw,
    intent,
    metric,
    companies,
    sector,
    businessModel,
    fund,
    period,
    relativePeriod,
    basis,
    direction,
    polarity,
    limit,
    isFollowUp,
    unsupportedReason: intent === "unsupported" ? unsupportedReason : null,
    matched,
  };
}

export const SUGGESTED_QUESTIONS = [
  "What was portfolio revenue growth in Q3 2026?",
  "Which services companies have labor costs growing faster than revenue, and by how much?",
  "Which companies missed EBITDA budget?",
  "Compare Meridian Services with other services businesses",
  "Which businesses have deteriorating gross margins?",
  "Which software companies are growing fastest?",
  "What is our average EBITDA margin?",
  "Which companies experienced declining operating cash flow?",
  "How has G&A as a percentage of revenue changed?",
  "Which companies are outperforming their peers?",
];
