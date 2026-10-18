"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileSpreadsheet, Plug } from "lucide-react";
import { cn } from "@/lib/cn";
import { getData } from "@/lib/data";
import { DEMO_TODAY, monthLabel } from "@/lib/data/calendar";
import type { BusinessModel, FundId, Geography, Sector } from "@/lib/data/types";
import { useWorkspace } from "@/lib/workspace/store";
import type { NewCompanyInput } from "@/lib/workspace/types";
import { Button, Dialog } from "../ui/primitives";

const MODELS: BusinessModel[] = ["Subscription software", "Recurring managed services", "Project-based services", "Workforce & staffing", "Tech-enabled services"];
const SYSTEMS = ["NetSuite", "QuickBooks Online", "QuickBooks Desktop", "Sage Intacct", "Xero", "Microsoft Dynamics", "Other / spreadsheets"];

const DEFAULTS: NewCompanyInput = {
  name: "",
  fund: "fund-iii",
  ownershipPct: 70,
  investmentDate: "2026-06-30",
  sector: "Business Services",
  subsector: "",
  businessModel: "Recurring managed services",
  fiscalYearEnd: "December",
  geography: "North America",
  headquarters: "",
  entityCount: 1,
  accountingSystem: "NetSuite",
  onDualEntry: false,
  approxRevenueUsdM: 30,
  cfoName: "",
  cfoTitle: "CFO",
  cfoEmail: "",
  historyFrom: 9,
  deadlineBusinessDays: 10,
};

