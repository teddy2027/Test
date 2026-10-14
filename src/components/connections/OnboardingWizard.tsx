"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, FileSpreadsheet, Lock, Mail, Plug, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { getData } from "@/lib/data";
import { monthLabel } from "@/lib/data/calendar";
import type { Company } from "@/lib/data/types";
import { fmtUsd } from "@/lib/format";
import { Badge, Button, Dialog } from "../ui/primitives";

export type Method = "dualentry" | "upload" | "invite";
const STEPS = ["Company", "Connection method", "Permissions", "Financial information", "Map categories", "Validate", "Preview", "Confirm"];

const CATEGORIES = ["Subscription revenue", "Services revenue", "Direct labor", "Other COGS", "Sales & marketing", "R&D", "G&A", "Other opex", "Exclude (non-operating)"];

function sourceAccounts(c: Company) {
  const saas = c.hasArr;
  const base: { code: string; name: string; suggested: string }[] = [
    ...(saas ? [{ code: "4000", name: "Subscription Revenue", suggested: "Subscription revenue" }] : []),
    { code: saas ? "4100" : "4000", name: saas ? "Implementation & Professional Services" : "Service Revenue", suggested: "Services revenue" },
    { code: "5000", name: saas ? "Support & Services Payroll" : "Field / Delivery Labor", suggested: "Direct labor" },
    { code: "5200", name: saas ? "Hosting & Infrastructure" : "Subcontractors & Materials", suggested: "Other COGS" },
    { code: "6100", name: "Sales Salaries & Commissions", suggested: "Sales & marketing" },
    { code: "6150", name: "Marketing Programs", suggested: "Sales & marketing" },
    ...(saas ? [{ code: "6300", name: "Engineering Payroll", suggested: "R&D" }] : []),
    { code: "6500", name: "Finance, HR & Admin Payroll", suggested: "G&A" },
    { code: "6600", name: "Professional Fees", suggested: "G&A" },
    { code: "6800", name: "Rent & Facilities", suggested: "Other opex" },
    { code: "7100", name: "Interest Expense", suggested: "Exclude (non-operating)" },
    { code: "7900", name: "Transaction Costs (one-off)", suggested: "" },
  ];
  return base;
}

