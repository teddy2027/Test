"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { EMPTY_FILTERS, type Filters } from "../engine/filters";
import { DEFAULT_SELECTION, type ComparisonBasis, type PeriodSelection } from "../engine/periods";
import type { AggregationMode } from "../engine/portfolio";
import type { Answer } from "../query/answer";
import type { ParsedQuery } from "../query/parser";
import { useWorkspace } from "../workspace/store";

export interface ChatTurn {
  id: string;
  question: string;
  parsed: ParsedQuery | null;
  answer: Answer | null;
  pending: boolean;
  context: string;
}

interface AppState {
  /** True once session state has been restored from storage (avoids rendering stale defaults after a reload). */
  hydrated: boolean;
  filters: Filters;
  selection: PeriodSelection;
  basis: ComparisonBasis;
  aggregation: AggregationMode;
  watchlist: string[];
  chat: ChatTurn[];
  methodologyOpen: boolean;
  watchlistOpen: boolean;
  setFilters: (f: Partial<Filters>) => void;
  resetFilters: () => void;
  setSelection: (s: Partial<PeriodSelection>) => void;
  setBasis: (b: ComparisonBasis) => void;
  setAggregation: (a: AggregationMode) => void;
  toggleWatch: (id: string) => void;
  pushTurn: (t: ChatTurn) => void;
  updateTurn: (id: string, patch: Partial<ChatTurn>) => void;
  clearChat: () => void;
  setMethodologyOpen: (v: boolean) => void;
  setWatchlistOpen: (v: boolean) => void;
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      hydrated: false,
      filters: EMPTY_FILTERS,
      selection: DEFAULT_SELECTION,
      basis: "yoy",
      aggregation: "aggregate",
      watchlist: ["meridian-services", "crestpoint-consulting"],
      chat: [],
      methodologyOpen: false,
      watchlistOpen: false,
      setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
      resetFilters: () => set({ filters: EMPTY_FILTERS, selection: DEFAULT_SELECTION, basis: "yoy" }),
      setSelection: (sel) =>
        set((s) => {
          const next = { ...s.selection, ...sel };
          // "Prior period" is only distinct from YoY for quarter/TTM periods.
          const basis = (next.kind === "fy" || next.kind === "ytd") && s.basis === "prior" ? "yoy" : s.basis;
          return { selection: next, basis };
        }),
      setBasis: (basis) => set({ basis }),
      setAggregation: (aggregation) => set({ aggregation }),
      toggleWatch: (id) => set((s) => ({ watchlist: s.watchlist.includes(id) ? s.watchlist.filter((x) => x !== id) : [...s.watchlist, id] })),
      pushTurn: (t) => set((s) => ({ chat: [...s.chat, t] })),
      updateTurn: (id, patch) => set((s) => ({ chat: s.chat.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      clearChat: () => set({ chat: [] }),
      setMethodologyOpen: (methodologyOpen) => set({ methodologyOpen }),
      setWatchlistOpen: (watchlistOpen) => set({ watchlistOpen }),
    }),
    {
      name: "de-portfolio-intelligence-session",
      version: 2,
      // Session state (filters, period, comparison, chat) survives reloads within a tab and resets in a new one.
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ filters: s.filters, selection: s.selection, basis: s.basis, aggregation: s.aggregation, chat: s.chat.filter((t) => !t.pending) }),
      skipHydration: true,
    },
  ),
);

const WATCH_KEY = "de-portfolio-intelligence-watchlist";

/** Hydrates session state and the (longer-lived) watchlist, then keeps the watchlist in localStorage. */
export function hydrateApp(): () => void {
  const done = () => useApp.setState({ hydrated: true });
  // Workspace first (companies, uploads, shares feed the dataset), then session state.
  const both = Promise.all([Promise.resolve(useWorkspace.persist.rehydrate()), Promise.resolve(useApp.persist.rehydrate())]);
  both.then(done, done);
  try {
    const raw = localStorage.getItem(WATCH_KEY);
    if (raw) {
      const ids = JSON.parse(raw);
      if (Array.isArray(ids)) useApp.setState({ watchlist: ids.filter((x) => typeof x === "string") });
    }
  } catch {
    /* storage unavailable: keep defaults */
  }
  return useApp.subscribe((s, prev) => {
    if (s.watchlist !== prev.watchlist) {
      try {
        localStorage.setItem(WATCH_KEY, JSON.stringify(s.watchlist));
      } catch {
        /* ignore */
      }
    }
  });
}
