/**
 * "Explore DualEntry" pipeline for companies that report by upload: stages, representative routing,
 * conversation talking points (from facts the sponsor already has) and the visible cost of manual reporting.
 * All people are fictional.
 */
import { DEMO_TODAY, LAST_MONTH } from "../data/calendar";
import { makeNoise } from "../data/rng";
import type { IndexedDataset } from "../data";
import type { Company } from "../data/types";
import { COMPANY_SEEDS } from "../data/seed";
import type { MigrationStage, MigrationState, Submission, Workspace } from "./types";

export const STAGE_ORDER: MigrationStage[] = ["not_started", "introduced", "call_booked", "call_held", "evaluating", "migrating", "connected"];

export const STAGE_LABEL: Record<MigrationStage, string> = {
  not_started: "Not started",
  introduced: "Invite sent",
  call_booked: "Demo booked",
  call_held: "Demo held",
  evaluating: "Evaluating",
  migrating: "Migrating",
  connected: "On DualEntry",
  declined: "Not now",
};

/** Stages that only DualEntry can report (simulated in the prototype). */
export const DUALENTRY_STAGES: MigrationStage[] = ["call_held", "evaluating", "migrating", "connected"];

export interface Rep {
  id: string;
  name: string;
  title: string;
  email: string;
}
export const REPS: Rep[] = [
  { id: "sarah-chen", name: "Sarah Chen", title: "Partnerships — private equity portfolios", email: "sarah.chen@dualentry.example" },
  { id: "daniel-okafor", name: "Daniel Okafor", title: "Enterprise — multi-entity finance teams", email: "daniel.okafor@dualentry.example" },
];

/** Routing rule: multi-entity or larger companies go to the enterprise team; everyone else to the sponsor's partnership owner. */
export function routeRep(company: Company, ttmRevenueUsdM: number | null): { rep: Rep; reason: string } {
  if (company.entityCount >= 4 || (ttmRevenueUsdM ?? 0) >= 100)
    return { rep: REPS[1], reason: `${company.entityCount} legal entities${ttmRevenueUsdM ? ` · ~$${ttmRevenueUsdM.toFixed(0)}M revenue` : ""} → enterprise multi-entity team` };
  return { rep: REPS[0], reason: "Owns the Northbridge Equity Partners partnership" };
}

export function repById(id: string | null): Rep | null {
  return REPS.find((r) => r.id === id) ?? null;
}

export function newToken(): string {
  const a = new Uint8Array(8);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(a);
  else for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
  return Array.from(a, (b) => (b % 36).toString(36)).join("") + Date.now().toString(36).slice(-4);
}

/** Demo clock: actions are stamped on the demo "today" so the timeline stays coherent with the Q3 2026 data. */
export function demoNow(): string {
  const t = new Date().toISOString().slice(11, 19);
  return `${DEMO_TODAY}T${t}Z`;
}

export const LINK_VALID_DAYS = 90;
export function linkExpiry(introducedAt: string): string {
  return new Date(Date.parse(introducedAt) + LINK_VALID_DAYS * 86400000).toISOString();
}

/** Bookable slots: the next five business days after the demo date. */
export function bookingSlots(): { day: string; times: string[] }[] {
  const out: { day: string; times: string[] }[] = [];
  const d = new Date(`${DEMO_TODAY}T12:00:00Z`);
  while (out.length < 5) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    out.push({ day: d.toISOString().slice(0, 10), times: ["09:30", "11:00", "14:00", "16:00"] });
  }
  return out;
}

export function emptyMigration(companyId: string): MigrationState {
  return { companyId, stage: "not_started", repId: null, token: null, introducedAt: null, booking: null, sandbox: null, history: [] };
}

