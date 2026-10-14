/**
 * Peer benchmarking. Default statistic is the MEDIAN of eligible peers; the
 * subject company is always EXCLUDED from its own peer baseline.
 */
import { getData, type IndexedDataset } from "../data";
import type { Company } from "../data/types";
import { mean, median, percentRank, quantile, type N } from "./core";
import { analyzeCompany, type CompanyAnalysis } from "./company";
import { resolvePeriod, makePeriod, type Period } from "./periods";

export type CohortDimension = "sector" | "businessModel" | "fund" | "vintage" | "revenueBand" | "portfolio";

export const DIMENSION_LABELS: Record<CohortDimension, string> = {
  sector: "Sector",
  businessModel: "Business model",
  fund: "Fund",
  vintage: "Investment vintage",
  revenueBand: "Revenue band (TTM)",
  portfolio: "Entire portfolio",
};

export const MIN_COHORT = 3; // below this a benchmark is not shown as meaningful
export const CAUTION_COHORT = 5; // below this a small-cohort caution is shown

export function revenueBand(ttmRevenue: N): string {
  if (ttmRevenue === null) return "Unknown";
  if (ttmRevenue < 25) return "< $25M";
  if (ttmRevenue <= 75) return "$25M – $75M";
  return "> $75M";
}

export function ttmRevenue(companyId: string, p: Period, data: IndexedDataset = getData()): N {
  const ttm = makePeriod("ttm", Math.max(0, p.end - 11), p.end);
  if (p.end - 11 < 0) return null;
  return analyzeCompany(companyId, ttm, data).current.metrics.revenue;
}

export function cohortKey(c: Company, dim: CohortDimension, p: Period, data: IndexedDataset = getData()): string {
  switch (dim) {
    case "sector":
      return c.sector;
    case "businessModel":
      return c.businessModel;
    case "fund":
      return data.funds.find((f) => f.id === c.fund)!.shortName;
    case "vintage":
      return String(c.vintage);
    case "revenueBand":
      return revenueBand(ttmRevenue(c.id, p, data));
    case "portfolio":
      return "All companies";
  }
}

export interface CohortStats {
  n: number;
  median: N;
  mean: N;
  p25: N;
  p75: N;
  min: N;
  max: N;
}

export interface Benchmark {
  subject: CompanyAnalysis;
  dimension: CohortDimension;
  cohortLabel: string;
  peers: CompanyAnalysis[];
  ineligible: { company: Company; reason: string }[];
  warnings: string[];
  meaningful: boolean;
  rule: string;
}

export function statsOf(values: N[]): CohortStats {
  const v = values.filter((x): x is number => x !== null);
  return {
    n: v.length,
    median: median(v),
    mean: mean(v),
    p25: quantile(v, 0.25),
    p75: quantile(v, 0.75),
    min: v.length ? Math.min(...v) : null,
    max: v.length ? Math.max(...v) : null,
  };
}

export function defaultDimension(c: Company): CohortDimension {
  return c.sector === "Business Services" || c.sector === "Software" ? "sector" : "portfolio";
}

/**
 * Builds the peer cohort for a subject company. The peer universe is the set of
 * companies passed in (normally the globally filtered portfolio).
 */
export function buildBenchmark(subjectId: string, dimension: CohortDimension, universe: Company[], p: Period, data: IndexedDataset = getData()): Benchmark {
  const subjectCo = data.companyById.get(subjectId)!;
  const subject = analyzeCompany(subjectId, p, data);
  const key = cohortKey(subjectCo, dimension, p, data);
  const candidates = universe.filter((c) => c.id !== subjectId && cohortKey(c, dimension, p, data) === key);
  const peers: CompanyAnalysis[] = [];
  const ineligible: Benchmark["ineligible"] = [];
  for (const c of candidates) {
    const a = analyzeCompany(c.id, p, data);
    if (a.current.status !== "complete") ineligible.push({ company: c, reason: a.current.status === "missing" ? "No data for period" : "Partial period" });
    else peers.push(a);
  }
  const warnings: string[] = [];
  if (peers.length === 0) warnings.push("No eligible peers for this cohort definition — benchmark unavailable.");
  else if (peers.length < MIN_COHORT) warnings.push(`Only ${peers.length} eligible peer${peers.length === 1 ? "" : "s"} — too small for a meaningful benchmark. Treat as a direct comparison, not a norm.`);
  else if (peers.length < CAUTION_COHORT) warnings.push(`Small cohort (n = ${peers.length}). Medians can move materially with one company — interpret with caution.`);
  const sectors = new Set(peers.map((x) => x.company.sector).concat(subjectCo.sector));
  if (sectors.size > 1) warnings.push("Cohort mixes software and services businesses — cost ratios (labor intensity, gross margin) are structurally different and not directly comparable.");
  const models = new Set(peers.map((x) => x.company.businessModel).concat(subjectCo.businessModel));
  if (sectors.size === 1 && models.size > 2) warnings.push("Cohort spans several business models — consider narrowing to business model for cost ratios.");
  const revs = peers.map((x) => x.current.metrics.revenue).filter((x): x is number => x !== null);
  if (revs.length >= 2 && Math.max(...revs) / Math.min(...revs) > 8) warnings.push("Peers differ in scale by more than 8× — prefer normalized ratios over absolute amounts.");
  const fund = data.funds.find((f) => f.id === subjectCo.fund)!.shortName;
  const rule =
    dimension === "portfolio"
      ? "All portfolio companies in the current filter, excluding the subject company."
      : `${DIMENSION_LABELS[dimension]} = ${key}${dimension === "fund" ? ` (${fund})` : ""}, within the current global filters, excluding the subject company. Only companies with complete data for ${p.label} are eligible.`;
  return { subject, dimension, cohortLabel: key, peers, ineligible, warnings, meaningful: peers.length >= MIN_COHORT, rule };
}

export interface MetricBenchmark {
  key: string;
  subject: N;
  stats: CohortStats;
  deltaVsMedian: N;
  percentile: N;
}

export function benchmarkMetric(b: Benchmark, key: string, get: (a: CompanyAnalysis) => N): MetricBenchmark {
  const values = b.peers.map(get);
  const stats = statsOf(values);
  const subject = get(b.subject);
  return {
    key,
    subject,
    stats,
    deltaVsMedian: subject !== null && stats.median !== null ? subject - stats.median : null,
    percentile: percentRank(values, subject),
  };
}

export { resolvePeriod };