function Field({ label, children, hint, error }: { label: string; children: React.ReactNode; hint?: string; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-2">{label}</span>
      {children}
      {error ? <span className="mt-0.5 block text-[11px] text-neg">{error}</span> : hint && <span className="mt-0.5 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}
const input = "h-8 w-full rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/15";

export function AddCompanyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add portfolio company" description="Create the company record and choose how its monthly figures will arrive." className="w-[min(860px,calc(100vw-32px))]">
      {open && <Form onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function Form({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const addCompany = useWorkspace((s) => s.addCompany);
  const [v, setV] = useState<NewCompanyInput>(DEFAULTS);
  const [tried, setTried] = useState(false);
  const set = <K extends keyof NewCompanyInput>(k: K, val: NewCompanyInput[K]) => setV((x) => ({ ...x, [k]: val }));
  const data = getData();
  const errors: Partial<Record<keyof NewCompanyInput, string>> = {};
  if (!v.name.trim()) errors.name = "Required";
  else if (data.companies.some((c) => c.name.toLowerCase() === v.name.trim().toLowerCase())) errors.name = "A company with this name already exists";
  if (!v.investmentDate || v.investmentDate > DEMO_TODAY) errors.investmentDate = "Must be on or before today";
  if (!(v.ownershipPct > 0 && v.ownershipPct <= 100)) errors.ownershipPct = "1–100";
  if (!(v.approxRevenueUsdM > 0)) errors.approxRevenueUsdM = "Enter an approximate figure";
  if (!(v.entityCount >= 1 && v.entityCount <= 20)) errors.entityCount = "1–20";
  if (!v.cfoName.trim()) errors.cfoName = "Required";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.cfoEmail.trim())) errors.cfoEmail = "Enter a valid email";
  const valid = Object.keys(errors).length === 0;
  const err = (k: keyof NewCompanyInput) => (tried ? errors[k] : undefined);

  const submit = () => {
    setTried(true);
    if (!valid) return;
    const id = addCompany(v, data.companies.map((c) => c.id));
    onDone();
    router.push(`/companies/${id}?onboarding=1`);
  };

  return (
    <div className="space-y-5" data-testid="add-company-form">
      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Company</h4>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Field label="Company name" error={err("name")}>
            <input className={input} value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Orbit Billing" data-testid="add-name" />
          </Field>
          <Field label="Fund">
            <select className={input} value={v.fund} onChange={(e) => set("fund", e.target.value as FundId)} aria-label="Fund for new company">
              {data.funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.shortName} ({f.vintage})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ownership %" error={err("ownershipPct")}>
            <input className={input} type="number" min={1} max={100} value={v.ownershipPct} onChange={(e) => set("ownershipPct", Number(e.target.value))} />
          </Field>
          <Field label="Investment date" error={err("investmentDate")}>
            <input className={input} type="date" max={DEMO_TODAY} value={v.investmentDate} onChange={(e) => set("investmentDate", e.target.value)} />
          </Field>
          <Field label="Sector">
            <select className={input} value={v.sector} onChange={(e) => set("sector", e.target.value as Sector)} aria-label="Sector for new company">
              <option>Software</option>
              <option>Business Services</option>
            </select>
          </Field>
          <Field label="Subsector">
            <input className={input} value={v.subsector} onChange={(e) => set("subsector", e.target.value)} placeholder="e.g. Billing SaaS" />
          </Field>
          <Field label="Business model" hint="Used to place the company in peer cohorts">
            <select className={input} value={v.businessModel} onChange={(e) => set("businessModel", e.target.value as BusinessModel)} aria-label="Business model for new company">
              {MODELS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="Approx. annual revenue ($M)" error={err("approxRevenueUsdM")} hint="Sizing until figures arrive">
            <input className={input} type="number" min={1} step={1} value={v.approxRevenueUsdM} onChange={(e) => set("approxRevenueUsdM", Number(e.target.value))} data-testid="add-revenue" />
          </Field>
          <Field label="Legal entities" error={err("entityCount")}>
            <input className={input} type="number" min={1} max={20} value={v.entityCount} onChange={(e) => set("entityCount", Number(e.target.value))} />
          </Field>
          <Field label="Headquarters">
            <input className={input} value={v.headquarters} onChange={(e) => set("headquarters", e.target.value)} placeholder="City, State" />
          </Field>
          <Field label="Geography">
            <select className={input} value={v.geography} onChange={(e) => set("geography", e.target.value as Geography)} aria-label="Geography for new company">
              <option>North America</option>
              <option>UK & Europe</option>
            </select>
          </Field>
          <Field label="Fiscal year end" hint="Portfolio views use calendar quarters">
            <select className={input} value={v.fiscalYearEnd} onChange={(e) => set("fiscalYearEnd", e.target.value)} aria-label="Fiscal year end">
              {["December", "March", "June", "September"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Finance contact</h4>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Field label="Name" error={err("cfoName")}>
            <input className={input} value={v.cfoName} onChange={(e) => set("cfoName", e.target.value)} data-testid="add-cfo-name" />
          </Field>
          <Field label="Title">
            <input className={input} value={v.cfoTitle} onChange={(e) => set("cfoTitle", e.target.value)} />
          </Field>
          <Field label="Email" error={err("cfoEmail")}>
            <input className={input} type="email" value={v.cfoEmail} onChange={(e) => set("cfoEmail", e.target.value)} placeholder="name@company.com" data-testid="add-cfo-email" />
          </Field>
        </div>
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Reporting package requested</h4>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Field label="History from" hint="Backfill requested">
            <select className={input} value={v.historyFrom} onChange={(e) => set("historyFrom", Number(e.target.value))} aria-label="History from">
              {[0, 9, 12, 21].map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Monthly deadline" hint="Business days after month-end">
            <input className={input} type="number" min={3} max={30} value={v.deadlineBusinessDays} onChange={(e) => set("deadlineBusinessDays", Number(e.target.value))} />
          </Field>
          <div className="text-xs text-muted md:pt-5">Monthly P&amp;L, cash flow and headcount, under the information rights in the shareholders&apos; agreement.</div>
        </div>
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Is this company on DualEntry?</h4>
        <div className="grid gap-2 md:grid-cols-2">
          {[
            { on: true, icon: Plug, t: "Yes — request a data share", d: `${v.cfoName || "The CFO"} approves the scope inside DualEntry. Figures then publish automatically at each month-end close.` },
            { on: false, icon: FileSpreadsheet, t: "No — Northbridge uploads the monthly pack", d: "Download the template, fill it from the company's pack, upload. Validated on every upload." },
          ].map((o) => (
            <button
              key={String(o.on)}
              type="button"
              onClick={() => set("onDualEntry", o.on)}
              aria-pressed={v.onDualEntry === o.on}
              data-testid={o.on ? "path-dualentry" : "path-upload"}
              className={cn("flex gap-3 rounded-lg border p-3 text-left", v.onDualEntry === o.on ? "border-brand bg-brand-soft/40 ring-1 ring-brand/30" : "border-line hover:border-line-strong")}
            >
              <o.icon className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
              <span>
                <span className="block text-sm font-semibold text-ink">{o.t}</span>
                <span className="block text-xs text-muted">{o.d}</span>
              </span>
            </button>
          ))}
        </div>
        {!v.onDualEntry && (
          <div className="mt-3 max-w-xs">
            <Field label="Current finance system">
              <select className={input} value={v.accountingSystem} onChange={(e) => set("accountingSystem", e.target.value)} aria-label="Current finance system">
                {SYSTEMS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </section>

      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <span className="text-xs text-muted">Saved in this browser only (prototype — no database). Amounts in USD.</span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} data-testid="add-submit">
            {v.onDualEntry ? "Add company & send data-share request" : "Add company"}
          </Button>
        </div>
      </div>
      {tried && !valid && <p className="text-right text-xs text-neg">Fix the highlighted fields.</p>}
    </div>
  );
}