export function OnboardingWizard({
  open,
  onOpenChange,
  initialCompany,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialCompany?: string | null;
  onComplete: (companyId: string, method: Method) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Connect a portfolio company" description="Simulated onboarding using fixture data — nothing is transmitted" className="w-[min(920px,calc(100vw-32px))]">
      {open && <Wizard initialCompany={initialCompany} onComplete={onComplete} onClose={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function Wizard({ initialCompany, onComplete, onClose }: { initialCompany?: string | null; onComplete: (id: string, m: Method) => void; onClose: () => void }) {
  const data = getData();
  const [step, setStep] = useState(0);
  const [companyId, setCompanyId] = useState(initialCompany ?? "apex-workforce");
  const company = data.companyById.get(companyId)!;
  const [method, setMethod] = useState<Method>(company.connection === "dualentry" ? "dualentry" : company.connection === "not_connected" ? "invite" : "upload");
  const [audiences, setAudiences] = useState<string[]>(["Operating partners", "Fund finance"]);
  const [depth, setDepth] = useState<string[]>(["Summary P&L", "Detailed P&L lines", "Cash flow", "Budget"]);
  const [domains, setDomains] = useState<string[]>(["Income statement", "Cash flow", "Budget", "Headcount & operating KPIs"]);
  const accounts = useMemo(() => sourceAccounts(company), [company]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [activated, setActivated] = useState(false);
  const mapOf = (code: string, suggested: string) => mapping[`${companyId}:${code}`] ?? suggested;
  const unmapped = accounts.filter((a) => !mapOf(a.code, a.suggested));

  const rows = data.monthlyByCompany.get(companyId) ?? [];
  const last = company.lastReportedMonth;
  const preview = [last - 2, last - 1, last].map((m) => rows[m]).filter(Boolean);

  const checks = [
    { label: "Company identity matches sponsor record", ok: true },
    { label: "Every source account mapped to a portfolio category", ok: method === "invite" || unmapped.length === 0, warn: true, detail: unmapped.length ? `${unmapped.length} unmapped: ${unmapped.map((a) => `${a.code} ${a.name}`).join(", ")}` : undefined },
    { label: "Revenue − COGS = gross profit (all months)", ok: preview.every((r) => Math.abs(r!.revenue - r!.cogs - r!.grossProfit) < 1e-6) },
    { label: "Gross profit − opex = EBITDA (all months)", ok: preview.every((r) => Math.abs(r!.grossProfit - r!.operatingExpenses - r!.ebitda) < 1e-6) },
    { label: "Labor split provided (direct vs operating personnel)", ok: preview.every((r) => r!.directLabor !== null), warn: true, detail: preview.some((r) => r!.directLabor === null) ? "Labor metrics will show N/A until the split is provided." : undefined },
    { label: "Latest closed month submitted (Sep 2026)", ok: last >= 32, warn: true, detail: last < 32 ? `Data through ${monthLabel(last)}.` : undefined },
    { label: "Budget provided for current fiscal year", ok: (data.budgetByCompany.get(companyId) ?? []).length > 0 || !domains.includes("Budget"), warn: true },
  ];
  const blocking = checks.filter((c) => !c.ok && !c.warn);
  const canNext = step !== 0 || !!companyId;

  const toggle = (arr: string[], v: string, set: (x: string[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  if (activated)
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" data-testid="wizard-success">
        <CheckCircle2 className="h-10 w-10 text-pos" />
        <div className="text-base font-semibold text-ink">{method === "invite" ? "Invitation prepared (simulated)" : "Connection activated (simulated)"}</div>
        <p className="max-w-md text-sm text-muted">
          {method === "dualentry"
            ? `${company.name} would sync daily from its authorized ledger with entity-level detail.`
            : method === "upload"
              ? `${company.name} would submit the standardized monthly template; validation runs on every upload.`
              : `${company.financeLead.name} (${company.financeLead.title}) would receive an invitation to connect. No email has been sent.`}
        </p>
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    );

  return (
    <div className="flex gap-5" data-testid="wizard">
      <ol className="hidden w-44 shrink-0 space-y-0.5 md:block">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              onClick={() => i < step && setStep(i)}
              className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm", i === step ? "bg-brand-soft font-medium text-brand-ink" : i < step ? "text-ink-2 hover:bg-subtle" : "text-faint")}
            >
              <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px]", i < step ? "bg-pos text-white" : i === step ? "bg-brand text-white" : "bg-line text-muted")}>{i < step ? <Check className="h-3 w-3" /> : i + 1}</span>
              {s}
            </button>
          </li>
        ))}
      </ol>
      <div className="min-w-0 flex-1">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted" data-testid="wizard-step">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </div>
        <div className="min-h-[320px]">
          {step === 0 && (
            <div className="space-y-2">
              {data.companies.map((c) => (
                <label key={c.id} className={cn("flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2", companyId === c.id ? "border-brand bg-brand-soft/40" : "border-line hover:bg-subtle")}>
                  <input
                    type="radio"
                    name="company"
                    checked={companyId === c.id}
                    onChange={() => {
                      setCompanyId(c.id);
                      setMethod(c.connection === "dualentry" ? "dualentry" : c.connection === "not_connected" ? "invite" : "upload");
                    }}
                    className="accent-[rgb(var(--brand))]"
                  />
                  <span className="flex-1 text-sm font-medium text-ink">{c.name}</span>
                  <span className="text-xs text-muted">{c.accountingSystem}</span>
                  <Badge tone={c.connection === "dualentry" ? "brand" : c.connection === "upload" ? "outline" : "warn"}>{c.connection === "dualentry" ? "Connected" : c.connection === "upload" ? "Upload" : "Not connected"}</Badge>
                </label>
              ))}
            </div>
          )}
          {step === 1 && (
            <div className="grid gap-3">
              {[
                { v: "dualentry" as Method, icon: Plug, t: "DualEntry ledger connection", d: "Authorized, read-only sync from the company's DualEntry ledger. Daily refresh, entity- and account-level drill-down, working-capital bridge, organic vs acquired splits.", avail: company.accountingSystem === "DualEntry" },
                { v: "upload" as Method, icon: FileSpreadsheet, t: "External ERP · standardized upload", d: `Monthly upload of the portfolio reporting template exported from ${company.accountingSystem}. Consolidated lines; validated on every submission.`, avail: true },
                { v: "invite" as Method, icon: Mail, t: "Invite the company finance leader", d: `Send ${company.financeLead.name} (${company.financeLead.title}) an invitation to choose a method and set permissions. Recommended when the company has not yet been onboarded.`, avail: true },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  disabled={!o.avail}
                  onClick={() => setMethod(o.v)}
                  className={cn("flex gap-3 rounded-lg border p-3 text-left disabled:cursor-not-allowed disabled:opacity-50", method === o.v ? "border-brand bg-brand-soft/40 ring-1 ring-brand/30" : "border-line hover:border-line-strong")}
                  data-testid={`method-${o.v}`}
                >
                  <o.icon className="mt-0.5 h-5 w-5 text-brand" />
                  <span>
                    <span className="block text-sm font-semibold text-ink">{o.t}</span>
                    <span className="block text-xs text-muted">{o.d}</span>
                    {!o.avail && <span className="mt-1 block text-xs text-warn">Requires the company to run its finance stack on DualEntry.</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 text-sm font-medium text-ink">Who at Northbridge can see {company.name}&apos;s data</div>
                {["Operating partners", "Fund finance", "Deal team", "Portfolio ops analysts"].map((a) => (
                  <label key={a} className="flex items-center gap-2 py-0.5 text-sm text-ink-2">
                    <input type="checkbox" checked={audiences.includes(a)} onChange={() => toggle(audiences, a, setAudiences)} className="accent-[rgb(var(--brand))]" /> {a}
                  </label>
                ))}
              </div>
              <div>
                <div className="mb-1.5 text-sm font-medium text-ink">Level of detail shared with the sponsor</div>
                {["Summary P&L", "Detailed P&L lines", "Cash flow", "Budget", "Entity-level detail", "Account-level drill-down"].map((dpt) => {
                  const deOnly = dpt === "Entity-level detail" || dpt === "Account-level drill-down";
                  const disabled = deOnly && method !== "dualentry";
                  return (
                    <label key={dpt} className={cn("flex items-center gap-2 py-0.5 text-sm", disabled ? "text-faint" : "text-ink-2")}>
                      <input type="checkbox" disabled={disabled} checked={!disabled && depth.includes(dpt)} onChange={() => toggle(depth, dpt, setDepth)} className="accent-[rgb(var(--brand))]" /> {dpt}
                      {deOnly && <Badge tone="brand">DualEntry connection</Badge>}
                    </label>
                  );
                })}
              </div>
              <div className="flex items-start gap-2 rounded-md bg-subtle px-3 py-2 text-xs text-ink-2">
                <Lock className="mt-0.5 h-3.5 w-3.5 text-muted" />
                <span>
                  <span className="font-medium">Always on:</span> data is visible only to the sponsor roles above. It is never shared with DualEntry sales or commercial teams, and sponsor access does not authorize use beyond portfolio reporting. The company can revoke access at any time.
                </span>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {["Income statement", "Cash flow", "Balance sheet", "Budget", "Headcount & operating KPIs", "ARR & customers (subscription only)"].map((d) => {
                const disabled = (d === "Balance sheet" && method !== "dualentry") || (d.startsWith("ARR") && !company.hasArr);
                return (
                  <label key={d} className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-sm", disabled ? "border-line text-faint" : domains.includes(d) ? "border-brand/40 bg-brand-soft/30 text-ink" : "border-line text-ink-2")}>
                    <input type="checkbox" disabled={disabled} checked={!disabled && domains.includes(d)} onChange={() => toggle(domains, d, setDomains)} className="accent-[rgb(var(--brand))]" /> {d}
                    {d === "Balance sheet" && method !== "dualentry" && <span className="ml-auto text-[11px]">ledger connection only</span>}
                  </label>
                );
              })}
            </div>
          )}
          {step === 4 && (
            <div>
              {method === "invite" ? (
                <p className="text-sm text-muted">Category mapping is completed by the company after accepting the invitation.</p>
              ) : method === "dualentry" ? (
                <p className="text-sm text-muted">DualEntry chart-of-accounts tags map automatically to portfolio categories (no manual mapping). Review below.</p>
              ) : (
                <p className="mb-2 text-sm text-muted">Map {company.accountingSystem} accounts to the portfolio reporting categories. Direct labor and operating personnel must be separated so labor metrics are not double counted.</p>
              )}
              {method !== "invite" && (
                <table className="mt-2 w-full text-sm" data-testid="mapping-table">
                  <thead>
                    <tr className="border-b border-line text-xs text-muted">
                      <th className="py-1.5 text-left font-medium">Source account</th>
                      <th className="py-1.5 text-left font-medium">Portfolio category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a) => (
                      <tr key={a.code} className="border-b border-line/60">
                        <td className="py-1.5 text-ink-2">
                          <span className="num text-muted">{a.code}</span> {a.name}
                        </td>
                        <td className="py-1.5">
                          <select
                            aria-label={`Map ${a.name}`}
                            disabled={method === "dualentry"}
                            value={mapOf(a.code, a.suggested)}
                            onChange={(e) => setMapping({ ...mapping, [`${companyId}:${a.code}`]: e.target.value })}
                            className={cn("h-7 rounded border px-2 text-sm", mapOf(a.code, a.suggested) ? "border-line-strong" : "border-warn bg-warn-soft")}
                          >
                            <option value="">— Unmapped —</option>
                            {CATEGORIES.map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          {step === 5 && (
            <ul className="space-y-1.5" data-testid="validation-results">
              {(method === "invite" ? checks.slice(0, 1) : checks).map((c) => (
                <li key={c.label} className="flex items-start gap-2 text-sm">
                  {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-pos" /> : c.warn ? <AlertTriangle className="mt-0.5 h-4 w-4 text-warn" /> : <XCircle className="mt-0.5 h-4 w-4 text-neg" />}
                  <span>
                    <span className="text-ink">{c.label}</span>
                    {c.detail && <span className="block text-xs text-muted">{c.detail}</span>}
                  </span>
                </li>
              ))}
              {method === "invite" && <li className="text-sm text-muted">Financial validation runs after the company completes setup.</li>}
            </ul>
          )}
          {step === 6 && (
            <div>
              {method === "invite" ? (
                <div className="rounded-lg border border-line p-4 text-sm" data-testid="invite-preview">
                  <div className="text-xs text-muted">To: {company.financeLead.name} &lt;finance@{company.id.replace(/-/g, "")}.example&gt;</div>
                  <div className="mt-1 font-medium text-ink">Northbridge Equity Partners: connect {company.name} to Portfolio Intelligence</div>
                  <p className="mt-2 text-ink-2">
                    Hi {company.financeLead.name.split(" ")[0]}, Northbridge is moving portfolio reporting to DualEntry Portfolio Intelligence. You choose how to connect (standardized upload from {company.accountingSystem}, or a ledger connection) and exactly what is shared. Monthly packs by email would no longer be needed.
                  </p>
                  <p className="mt-2 text-xs text-muted">Example address on a reserved domain. Nothing is sent from this prototype.</p>
                </div>
              ) : (
                <div data-testid="data-preview">
                  <p className="mb-2 text-sm text-muted">Last three submitted months as they would appear in portfolio reporting (USD millions):</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-xs text-muted">
                        <th className="py-1.5 text-left font-medium">Month</th>
                        <th className="py-1.5 text-right font-medium">Revenue</th>
                        <th className="py-1.5 text-right font-medium">Gross profit</th>
                        <th className="py-1.5 text-right font-medium">EBITDA</th>
                        <th className="py-1.5 text-right font-medium">Labor</th>
                        <th className="py-1.5 text-right font-medium">CFO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((r) => (
                        <tr key={r!.month} className="border-b border-line/60">
                          <td className="py-1.5">{monthLabel(r!.month)}</td>
                          <td className="num py-1.5 text-right">{fmtUsd(r!.revenue, { decimals: 2 })}</td>
                          <td className="num py-1.5 text-right">{fmtUsd(r!.grossProfit, { decimals: 2 })}</td>
                          <td className="num py-1.5 text-right">{fmtUsd(r!.ebitda, { decimals: 2 })}</td>
                          <td className="num py-1.5 text-right">{r!.directLabor === null ? "N/A" : fmtUsd(r!.directLabor + (r!.operatingPersonnel ?? 0), { decimals: 2 })}</td>
                          <td className="num py-1.5 text-right">{fmtUsd(r!.cashFromOperations, { decimals: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {step === 7 && (
            <dl className="grid grid-cols-[180px_1fr] gap-y-2 text-sm" data-testid="confirm-summary">
              <dt className="text-muted">Company</dt>
              <dd className="font-medium text-ink">{company.name}</dd>
              <dt className="text-muted">Method</dt>
              <dd className="text-ink-2">{method === "dualentry" ? "DualEntry ledger connection" : method === "upload" ? `Standardized upload from ${company.accountingSystem}` : "Invite finance leader"}</dd>
              <dt className="text-muted">Visible to</dt>
              <dd className="text-ink-2">{audiences.join(", ") || "No one (select at least one role)"}</dd>
              <dt className="text-muted">Detail shared</dt>
              <dd className="text-ink-2">{depth.filter((x) => method === "dualentry" || !x.includes("level")).join(", ")}</dd>
              <dt className="text-muted">Information</dt>
              <dd className="text-ink-2">{domains.join(", ")}</dd>
              <dt className="text-muted">Validation</dt>
              <dd className="text-ink-2">{blocking.length ? `${blocking.length} blocking issue(s)` : `${checks.filter((c) => !c.ok).length} warning(s), no blocking issues`}</dd>
              <dt className="text-muted">Commercial use</dt>
              <dd className="text-ink-2">None — data is not shared with DualEntry sales</dd>
            </dl>
          )}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
          <Button variant="ghost" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button variant="primary" disabled={!canNext} onClick={() => setStep(step + 1)} data-testid="wizard-next">
              Continue
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={blocking.length > 0 || audiences.length === 0}
              onClick={() => {
                setActivated(true);
                onComplete(companyId, method);
              }}
              data-testid="wizard-confirm"
            >
              {method === "invite" ? "Prepare invitation" : "Confirm connection"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
