"use client";
import { useMemo, useState } from "react";
import { CheckCircle2, Info, Lock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { getData } from "@/lib/data";
import { monthLabel } from "@/lib/data/calendar";
import type { Company } from "@/lib/data/types";
import { Badge, Button, Dialog } from "../ui/primitives";

const REASONS = [
  { id: "multi", label: "Multi-entity consolidation is manual or spreadsheet-based" },
  { id: "acq", label: "Integrating a recent or planned add-on acquisition" },
  { id: "close", label: "Month-end close takes too long" },
  { id: "reporting", label: "Sponsor reporting requires manual preparation" },
  { id: "scale", label: "Current system is constraining growth" },
];

type Sharing = "context" | "summary";

/** Known operational context only — no financial results are included by default. */
function contextFor(c: Company) {
  const data = getData();
  const txs = data.transactionsByCompany.get(c.id) ?? [];
  return [
    { k: "Current finance system", v: c.accountingSystem },
    { k: "Legal entities", v: String(c.entityCount) },
    { k: "Reporting connection", v: c.connection === "upload" ? "Standardized monthly upload" : "Emailed reporting pack (not connected)" },
    { k: "Typical close", v: c.closeDays ? `${c.closeDays} business days` : "Not reported" },
    { k: "M&A activity", v: txs.length ? txs.map((t) => `${t.target} (${t.integrationStatus.toLowerCase()})`).join("; ") : "None recorded" },
    { k: "Known reporting gaps", v: c.missingFields.length ? c.missingFields.join("; ") : "None" },
  ];
}

export function suggestedReasons(c: Company): string[] {
  const data = getData();
  const out: string[] = [];
  if (c.entityCount >= 3) out.push("multi");
  if ((data.transactionsByCompany.get(c.id) ?? []).length) out.push("acq");
  if ((c.closeDays ?? 0) >= 12) out.push("close");
  if (c.connection !== "dualentry") out.push("reporting");
  return out;
}

export function ExploreDualEntryDialog({ company, open, onOpenChange }: { company: Company | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={company ? `Explore DualEntry for ${company.name}` : "Explore DualEntry"}
      description="Optional, sponsor-initiated evaluation request · simulation only — nothing is transmitted"
      className="w-[min(760px,calc(100vw-32px))]"
    >
      {company && <Body key={company.id} company={company} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function Body({ company, onDone }: { company: Company; onDone: () => void }) {
  const [reasons, setReasons] = useState<string[]>(() => suggestedReasons(company));
  const [sharing, setSharing] = useState<Sharing>("context");
  const [consent, setConsent] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const ctx = useMemo(() => contextFor(company), [company]);
  const canSubmit = reasons.length > 0 && (sharing === "context" || consent);

  if (company.connection === "dualentry")
    return <p className="text-sm text-muted">{company.name} already runs on DualEntry.</p>;

  if (submitted)
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center" data-testid="explore-success">
        <CheckCircle2 className="h-10 w-10 text-pos" />
        <div className="text-base font-semibold text-ink">Simulated evaluation request created</div>
        <div className="text-sm text-muted">
          Reference <span className="num font-medium text-ink">{submitted}</span>. No information has been sent anywhere — this is a prototype.
        </div>
        <ol className="mt-2 max-w-md space-y-1.5 text-left text-sm text-ink-2">
          <li>1. {company.financeLead.name} ({company.financeLead.title}) would receive an opt-in invitation first.</li>
          <li>2. Only after the company opts in would DualEntry see the context below{sharing === "summary" ? " plus summary financials" : ""}.</li>
          <li>3. Portfolio Intelligence data permissions are unchanged by this request.</li>
        </ol>
        <Button variant="primary" onClick={onDone} className="mt-2">
          Done
        </Button>
      </div>
    );

  return (
    <div className="space-y-5" data-testid="explore-form">
      <div className="flex items-start gap-2 rounded-md bg-info-soft px-3 py-2 text-xs text-info">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Commercial interest is kept separate from data permissions. Sponsor access to Portfolio Intelligence does not authorize sharing {company.name}&apos;s financial data with DualEntry sales, and an evaluation is never triggered by financial performance — only by finance-system needs.
        </span>
      </div>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Company & known implementation context</h4>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-lg border border-line p-3 text-sm sm:grid-cols-2">
          <dt className="text-muted">Company</dt>
          <dd className="font-medium text-ink">{company.name} <span className="font-normal text-muted">· {company.subsector}</span></dd>
          {ctx.map((x) => (
            <div key={x.k} className="contents">
              <dt className="text-muted">{x.k}</dt>
              <dd className="text-ink-2">{x.v}</dd>
            </div>
          ))}
          <dt className="text-muted">Finance leader (opt-in contact)</dt>
          <dd className="text-ink-2">
            {company.financeLead.name}, {company.financeLead.title}
          </dd>
          <dt className="text-muted">Data through</dt>
          <dd className="text-ink-2">{monthLabel(company.lastReportedMonth)}</dd>
        </dl>
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Reason for evaluation</h4>
        <div className="space-y-1.5">
          {REASONS.map((r) => (
            <label key={r.id} className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
              <input
                type="checkbox"
                className="accent-[rgb(var(--brand))]"
                checked={reasons.includes(r.id)}
                onChange={() => setReasons(reasons.includes(r.id) ? reasons.filter((x) => x !== r.id) : [...reasons, r.id])}
              />
              {r.label}
              {suggestedReasons(company).includes(r.id) && <Badge tone="outline">from known context</Badge>}
            </label>
          ))}
        </div>
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Data-sharing permission</h4>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { v: "context" as Sharing, t: "Context only (default)", d: "System, entity count, close timeline and reasons above. No financial results." },
            { v: "summary" as Sharing, t: "Context + summary financials", d: "Adds revenue scale band and entity count trend. Requires the company's explicit consent." },
          ].map((o) => (
            <button
              type="button"
              key={o.v}
              onClick={() => setSharing(o.v)}
              className={cn("rounded-lg border p-3 text-left", sharing === o.v ? "border-brand bg-brand-soft/50 ring-1 ring-brand/30" : "border-line hover:border-line-strong")}
              aria-pressed={sharing === o.v}
            >
              <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
                {o.v === "summary" && <Lock className="h-3.5 w-3.5 text-muted" />} {o.t}
              </div>
              <div className="mt-0.5 text-xs text-muted">{o.d}</div>
            </button>
          ))}
        </div>
        {sharing === "summary" && (
          <label className="mt-2 flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="accent-[rgb(var(--brand))]" />
            {company.financeLead.name} has given written consent to share summary financials with DualEntry.
          </label>
        )}
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Note to the company (optional)</h4>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="e.g. Would a faster multi-entity close help ahead of the next add-on?"
          className="w-full rounded-md border border-line-strong px-3 py-2 text-sm focus:border-brand/50 focus:outline-none"
        />
      </section>

      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <Info className="h-3.5 w-3.5" /> Prototype: submitting creates a local simulated record only.
        </span>
        <Button variant="primary" disabled={!canSubmit} onClick={() => setSubmitted(`SIM-${company.id.slice(0, 3).toUpperCase()}-${String(Date.now()).slice(-5)}`)} data-testid="explore-submit">
          Create evaluation request
        </Button>
      </div>
    </div>
  );
}
