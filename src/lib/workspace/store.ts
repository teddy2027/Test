"use client";
/**
 * Client store for the sponsor's workspace, saved in localStorage ("in your browser only").
 * Every change updates the shared dataset (setWorkspace) before React re-renders.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEMO_TODAY } from "../data/calendar";
import { setWorkspace } from "../data";
import type { Company } from "../data/types";
import type { UploadResult } from "./csv";
import { defaultMigration, demoNow, emptyMigration, newToken } from "./migration";
import { companyIdFor } from "./synth";
import type { DiscussionOutcome, MigrationStage, NewCompanyInput, ShareScope, Workspace } from "./types";

const USER = "Alex Morgan";

interface WorkspaceState extends Workspace {
  rev: number;
  addCompany: (input: NewCompanyInput, takenIds: string[]) => string;
  acceptUpload: (companyId: string, fileName: string, result: UploadResult, reason: string | null) => void;
  setOutcome: (companyId: string, outcome: DiscussionOutcome, note: string) => void;
  introduce: (companyId: string, repId: string, token: string) => void;
  bookCall: (token: string, slot: string, name: string, email: string) => void;
  cfoResponse: (token: string, response: "not_now" | "info") => void;
  advance: (companyId: string, stage: MigrationStage) => void;
  requestShare: (companyId: string) => string;
  decideShare: (token: string, decision: "approved" | "declined", scope: ShareScope | null) => void;
  reset: () => void;
}

const initial = (): Workspace => ({ companies: [], submissions: [], requests: [], migration: defaultMigration() });

function pick(s: WorkspaceState): Workspace {
  return { companies: s.companies, submissions: s.submissions, requests: s.requests, migration: s.migration };
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => {
      /** Applies a change: update the dataset first, then state (so re-renders see the new data). */
      const commit = (fn: (ws: Workspace) => Workspace) => {
        const next = fn(pick(get()));
        setWorkspace(next);
        set({ ...next, rev: get().rev + 1 });
      };
      const mig = (ws: Workspace, id: string) => ws.migration[id] ?? emptyMigration(id);
      const byToken = (ws: Workspace, token: string) => Object.values(ws.migration).find((m) => m.token === token);
      return {
        ...initial(),
        rev: 0,
        addCompany: (input, takenIds) => {
          const id = companyIdFor(input.name, new Set([...takenIds, ...get().companies.map((c) => c.company.id)]));
          const now = demoNow();
          const company: Company = {
            id,
            name: input.name.trim(),
            fund: input.fund,
            sector: input.sector,
            subsector: input.subsector.trim() || input.sector,
            businessModel: input.businessModel,
            description: `${input.subsector.trim() || input.businessModel} company added by Northbridge on ${DEMO_TODAY}.`,
            headquarters: input.headquarters.trim() || "—",
            geography: input.geography,
            investmentDate: input.investmentDate,
            vintage: Number(input.investmentDate.slice(0, 4)),
            ownership: input.ownershipPct >= 50 ? "Majority" : "Minority",
            ownershipPct: input.ownershipPct,
            baseCurrency: "USD",
            fiscalYearEnd: input.fiscalYearEnd,
            accountingSystem: input.onDualEntry ? "DualEntry" : input.accountingSystem.trim() || "Not specified",
            connection: input.onDualEntry ? "dualentry" : "upload",
            entityCount: input.entityCount,
            dataSource: input.onDualEntry ? "DualEntry ledger · live sync (authorized)" : `${input.accountingSystem.trim() || "Company"} pack · uploaded by Northbridge`,
            lastUpdated: now,
            lastReportedMonth: -1,
            dataQuality: input.onDualEntry ? "High" : "Medium",
            hasArr: false,
            financeLead: { name: input.cfoName.trim(), title: input.cfoTitle.trim() || "CFO", email: input.cfoEmail.trim() },
            definitionNotes: [],
            missingFields: input.onDualEntry ? [] : ["Entity-level P&L", "Balance sheet detail (AR, deferred revenue, AP)", "Working-capital bridge", "Budget (not part of the upload template in this prototype)"],
            closeDays: input.onDualEntry ? 5 : null,
            userAdded: true,
          };
          commit((ws) => ({
            ...ws,
            companies: [...ws.companies, { company, input, addedAt: now }],
            requests: input.onDualEntry ? [...ws.requests, { companyId: id, token: newToken(), requestedAt: now, requestedBy: USER, status: "pending", scope: null, decidedAt: null }] : ws.requests,
          }));
          return id;
        },
        acceptUpload: (companyId, fileName, result, reason) =>
          commit((ws) => ({
            ...ws,
            submissions: [
              ...ws.submissions,
              {
                id: newToken(),
                companyId,
                fileName,
                uploadedAt: demoNow(),
                uploadedBy: USER,
                months: result.months.map((m) => m.month),
                rows: result.months.map((m) => m.record),
                operational: result.months.map((m) => ({ month: m.month, employees: m.employees, arr: m.arr })),
                restatedMonths: result.restatedMonths,
                restatementReason: reason,
                warnings: result.warnings.length,
              },
            ],
          })),
        setOutcome: (companyId, outcome, note) =>
          commit((ws) => {
            const m = mig(ws, companyId);
            const label = { interested: "interested", wants_info: "wants more information", not_now: "not now" }[outcome];
            return {
              ...ws,
              migration: {
                ...ws.migration,
                [companyId]: { ...m, stage: "discussed", outcome, history: [...m.history, { at: demoNow(), stage: "discussed", label: `Discussed with CFO — ${label}${note ? ` (${note})` : ""}`, by: "sponsor" }] },
              },
            };
          }),
        introduce: (companyId, repId, token) =>
          commit((ws) => {
            const m = mig(ws, companyId);
            const at = demoNow();
            return {
              ...ws,
              migration: { ...ws.migration, [companyId]: { ...m, stage: "introduced", repId, token, introducedAt: at, history: [...m.history, { at, stage: "introduced", label: "Introduction email sent", by: "sponsor" }] } },
            };
          }),
        bookCall: (token, slot, name, email) =>
          commit((ws) => {
            const m = byToken(ws, token);
            if (!m) return ws;
            const when = new Date(`${slot}:00Z`).toLocaleString("en-US", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
            return {
              ...ws,
              migration: {
                ...ws.migration,
                [m.companyId]: { ...m, stage: m.stage === "introduced" || m.stage === "call_booked" ? "call_booked" : m.stage, booking: { slot, name, email }, history: [...m.history, { at: demoNow(), stage: "call_booked", label: `${m.booking ? "Intro call rescheduled" : "Intro call booked"} for ${when}`, by: "cfo" }] },
              },
            };
          }),
        cfoResponse: (token, response) =>
          commit((ws) => {
            const m = byToken(ws, token);
            if (!m) return ws;
            const stage: MigrationStage = response === "not_now" ? "declined" : m.stage;
            return {
              ...ws,
              migration: { ...ws.migration, [m.companyId]: { ...m, stage, history: [...m.history, { at: demoNow(), stage, label: response === "not_now" ? "CFO chose “Not now” on the booking page" : "CFO asked DualEntry for more information", by: "cfo" }] } },
            };
          }),
        advance: (companyId, stage) =>
          commit((ws) => {
            const m = mig(ws, companyId);
            const labels: Partial<Record<MigrationStage, string>> = { call_held: "Intro call held", evaluating: "Evaluating DualEntry", migrating: "Migration to DualEntry started", connected: "Running on DualEntry", declined: "Decided not to proceed" };
            return { ...ws, migration: { ...ws.migration, [companyId]: { ...m, stage, history: [...m.history, { at: demoNow(), stage, label: labels[stage] ?? stage, by: "dualentry" }] } } };
          }),
        requestShare: (companyId) => {
          const token = newToken();
          commit((ws) => ({ ...ws, requests: [...ws.requests.filter((r) => !(r.companyId === companyId && r.status !== "approved")), { companyId, token, requestedAt: demoNow(), requestedBy: USER, status: "pending", scope: null, decidedAt: null }] }));
          return token;
        },
        decideShare: (token, decision, scope) =>
          commit((ws) => ({ ...ws, requests: ws.requests.map((r) => (r.token === token ? { ...r, status: decision, scope, decidedAt: demoNow() } : r)) })),
        reset: () => commit(() => initial()),
      };
    },
    {
      name: "de-portfolio-intelligence-workspace",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => pick(s),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        if (state) setWorkspace(pick(state));
      },
    },
  ),
);

/** Subscribe a component to dataset changes caused by the workspace. */
export function useDataVersion(): number {
  return useWorkspace((s) => s.rev);
}