/** Seeded pipeline so the portfolio summary is not empty in the demo (Meridian is left "not started" for the live walkthrough). */
export function defaultMigration(): Record<string, MigrationState> {
  const ev = (stage: MigrationStage, label: string, at: string, by: "sponsor" | "cfo" | "dualentry") => ({ stage, label, at, by });
  return {
    "harbor-operations": {
      companyId: "harbor-operations",
      stage: "call_booked",
      repId: "sarah-chen",
      token: "hb7k2m9q4xr1",
      introducedAt: "2026-10-06T15:10:00Z",
      booking: { slot: "2026-10-20T14:00", name: "Renee Albright", email: "renee.albright@harboroperations.example" },
      sandbox: { name: "Renee Albright", email: "renee.albright@harboroperations.example", at: "2026-10-06T19:40:00Z" },
      history: [
        ev("introduced", "Invite sent to the CFO · Sarah Chen copied", "2026-10-06T15:10:00Z", "sponsor"),
        ev("introduced", "Sandbox opened", "2026-10-06T19:40:00Z", "cfo"),
        ev("call_booked", "Demo booked for Tue 20 Oct, 14:00", "2026-10-07T09:12:00Z", "cfo"),
      ],
    },
    "cedar-cloud": {
      companyId: "cedar-cloud",
      stage: "evaluating",
      repId: "sarah-chen",
      token: "cd3p8w1n6zt4",
      introducedAt: "2026-09-08T14:00:00Z",
      booking: { slot: "2026-09-15T11:00", name: "Elena Sokolova", email: "elena.sokolova@cedarcloud.example" },
      sandbox: { name: "Elena Sokolova", email: "elena.sokolova@cedarcloud.example", at: "2026-09-16T08:30:00Z" },
      history: [
        ev("introduced", "Invite sent to the CFO · Sarah Chen copied", "2026-09-08T14:00:00Z", "sponsor"),
        ev("call_booked", "Demo booked for Tue 15 Sep, 11:00", "2026-09-08T18:30:00Z", "cfo"),
        ev("call_held", "Demo held", "2026-09-15T12:00:00Z", "dualentry"),
        ev("call_held", "Sandbox opened", "2026-09-16T08:30:00Z", "cfo"),
        ev("evaluating", "Evaluating DualEntry", "2026-09-29T10:00:00Z", "dualentry"),
      ],
    },
    "summit-compliance": {
      companyId: "summit-compliance",
      stage: "introduced",
      repId: "sarah-chen",
      token: "sm4q9t2b7kx8",
      introducedAt: "2026-09-25T10:20:00Z",
      booking: null,
      sandbox: null,
      history: [ev("introduced", "Invite sent to the CFO · Sarah Chen copied", "2026-09-25T10:20:00Z", "sponsor")],
    },
    "horizon-advisory": {
      companyId: "horizon-advisory",
      stage: "introduced",
      repId: "sarah-chen",
      token: "hz6w1m8c3pv5",
      introducedAt: "2026-09-22T11:00:00Z",
      booking: null,
      sandbox: { name: "Harriet Cole", email: "harriet.cole@horizonadvisory.example", at: "2026-09-24T16:05:00Z" },
      history: [
        ev("introduced", "Invite sent to the CFO · Sarah Chen copied", "2026-09-22T11:00:00Z", "sponsor"),
        ev("introduced", "Sandbox opened", "2026-09-24T16:05:00Z", "cfo"),
      ],
    },
  };
}

// ---------------------------------------------------------------- reporting effort

/** Assumptions behind the effort estimate (shown in the UI). */
export const EFFORT = { hoursPerPack: 1.5, hoursPerReupload: 0.75, windowMonths: 6 };

export interface PackEvent {
  companyId: string;
  month: number;
  businessDaysAfterMonthEnd: number;
  version: number; // 1 = original, 2+ = re-upload
  source: "history" | "upload";
}

/** Known restatements in the demo portfolio's history (month index). */
const SEEDED_REUPLOADS: Record<string, number[]> = { "meridian-services": [28, 31], "crestpoint-consulting": [30], "apex-workforce": [27] };

function businessDaysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso);
  const b = new Date(toIso);
  let n = 0;
  for (const d = new Date(a); d < b; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}
function monthEndIso(m: number): string {
  const y = 2024 + Math.floor(m / 12);
  const mo = (m % 12) + 1;
  return new Date(Date.UTC(y, mo, 1)).toISOString();
}

/** Monthly packs handled by the sponsor: deterministic history for demo companies plus uploads made in the browser. */
export function packEvents(data: IndexedDataset, submissions: Submission[]): PackEvent[] {
  const out: PackEvent[] = [];
  const from = LAST_MONTH - EFFORT.windowMonths + 1;
  for (const c of data.companies) {
    if (c.connection !== "upload" || c.userAdded) continue;
    const noise = makeNoise(`${c.id}:packs`);
    // Months covered by the demo portfolio's own history (before any upload made in this browser).
    const seededLast = COMPANY_SEEDS.find((x) => x.master.id === c.id)?.reportedThrough ?? LAST_MONTH;
    for (let m = from; m <= seededLast; m++) {
      out.push({ companyId: c.id, month: m, businessDaysAfterMonthEnd: Math.max(3, Math.round((c.closeDays ?? 12) + 2 + noise(1.2))), version: 1, source: "history" });
      if (SEEDED_REUPLOADS[c.id]?.includes(m)) out.push({ companyId: c.id, month: m, businessDaysAfterMonthEnd: Math.round((c.closeDays ?? 12) + 8), version: 2, source: "history" });
    }
  }
  for (const s of submissions) {
    for (const m of s.months) {
      if (m < from) continue;
      const prior = out.filter((e) => e.companyId === s.companyId && e.month === m).length;
      out.push({ companyId: s.companyId, month: m, businessDaysAfterMonthEnd: businessDaysBetween(monthEndIso(m), s.uploadedAt), version: prior + 1, source: "upload" });
    }
  }
  return out;
}

