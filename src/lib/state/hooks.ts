"use client";
import { useMemo } from "react";
import { getData } from "../data";
import { applyFilters } from "../engine/filters";
import { resolvePeriod } from "../engine/periods";
import { portfolioSummary } from "../engine/portfolio";
import { useApp } from "./store";
import { useDataVersion } from "../workspace/store";

/** Filtered company universe + resolved period shared by every view. */
export function useScope() {
  const filters = useApp((s) => s.filters);
  const selection = useApp((s) => s.selection);
  const basis = useApp((s) => s.basis);
  // Re-derive when the workspace (added companies, uploads, data shares) changes the dataset.
  const rev = useDataVersion();
  return useMemo(() => {
    const data = getData();
    const companies = applyFilters(data.companies, filters);
    const period = resolvePeriod(selection);
    return { data, companies, period, basis, filters, selection, rev };
  }, [filters, selection, basis, rev]);
}

export function usePortfolio() {
  const scope = useScope();
  const summary = useMemo(() => portfolioSummary(scope.companies.map((c) => c.id), scope.period, scope.data), [scope.companies, scope.period, scope.data]);
  return { ...scope, summary };
}
