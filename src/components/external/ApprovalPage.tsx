"use client";
import Link from "next/link";
import { useState } from "react";
import { BadgeCheck, CheckCircle2, Eye, Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import { getData } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { demoNow } from "@/lib/workspace/migration";
import { useWorkspace } from "@/lib/workspace/store";
import { entityNamesFor } from "@/lib/workspace/synth";
import type { Granularity, ShareScope } from "@/lib/workspace/types";
import { Button } from "../ui/primitives";
import { ExternalFrame } from "./BookingPage";

const HIDDEN_DEFAULT = ["Individual payroll & compensation", "Legal settlements", "M&A advisory costs", "Owner / related-party transactions"];
const AUDIENCES = ["Operating partners", "Fund finance", "Deal team", "Portfolio ops analysts"];

function Toggle({ on, onChange, label, sub, testId }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: string; testId?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 py-1 text-sm">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-[rgb(var(--brand))]" data-testid={testId} />
      <span>
        <span className="text-ink">{label}</span>
        {sub && <span className="block text-xs text-muted">{sub}</span>}
      </span>
    </label>
  );
}

export function ApprovalPage({ token }: { token: string }) {
  const req = useWorkspace((s) => s.requests.find((r) => r.token === token));
  const decide = useWorkspace((s) => s.decideShare);
  const company = req ? getData().companyById.get(req.companyId) : undefined;
  const entityNames = company ? entityNamesFor(company) : [];
  const [confirmed, setConfirmed] = useState(false);
  const [granularity, setGranularity] = useState<Granularity>("detailed");
  const [entities, setEntities] = useState<string[]>(entityNames);
  const [cashFlow, setCashFlow] = useState(true);
  const [budget, setBudget] = useState(true);
  const [timing, setTiming] = useState<"closed" | "preliminary">("closed");
  const [hidden, setHidden] = useState<string[]>(HIDDEN_DEFAULT);
  const [audience, setAudience] = useState<string[]>(["Operating partners", "Fund finance"]);
  const [second, setSecond] = useState("");

  if (!req || !company)
    return (
      <ExternalFrame label="Settings › Data sharing">
        <div className="rounded-lg border border-line bg-surface p-8 text-center text-sm text-muted">This request was not found.</div>
      </ExternalFrame>
    );

  if (req.status !== "pending")
    return (
      <ExternalFrame label={`${company.name} · Settings › Data sharing`}>
        <div className="rounded-lg border border-line bg-surface p-8 text-center" data-testid="approval-done">
          <CheckCircle2 className={cn("mx-auto h-9 w-9", req.status === "approved" ? "text-pos" : "text-muted")} />
          <p className="mt-2 font-semibold text-ink">{req.status === "approved" ? "Sharing with Northbridge is active" : "Request declined"}</p>
          <p className="text-sm text-muted">
            {req.status === "approved" ? `Approved ${formatDate(req.decidedAt!)}. Figures publish to Northbridge at each month-end close, within the scope you set. You can narrow or pause it here at any time.` : `Declined ${formatDate(req.decidedAt!)}.`}
          </p>
          <Link href={`/companies/${company.id}`} className="mt-3 inline-block text-sm font-medium text-brand hover:underline">
            See it from Northbridge&apos;s side →
          </Link>
        </div>
      </ExternalFrame>
    );

  const needsSecond = granularity === "entity";
  const canApprove = confirmed && audience.length > 0 && (!needsSecond || second.trim().length > 1) && (granularity !== "entity" || entities.length > 0);
  const toggle = (arr: string[], v: string, set: (x: string[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const preview = [
    `Monthly ${granularity === "summary" ? "summary P&L (revenue, COGS, gross profit, opex lines, EBITDA)" : "detailed P&L incl. revenue mix and personnel cost split"}`,
    cashFlow ? "Cash flow and cash balance" : null,
    budget ? "Budget vs actual" : null,
    granularity === "entity" ? `Entity-level books for ${entities.length} of ${entityNames.length} entities` : "Consolidated figures only — no entity books",
    timing === "closed" ? "Published when you close each month" : "Preliminary figures before close (labelled) + closed months",
    hidden.length ? `Rolled up, never shown individually: ${hidden.join(", ")}` : null,
    `Visible to Northbridge: ${audience.join(", ") || "nobody"}`,
  ].filter(Boolean) as string[];

  return (
    <ExternalFrame label={`${company.name} · Settings › Data sharing`}>
      <div className="space-y-5" data-testid="approval-page">
        <div>
          <p className="text-sm text-muted">Incoming request · {formatDate(req.requestedAt)}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Share {company.name}&apos;s figures with Northbridge Equity Partners</h1>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4 text-sm">
          <div className="flex items-center gap-1.5 font-medium text-ink">
            Northbridge Equity Partners <BadgeCheck className="h-4 w-4 text-brand" /> <span className="text-xs font-normal text-muted">verified organisation · northbridge.example</span>
          </div>
          <p className="mt-1 text-ink-2">
            Requested by {req.requestedBy}, Operating Partner: monthly P&amp;L, cash flow, budget and headcount, at each close, under the information rights in your shareholders&apos; agreement. You decide what is shared; you can grant less than requested.
          </p>
          <Toggle on={confirmed} onChange={setConfirmed} label={`Northbridge Equity Partners is an investor in ${company.name}`} testId="confirm-relationship" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4 rounded-lg border border-line bg-surface p-4">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Level of detail</div>
              {(
                [
                  ["summary", "Summary P&L", "Totals only"],
                  ["detailed", "Detailed lines", "Revenue mix, personnel cost split (recommended)"],
                  ["entity", "Detailed + entity-level books", "Needs a second approver"],
                ] as [Granularity, string, string][]
              ).map(([g, t, d]) => (
                <label key={g} className="flex cursor-pointer items-start gap-2 py-1 text-sm">
                  <input type="radio" name="gran" checked={granularity === g} onChange={() => setGranularity(g)} className="mt-0.5 accent-[rgb(var(--brand))]" data-testid={`gran-${g}`} />
                  <span>
                    <span className="text-ink">{t}</span>
                    <span className="block text-xs text-muted">{d}</span>
                  </span>
                </label>
              ))}
            </div>
            {granularity === "entity" && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Entities shared</div>
                {entityNames.map((e) => (
                  <Toggle key={e} on={entities.includes(e)} onChange={() => toggle(entities, e, setEntities)} label={e} />
                ))}
              </div>
            )}
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Statements</div>
              <Toggle on label="Income statement" onChange={() => {}} sub="Always included" />
              <Toggle on={cashFlow} onChange={setCashFlow} label="Cash flow and cash balance" testId="share-cashflow" />
              <Toggle on={budget} onChange={setBudget} label="Budget" />
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Timing</div>
              {(
                [
                  ["closed", "Closed months only", "Recommended — nothing appears mid-close"],
                  ["preliminary", "Also preliminary figures", "Shown to Northbridge as preliminary"],
                ] as ["closed" | "preliminary", string, string][]
              ).map(([v, t, d]) => (
                <label key={v} className="flex cursor-pointer items-start gap-2 py-1 text-sm">
                  <input type="radio" name="timing" checked={timing === v} onChange={() => setTiming(v)} className="mt-0.5 accent-[rgb(var(--brand))]" />
                  <span>
                    <span className="text-ink">{t}</span>
                    <span className="block text-xs text-muted">{d}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-lg border border-line bg-surface p-4">
              <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
                <Lock className="h-3 w-3" /> Never shown individually
              </div>
              {HIDDEN_DEFAULT.map((h) => (
                <Toggle key={h} on={hidden.includes(h)} onChange={() => toggle(hidden, h, setHidden)} label={h} />
              ))}
              <p className="mt-1 text-xs text-muted">Rolled into their parent line in anything Northbridge sees.</p>
            </div>
            <div className="rounded-lg border border-line bg-surface p-4">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Who at Northbridge can see it</div>
              {AUDIENCES.map((a) => (
                <Toggle key={a} on={audience.includes(a)} onChange={() => toggle(audience, a, setAudience)} label={a} />
              ))}
            </div>
            <div className="rounded-lg border border-brand/30 bg-brand-soft/40 p-4" data-testid="sponsor-preview">
              <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-brand-ink">
                <Eye className="h-3.5 w-3.5" /> Preview as Northbridge
              </div>
              <ul className="list-disc space-y-0.5 pl-4 text-sm text-ink-2">
                {preview.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="text-sm">
              <div className="text-ink">
                Approving as <span className="font-medium">{company.financeLead.name}</span> ({company.financeLead.title})
              </div>
              {needsSecond && (
                <label className="mt-2 block">
                  <span className="mb-1 block text-xs text-muted">Second approver (required for entity-level books)</span>
                  <input value={second} onChange={(e) => setSecond(e.target.value)} placeholder="e.g. CEO name" className="h-8 w-64 rounded-md border border-line-strong px-2.5 text-sm" data-testid="second-approver" />
                </label>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => decide(token, "declined", null)}>
                Decline
              </Button>
              <Button
                variant="primary"
                disabled={!canApprove}
                data-testid="approve-share"
                onClick={() => {
                  const scope: ShareScope = { entities: granularity === "entity" ? entities : [], granularity, cashFlow, budget, timing, hiddenAccounts: hidden, audience, approvedBy: company.financeLead.name, secondApprover: needsSecond ? second.trim() : null, approvedAt: demoNow() };
                  decide(token, "approved", scope);
                }}
              >
                Approve sharing
              </Button>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted">Read-only for Northbridge. Pausing or narrowing takes effect immediately and Northbridge is notified. Nothing here is shared with DualEntry&apos;s sales team.</p>
        </div>
      </div>
    </ExternalFrame>
  );
}
