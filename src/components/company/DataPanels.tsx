"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, CalendarCheck, Check, CheckCircle2, Clock, ExternalLink, FileUp, FlaskConical, Lock, Mail, Plug, Rocket, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { getData } from "@/lib/data";
import { monthLabel } from "@/lib/data/calendar";
import type { Company } from "@/lib/data/types";
import { analyzeCompany } from "@/lib/engine/company";
import { makePeriod } from "@/lib/engine/periods";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  DUALENTRY_STAGES,
  EFFORT,
  effortSummary,
  emptyMigration,
  LINK_VALID_DAYS,
  linkExpiry,
  newToken,
  packEvents,
  repById,
  routeRep,
  STAGE_LABEL,
  STAGE_ORDER,
  talkingPoints,
  WHAT_CHANGES,
} from "@/lib/workspace/migration";
import { useWorkspace } from "@/lib/workspace/store";
import type { MigrationStage } from "@/lib/workspace/types";
import { Badge, Button, CardHeader, Dialog, Tip } from "../ui/primitives";

// ---------------------------------------------------------------- uploads

/** The upload dialog is owned by the page so it survives the layout switch when a first upload lands. */
export function UploadsPanel({ company, onUpload }: { company: Company; onUpload: () => void }) {
  const submissions = useWorkspace((s) => s.submissions);
  const data = getData();
  const effort = effortSummary(data, submissions, company.id);
  const events = packEvents(data, submissions).filter((e) => e.companyId === company.id);
  const months = [...new Set(events.map((e) => e.month))].sort((a, b) => b - a);
  const mine = submissions.filter((s) => s.companyId === company.id);
  return (
    <div className="rounded-lg border border-line bg-surface shadow-card" data-testid="uploads-panel">
      <CardHeader
        title="Monthly uploads"
        description={`Northbridge uploads ${company.name}'s pack from ${company.accountingSystem} each month`}
        actions={
          <Button variant="primary" size="sm" onClick={onUpload} data-testid="open-upload">
            <FileUp className="h-3.5 w-3.5" /> Upload monthly figures
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-4">
        {[
          ["Data through", company.lastReportedMonth >= 0 ? monthLabel(company.lastReportedMonth) : "No data yet"],
          ["Arrives", effort.avgDaysUpload !== null ? `~${Math.round(effort.avgDaysUpload)} business days after month-end` : "—"],
          ["Sponsor effort", `~${(effort.packs ? effort.hoursPerMonth : EFFORT.hoursPerPack).toFixed(1)} h / month (est.)`],
          ["Re-uploads", `${effort.reuploads} in last ${EFFORT.windowMonths} months`],
        ].map(([k, v]) => (
          <div key={k} className="bg-surface px-4 py-2.5">
            <div className="text-[11px] text-muted">{k}</div>
            <div className="text-sm font-medium text-ink">{v}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Upload history</div>
          {months.length === 0 ? (
            <p className="text-sm text-muted">No packs uploaded yet. Download the template from “Upload monthly figures”.</p>
          ) : (
            <table className="w-full text-sm" data-testid="upload-history">
              <tbody>
                {months.slice(0, 6).map((m) => {
                  const evs = events.filter((e) => e.month === m);
                  const sub = mine.filter((s) => s.months.includes(m)).slice(-1)[0];
                  return (
                    <tr key={m} className="border-b border-line/60 last:border-0">
                      <td className="py-1.5 text-ink">{monthLabel(m)}</td>
                      <td className="py-1.5 text-muted">day {evs[0].businessDaysAfterMonthEnd} after month-end</td>
                      <td className="py-1.5 text-right">
                        {evs.length > 1 ? <Badge tone="info">v{evs.length} · re-uploaded</Badge> : <Badge tone="neutral">v1</Badge>}
                        {sub && (
                          <Tip content={`${sub.fileName} · ${formatDateTime(sub.uploadedAt)} · ${sub.uploadedBy}${sub.restatementReason ? ` · Reason: ${sub.restatementReason}` : ""}`}>
                            <span className="ml-1 cursor-help text-[11px] text-brand">this session</span>
                          </Tip>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-[11px] text-muted">
            Effort estimate: {EFFORT.hoursPerPack} h per monthly pack (collect, key into the template, validate, resolve queries) + {EFFORT.hoursPerReupload} h per re-upload.
          </p>
        </div>
        <div className="rounded-md border border-line bg-subtle/60 p-3" data-testid="upload-limits">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">What an upload can and can&apos;t deliver</div>
          <ul className="space-y-1 text-sm">
            {[
              [true, "Consolidated monthly P&L, cash flow and headcount, validated on every upload"],
              [true, "Version history and restatements with reasons"],
              [false, "Same-day figures — data arrives when the pack is sent and uploaded"],
              [false, "Entity-level books and intercompany eliminations"],
              [false, "Account-level drill-down"],
              [false, "Organic vs acquired growth when an acquisition distorts the comparison"],
              [false, "Zero monthly effort — someone prepares and uploads the pack"],
            ].map(([ok, t]) => (
              <li key={t as string} className="flex gap-2">
                {ok ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pos" /> : <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />}
                <span className={ok ? "text-ink-2" : "text-muted"}>{t}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted">These are limits of a file, not of this workspace. A DualEntry ledger share removes them.</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- explore DualEntry

const TRACK: MigrationStage[] = ["introduced", "call_booked", "call_held", "evaluating", "migrating", "connected"];
const fmtSlot = (slot: string) => new Date(`${slot}:00Z`).toLocaleString("en-US", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

function StageTrack({ stage, sandbox }: { stage: MigrationStage; sandbox: boolean }) {
  const idx = STAGE_ORDER.indexOf(stage);
  return (
    <ol className="flex flex-wrap items-center gap-1 text-[11px]" aria-label="Migration stage">
      {TRACK.map((s, i) => {
        const done = stage !== "declined" && STAGE_ORDER.indexOf(s) <= idx;
        const current = s === stage;
        return (
          <li key={s} className="flex items-center gap-1">
            <span className={cn("rounded-full px-2 py-0.5", current ? "bg-brand text-white" : done ? "bg-brand-soft text-brand-ink" : "bg-subtle text-faint")}>{STAGE_LABEL[s]}</span>
            {i < TRACK.length - 1 && <span className="text-faint">›</span>}
          </li>
        );
      })}
      {sandbox && <Badge tone="brand">Sandbox opened</Badge>}
      {stage === "declined" && <Badge tone="neutral">CFO: not now</Badge>}
    </ol>
  );
}

export function ExplorePanel({ company }: { company: Company }) {
  const ws = useWorkspace();
  const m = ws.migration[company.id] ?? emptyMigration(company.id);
  const data = getData();
  const [invite, setInvite] = useState(false);
  const ttm = useMemo(() => analyzeCompany(company.id, makePeriod("ttm", 21, 32)).current.metrics.revenue, [company.id]);
  const a = analyzeCompany(company.id, makePeriod("quarter", 30, 32));
  const points = talkingPoints(company, data, ws, a.yoy ? { reported: a.yoy.revenueGrowth, affected: a.yoy.acquisitions.length > 0 } : null);
  const rep = repById(m.repId);
  const linkPath = m.token ? `/invite/${m.token}` : null;

  return (
    <div className="rounded-lg border border-line bg-surface shadow-card" data-testid="explore-panel" id="explore">
      <CardHeader
        title={
          <span className="flex items-center gap-1.5">
            <Rocket className="h-4 w-4 text-brand" /> Explore DualEntry
          </span>
        }
        description={
          m.stage === "not_started"
            ? `Send ${company.financeLead.name} an invite from here: one link to book a demo with the right DualEntry rep and to try a sandbox. Northbridge sees progress only.`
            : `Invite sent to ${company.financeLead.name}. Progress updates here as the CFO books a demo, opens the sandbox and moves forward with DualEntry.`
        }
        actions={<Badge tone={m.stage === "not_started" || m.stage === "declined" ? "neutral" : "brand"}>{STAGE_LABEL[m.stage]}</Badge>}
      />
      <div className="space-y-4 p-4">
        {m.stage !== "not_started" && <StageTrack stage={m.stage} sandbox={!!m.sandbox} />}

        {m.stage === "not_started" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Why it&apos;s worth it for {company.name}</div>
              <ul className="space-y-1.5 text-sm" data-testid="talking-points">
                {points.map((p) => (
                  <li key={p.label}>
                    <span className="font-medium text-ink">{p.label}:</span> <span className="text-ink-2">{p.detail}</span>
                  </li>
                ))}
              </ul>
              <div className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-muted">What would change on DualEntry</div>
              <ul className="space-y-1 text-sm text-ink-2">
                {WHAT_CHANGES.map((w) => (
                  <li key={w} className="flex gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pos" /> {w}
                  </li>
                ))}
              </ul>
              <p className="mt-2 flex items-center gap-1 text-[11px] text-muted">
                <Lock className="h-3 w-3" /> Built from data Northbridge already has. None of it goes into the invite or to DualEntry.
              </p>
            </div>
            <div className="rounded-md border border-line bg-subtle/50 p-4">
              <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Mail className="h-4 w-4 text-muted" /> Invite {company.financeLead.name}
              </div>
              <p className="mb-3 text-sm text-ink-2">
                Portfolio Intelligence emails {company.financeLead.name.split(" ")[0]} in your name, copying the DualEntry rep. The email carries one unique link where they can:
              </p>
              <ul className="mb-4 space-y-1.5 text-sm text-ink-2">
                <li className="flex gap-2">
                  <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" /> <span><span className="font-medium text-ink">Book a demo</span> on the right rep&apos;s calendar</span>
                </li>
                <li className="flex gap-2">
                  <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-brand" /> <span><span className="font-medium text-ink">Open a sandbox</span>: DualEntry with sample data, to try on their own</span>
                </li>
              </ul>
              <Button variant="primary" onClick={() => setInvite(true)} data-testid="send-invite">
                <Mail className="h-3.5 w-3.5" /> Send DualEntry invite
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2 text-sm">
              {rep && (
                <div className="flex items-center gap-2 rounded-md border border-line p-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-ink">
                    {rep.name.split(" ").map((x) => x[0]).join("")}
                  </span>
                  <span>
                    <span className="block font-medium text-ink">{rep.name}</span>
                    <span className="block text-xs text-muted">{rep.title} · fictional</span>
                  </span>
                </div>
              )}
              <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 rounded-md border border-line p-2.5">
                <dt className="text-muted">Invite</dt>
                <dd className="text-ink-2">Sent {formatDate(m.introducedAt!)} to {company.financeLead.email}</dd>
                <dt className="text-muted">Demo</dt>
                <dd data-testid="booking-status" className={m.booking ? "font-medium text-pos" : "text-muted"}>
                  {m.booking ? `${fmtSlot(m.booking.slot)} · booked by ${m.booking.name}` : "Not booked yet"}
                </dd>
                <dt className="text-muted">Sandbox</dt>
                <dd data-testid="sandbox-status" className={m.sandbox ? "font-medium text-pos" : "text-muted"}>
                  {m.sandbox ? `Opened ${formatDate(m.sandbox.at)} by ${m.sandbox.name}` : "Not opened yet"}
                </dd>
              </dl>
              {linkPath && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span>Link valid until {formatDate(linkExpiry(m.introducedAt!))}.</span>
                  <Link href={linkPath} className="inline-flex items-center gap-1 font-medium text-brand hover:underline" data-testid="invite-link">
                    Open the CFO&apos;s view (simulated) <ExternalLink className="h-3 w-3" />
                  </Link>
                  {!["connected", "migrating"].includes(m.stage) && (
                    <button className="font-medium text-brand hover:underline" onClick={() => setInvite(true)} data-testid="resend-invite">
                      Resend invite
                    </button>
                  )}
                </div>
              )}
              <p className="text-[11px] text-muted">Northbridge sees these milestones only — never the content of the CFO&apos;s conversations with DualEntry or what they do in the sandbox.</p>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Timeline</div>
              <ol className="space-y-1.5 border-l border-line pl-3 text-sm" data-testid="migration-timeline">
                {[...m.history].reverse().map((h, i) => (
                  <li key={i}>
                    <span className="text-ink-2">{h.label}</span>
                    <span className="ml-1 text-[11px] text-faint">
                      · {formatDate(h.at)} · {h.by === "sponsor" ? "Northbridge" : h.by === "cfo" ? "CFO" : "DualEntry"}
                    </span>
                  </li>
                ))}
              </ol>
              {!["connected", "declined"].includes(m.stage) && (
                <div className="mt-3 rounded-md border border-dashed border-line-strong p-2.5 text-xs">
                  <div className="mb-1.5 font-medium text-ink-2">Demo control — in production these updates arrive from DualEntry</div>
                  <div className="flex flex-wrap gap-1.5">
                    {DUALENTRY_STAGES.filter((s) => STAGE_ORDER.indexOf(s) > STAGE_ORDER.indexOf(m.stage)).map((s) => (
                      <Button key={s} size="xs" onClick={() => ws.advance(company.id, s)} data-testid={`advance-${s}`}>
                        {STAGE_LABEL[s]}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {m.stage === "connected" && <MigratedShareCta company={company} />}
      </div>
      {invite && <InviteDialog company={company} ttm={ttm} resend={m.token !== null} onClose={() => setInvite(false)} />}
    </div>
  );
}

function MigratedShareCta({ company }: { company: Company }) {
  const req = useWorkspace((s) => s.requests.filter((r) => r.companyId === company.id).slice(-1)[0]);
  const requestShare = useWorkspace((s) => s.requestShare);
  if (req?.status === "approved") return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-brand/30 bg-brand-soft/40 px-3 py-2.5 text-sm" data-testid="migrated-cta">
      <span className="text-ink-2">
        <span className="font-medium text-ink">{company.name} now runs on DualEntry.</span> Send a data-sharing request so figures publish automatically at each close — the company approves the scope.
      </span>
      {req?.status === "pending" ? (
        <Link href={`/approve/${req.token}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
          Awaiting approval — open the company&apos;s view (simulated) <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : (
        <Button variant="primary" size="sm" onClick={() => requestShare(company.id)} data-testid="request-share">
          <Plug className="h-3.5 w-3.5" /> Send data-sharing request
        </Button>
      )}
    </div>
  );
}

function InviteDialog({ company, ttm, resend, onClose }: { company: Company; ttm: number | null; resend: boolean; onClose: () => void }) {
  const sendInvite = useWorkspace((s) => s.sendInvite);
  const [token] = useState(() => newToken());
  const { rep, reason } = routeRep(company, ttm);
  const first = company.financeLead.name.split(" ")[0];
  const repFirst = rep.name.split(" ")[0];
  const [subject, setSubject] = useState(`${company.name}: explore DualEntry — book a demo or try the sandbox`);
  const [note, setNote] = useState(
    `Hi ${first},\n\nFollowing our conversation, here's the DualEntry link. ${repFirst} (copied) works with Northbridge's portfolio companies. From our side the appeal is a faster close${company.entityCount > 1 ? `, your ${company.entityCount} entities in one ledger` : ""} and no more monthly packs to send us — figures would publish to Northbridge at each close, within the scope you approve.\n\nBest,\nAlex`,
  );
  const [sent, setSent] = useState(false);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={`${resend ? "Resend" : "Send"} DualEntry invite to ${company.financeLead.name}`} description="Sent from Portfolio Intelligence in your name. Edit your note; the links are added automatically." className="w-[min(760px,calc(100vw-32px))]">
      {sent ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center" data-testid="invite-sent">
          <CheckCircle2 className="h-9 w-9 text-pos" />
          <p className="font-semibold text-ink">Invite sent to {company.financeLead.name}</p>
          <p className="max-w-md text-sm text-muted">
            {rep.name} is copied. You&apos;ll see here when {first} books a demo or opens the sandbox. (Prototype: no email actually leaves the app — use “Open the CFO&apos;s view” to play the CFO.)
          </p>
          <Button variant="primary" className="mt-2" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <div className="space-y-4" data-testid="invite-dialog">
          <div className="flex items-center gap-3 rounded-md border border-line p-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-ink">{rep.name.split(" ").map((x) => x[0]).join("")}</span>
            <div className="text-sm">
              <div className="font-medium text-ink">
                {rep.name} <span className="font-normal text-muted">· {rep.title} (fictional)</span>
              </div>
              <div className="text-xs text-muted">Routing: {reason}</div>
            </div>
          </div>
          <dl className="grid grid-cols-[70px_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted">From</dt>
            <dd className="text-ink">Alex Morgan, Northbridge Equity Partners <span className="text-muted">via Portfolio Intelligence · replies go to alex.morgan@northbridge.example</span></dd>
            <dt className="text-muted">To</dt>
            <dd className="text-ink">
              {company.financeLead.name} &lt;{company.financeLead.email}&gt;
            </dd>
            <dt className="text-muted">Cc</dt>
            <dd className="text-ink">
              {rep.name} &lt;{rep.email}&gt;
            </dd>
            <dt className="pt-1.5 text-muted">Subject</dt>
            <dd>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-8 w-full rounded-md border border-line-strong px-2.5 text-sm focus:outline-none" />
            </dd>
          </dl>
          <div className="overflow-hidden rounded-md border border-line-strong">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={9} aria-label="Your note" className="block w-full border-0 p-3 text-sm leading-relaxed focus:outline-none" data-testid="invite-note" />
            <div className="border-t border-line bg-subtle/60 p-3 text-sm" data-testid="invite-preview">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Added automatically</div>
              <div className="rounded-md border border-line bg-surface p-3">
                <div className="font-medium text-ink">Explore DualEntry for {company.name}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white">
                    <CalendarCheck className="h-3.5 w-3.5" /> Book a demo with {repFirst}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-ink">
                    <FlaskConical className="h-3.5 w-3.5" /> Open a sandbox
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-muted">Both open one link unique to {company.name}, valid {LINK_VALID_DAYS} days. The sandbox uses sample data — none of {company.name}&apos;s figures.</p>
              </div>
            </div>
          </div>
          <div className="flex items-start gap-1.5 text-xs text-muted">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> The link carries only a random code. The page shows the company name, Northbridge as the introducer and {repFirst}&apos;s calendar — no financial data.
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              data-testid="send-invite-confirm"
              disabled={!subject.trim()}
              onClick={() => {
                sendInvite(company.id, rep.id, token, rep.name);
                setSent(true);
              }}
            >
              <Mail className="h-3.5 w-3.5" /> Send invite
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------- DualEntry data share

export function SharePanel({ company }: { company: Company }) {
  const req = useWorkspace((s) => s.requests.filter((r) => r.companyId === company.id).slice(-1)[0]);
  const scope = req?.status === "approved" ? req.scope : null;
  const rows: [string, string][] = scope
    ? [
        ["Detail", scope.granularity === "summary" ? "Summary P&L" : scope.granularity === "detailed" ? "Detailed lines" : "Detailed lines + entity-level books"],
        ["Entities", scope.granularity === "entity" ? `${scope.entities.length} shared: ${scope.entities.join(", ")}` : "Consolidated only"],
        ["Statements", ["P&L", scope.cashFlow ? "cash flow" : null, scope.budget ? "budget" : null].filter(Boolean).join(", ")],
        ["Timing", scope.timing === "closed" ? "Closed months only" : "Closed months + preliminary figures (labelled)"],
        ["Hidden accounts", scope.hiddenAccounts.length ? scope.hiddenAccounts.join(", ") : "None"],
        ["Visible to", scope.audience.join(", ")],
        ["Approved by", `${scope.approvedBy}${scope.secondApprover ? ` and ${scope.secondApprover}` : ""} · ${formatDate(scope.approvedAt)}`],
      ]
    : [
        ["Detail", "Detailed lines + entity-level books"],
        ["Timing", "Closed months only"],
        ["Visible to", "Operating partners, Fund finance"],
        ["Approved by", `${company.financeLead.name} (${company.financeLead.title})`],
      ];
  return (
    <div className="rounded-lg border border-line bg-surface shadow-card" data-testid="share-panel">
      <CardHeader title="DualEntry data share" description="Set by the company in DualEntry · read-only for Northbridge" />
      <div className="p-4">
        {req?.status === "pending" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-info/30 bg-info-soft px-3 py-2.5 text-sm" data-testid="share-pending">
            <span className="flex items-center gap-1.5 text-ink-2">
              <Clock className="h-4 w-4 text-info" /> Request sent to {company.financeLead.name} on {formatDate(req.requestedAt)} — awaiting approval in DualEntry.
            </span>
            <Link href={`/approve/${req.token}`} className="inline-flex items-center gap-1 font-medium text-brand hover:underline" data-testid="open-approval">
              Open the company&apos;s approval screen (simulated) <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : req?.status === "declined" ? (
          <p className="text-sm text-muted">The company declined the request on {formatDate(req.decidedAt!)}.</p>
        ) : (
          <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-1.5 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="text-ink-2">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="mt-3 text-[11px] text-muted">The company can narrow or pause the share at any time; Northbridge is notified. Data is never shared with DualEntry sales.</p>
      </div>
    </div>
  );
}