export interface Effort {
  uploadCompanies: number;
  packs: number;
  reuploads: number;
  hoursPerMonth: number;
  avgDaysUpload: number | null;
  avgDaysDualEntry: number | null;
}

export function effortSummary(data: IndexedDataset, submissions: Submission[], companyId?: string): Effort {
  const events = packEvents(data, submissions).filter((e) => !companyId || e.companyId === companyId);
  const packs = events.filter((e) => e.version === 1).length;
  const reuploads = events.filter((e) => e.version > 1).length;
  const firsts = events.filter((e) => e.version === 1);
  const de = data.companies.filter((c) => c.connection === "dualentry" && c.closeDays);
  return {
    uploadCompanies: companyId ? 1 : data.companies.filter((c) => c.connection === "upload").length,
    packs,
    reuploads,
    hoursPerMonth: (packs * EFFORT.hoursPerPack + reuploads * EFFORT.hoursPerReupload) / EFFORT.windowMonths,
    avgDaysUpload: firsts.length ? firsts.reduce((s, e) => s + e.businessDaysAfterMonthEnd, 0) / firsts.length : null,
    avgDaysDualEntry: de.length ? de.reduce((s, c) => s + (c.closeDays ?? 0), 0) / de.length : null,
  };
}

// ---------------------------------------------------------------- talking points

export interface TalkingPoint {
  label: string;
  detail: string;
}

/**
 * The three facts most specific to this company, for the operating partner's conversation with the CFO.
 * Ordered so company-specific pain (M&A, entities, close speed) beats generic effort points. Nothing here is shared.
 */
export function talkingPoints(company: Company, data: IndexedDataset, ws: Workspace, organic: { reported: number | null; affected: boolean } | null): TalkingPoint[] {
  const e = effortSummary(data, ws.submissions, company.id);
  const all = effortSummary(data, ws.submissions);
  const pts: TalkingPoint[] = [];
  const txs = data.transactionsByCompany.get(company.id) ?? [];
  if (txs.length)
    pts.push({
      label: "Acquisitions",
      detail: `${txs.map((t) => t.target).join(", ")}: organic growth can't be separated from uploaded consolidated figures${organic?.affected && organic.reported !== null ? ` (reported growth ${(organic.reported * 100).toFixed(1)}% includes the acquisition)` : ""}.`,
    });
  if (company.entityCount >= 2) pts.push({ label: "Multi-entity", detail: `${company.entityCount} legal entities consolidated outside the ledger; Northbridge only sees the consolidated total.` });
  if (company.closeDays && company.closeDays >= 8) pts.push({ label: "Close speed", detail: `${company.closeDays}-business-day close today; DualEntry companies in the portfolio close in ~${Math.round(all.avgDaysDualEntry ?? 5)} days.` });
  const gaps = company.missingFields.filter((f) => !/Balance sheet|Working-capital|Entity-level|Budget \(not part/.test(f));
  if (gaps.length) pts.push({ label: "Reporting gaps", detail: gaps.join("; ") + "." });
  if (e.avgDaysUpload !== null) pts.push({ label: "Timeliness", detail: `Figures reach Northbridge ~${Math.round(e.avgDaysUpload)} business days after month-end.` });
  pts.push({
    label: "Monthly reporting today",
    detail: `The pack is uploaded by hand — ~${(e.hoursPerMonth || EFFORT.hoursPerPack).toFixed(1)} h a month${e.reuploads ? `, ${e.reuploads} re-upload${e.reuploads > 1 ? "s" : ""} in the last ${EFFORT.windowMonths} months` : ""}.`,
  });
  return pts.slice(0, 3);
}

// ---------------------------------------------------------------- stalled invites

/** An invite with no demo booked and no sandbox opened after this many days is flagged as stalled. */
export const STALL_DAYS = 14;

export function daysSinceInvite(m: MigrationState): number | null {
  if (!m.introducedAt) return null;
  return Math.floor((Date.parse(`${DEMO_TODAY}T23:59:59Z`) - Date.parse(m.introducedAt)) / 86400000);
}

export function isStalled(m: MigrationState): boolean {
  const d = daysSinceInvite(m);
  return m.stage === "introduced" && !m.booking && !m.sandbox && d !== null && d >= STALL_DAYS;
}
