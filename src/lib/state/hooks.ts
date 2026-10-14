"use client";
import { useMemo } from "react";
import { getData } from "../data";
import { applyFilters } from "../engine/filters";
import { resolvePeriod } from "../engine/periods";
import { portfolioSummary } from "../engine/portfolio";
import { useApp } from "./store";

/** Filtered company universe + resolved period shared by every view. */
export function useScope() {
  const filters = useApp((s) => s.filters);
  const selection = useApp((s) => s.selection);
  const basis = useApp((s) => s.basis);
  return useMemo(() => {
    const data = getData();
    const companies = applyFilters(data.companies, filters);
    const period = resolvePeriod(selection);
    return { data, companies, period, basis, filters, selection };
  }, [filters, selection, basis]);
}

export function usePortfolio() {
  const scope = useScope();
  const summary = useMemo(() => portfolioSummary(scope.companies.map((c) => c.id), scope.period), [scope.companies, scope.period]);
  return { ...scope, summary };
}
