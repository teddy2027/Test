"use client";
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileUp, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { getData } from "@/lib/data";
import { LAST_MONTH, monthKey, monthLabel } from "@/lib/data/calendar";
import type { Company } from "@/lib/data/types";
import { buildBudgetTemplate, validateBudget, type BudgetResult, type BudgetValues } from "@/lib/workspace/budget";
import { buildTemplate, LINES, nextMonthsToUpload, recordToValues, validateUpload, type Issue, type MonthValues, type UploadResult } from "@/lib/workspace/csv";
import { buildCompanyExport, initialMapping, isTemplate, knownShare, parseCompanyExport, TARGETS, toTemplate, type CompanyExport, type MappingSource, type MapTarget } from "@/lib/workspace/mapping";
import { buildAddedCompany, fullHistoryForSeeded } from "@/lib/workspace/synth";
import { useDataVersion, useWorkspace } from "@/lib/workspace/store";
import { downloadText, slug } from "@/lib/export";
import { fmtPct, fmtUsd } from "@/lib/format";
import { Badge, Button, Dialog, Segmented, Tip } from "../ui/primitives";

type Kind = "actuals" | "budget";

export function UploadDialog({ company, open, onOpenChange }: { company: Company; open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Upload figures · ${company.name}`} description="Northbridge uploads the company's monthly pack or budget on its behalf. Every upload is validated before it reaches the portfolio." className="w-[min(980px,calc(100vw-32px))]">
      {open && <Body company={company} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function built(company: Company) {
  const added = useWorkspace.getState().companies.find((c) => c.company.id === company.id);
  return added ? buildAddedCompany(company, added.input) : fullHistoryForSeeded(company.id);
}

function exampleValues(company: Company, months: number[]): Record<number, MonthValues> {
  const b = built(company);
  const out: Record<number, MonthValues> = {};
  if (!b) return out;
  for (const m of months) {
    const r = b.monthlyLocal.find((x) => x.month === m);
    if (r) out[m] = recordToValues(r, b.operational.find((o) => o.month === m));
  }
  return out;
}

/** Synthetic budget for the example file: the generated plan where one exists, otherwise actuals × a plausible plan. */
function exampleBudget(company: Company, months: number[]): Record<number, BudgetValues> {
  const b = built(company);
  const out: Record<number, BudgetValues> = {};
  if (!b) return out;
  const u = (v: number) => Math.round(v * 1e6);
  for (const m of months) {
    const plan = b.budgetsLocal.find((x) => x.month === m);
    const act = b.monthlyLocal.find((x) => x.month === m);
    if (plan) out[m] = { revenue: u(plan.revenue), cogs: u(plan.cogs), opex: u(plan.operatingExpenses), cfo: plan.cashFromOperations === null ? null : u(plan.cashFromOperations) };
    else if (act) out[m] = { revenue: u(act.revenue * 1.04), cogs: u(act.cogs * 1.02), opex: u(act.operatingExpenses), cfo: act.cashFromOperations === null ? null : u(act.cashFromOperations * 1.05) };
  }
  return out;
}

const SOURCE_BADGE: Record<MappingSource, React.ReactNode> = {
  remembered: <Badge tone="pos">remembered</Badge>,
  suggested: <Badge tone="info">suggested</Badge>,
  manual: <Badge tone="neutral">set by you</Badge>,
  none: <Badge tone="warn">needs mapping</Badge>,
};

function Issues({ errors, warnings }: { errors: Issue[]; warnings: Issue[] }) {
  if (!errors.length && !warnings.length) return null;
  return (
    <ul className="mb-3 max-h-44 space-y-1 overflow-y-auto rounded-md border border-line p-2 text-xs" data-testid="upload-issues">
      {errors.map((e) => (
        <li key={e.message} className="flex gap-1.5 text-neg">
          <XCircle className="mt-0.5 h-3 w-3 shrink-0" /> {e.message}
        </li>
      ))}
      {warnings.map((w) => (
        <li key={w.message} className="flex gap-1.5 text-warn">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {w.message}
        </li>
      ))}
    </ul>
  );
}

function StatusBadges({ ok, errors, warnings, count, extra }: { ok: boolean; errors: number; warnings: number; count: number; extra?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {ok ? (
        <Badge tone="pos">
          <CheckCircle2 className="h-3 w-3" /> Passed — {count} month{count === 1 ? "" : "s"}
        </Badge>
      ) : (
        <Badge tone="neg">
          <XCircle className="h-3 w-3" /> {errors} error{errors === 1 ? "" : "s"} — fix and re-upload
        </Badge>
      )}
      {warnings > 0 && (
        <Badge tone="warn">
          <AlertTriangle className="h-3 w-3" /> {warnings} warning{warnings === 1 ? "" : "s"}
        </Badge>
      )}
      {extra}
    </div>
  );
}

function DropZone({ fileName, onFile }: { fileName: string | null; onFile: (f: File) => void }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={cn("flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-center", drag ? "border-brand bg-brand-soft/40" : "border-line-strong bg-subtle/50")}
    >
      <FileUp className="h-6 w-6 text-muted" />
      <div className="text-sm text-ink-2">{fileName ? <span className="font-medium text-ink">{fileName}</span> : "Drop a CSV here, or"}</div>
      <Button size="sm" onClick={() => inputRef.current?.click()}>
        {fileName ? "Choose another file" : "Choose file"}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        data-testid="upload-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function MonthRange({ from, to, setFrom, setTo, count }: { from: number; to: number; setFrom: (m: number) => void; setTo: (m: number) => void; count: number }) {
  const allMonths = Array.from({ length: LAST_MONTH + 1 }, (_, i) => i).reverse();
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">Months</span>
      {[
        ["From month", from, setFrom],
        ["To month", to, setTo],
      ].map(([label, value, set], i) => (
        <span key={label as string} className="flex items-center gap-2">
          {i === 1 && <span className="text-muted">to</span>}
          <select aria-label={label as string} value={value as number} onChange={(e) => (set as (m: number) => void)(Number(e.target.value))} className="h-8 rounded-md border border-line-strong px-2 text-sm">
            {allMonths.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </span>
      ))}
      <span className="text-xs text-faint">
        ({count} month{count === 1 ? "" : "s"})
      </span>
    </div>
  );
}

function Body({ company, onDone }: { company: Company; onDone: () => void }) {
  const [kind, setKind] = useState<Kind>("actuals");
  const [done, setDone] = useState<string | null>(null);
  if (done)
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" data-testid="upload-success">
        <CheckCircle2 className="h-10 w-10 text-pos" />
        <div className="text-base font-semibold text-ink">Upload accepted</div>
        <p className="max-w-md text-sm text-muted">{done}</p>
        <Button variant="primary" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  return (
    <div className="space-y-5" data-testid="upload-dialog">
      <Segmented<Kind>
        ariaLabel="What to upload"
        value={kind}
        onChange={setKind}
        options={[
          { value: "actuals", label: "Monthly actuals" },
          { value: "budget", label: "Budget" },
        ]}
      />
      {kind === "actuals" ? <Actuals key="a" company={company} onCancel={onDone} onDone={setDone} /> : <Budget key="b" company={company} onCancel={onDone} onDone={setDone} />}
    </div>
  );
}

// ---------------------------------------------------------------- actuals

function Actuals({ company, onCancel, onDone }: { company: Company; onCancel: () => void; onDone: (msg: string) => void }) {
  const accept = useWorkspace((s) => s.acceptUpload);
  const added = useWorkspace((s) => s.companies.find((c) => c.company.id === company.id));
  const remembered = useWorkspace((s) => s.mappings[company.id]);
  const suggested = nextMonthsToUpload(company, added?.input.historyFrom ?? 21);
  const [from, setFrom] = useState(suggested[0]);
  const [to, setTo] = useState(suggested[suggested.length - 1]);
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [exp, setExp] = useState<CompanyExport | null>(null);
  const [mapping, setMapping] = useState<Record<string, MapTarget | null>>({});
  const [source, setSource] = useState<Record<string, MappingSource>>({});
  const [reason, setReason] = useState("");
  const months = useMemo(() => {
    const out: number[] = [];
    for (let m = Math.min(from, to); m <= Math.max(from, to); m++) out.push(m);
    return out;
  }, [from, to]);
  const rev = useDataVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- rev: re-read after the dataset changes
  const existing = useMemo(() => getData().monthlyLocalByCompany.get(company.id) ?? [], [company.id, rev]);
  const range = `${monthKey(months[0])}-to-${monthKey(months[months.length - 1])}`;

  const readFile = (f: File) => {
    setFileName(f.name);
    f.text().then((t) => {
      setText(t);
      if (isTemplate(t)) {
        setExp(null);
        return;
      }
      const e = parseCompanyExport(t);
      const init = initialMapping(e.rows, remembered);
      setExp(e);
      setMapping(init.mapping);
      setSource(init.source);
    });
  };
  const unmapped = exp ? exp.rows.filter((r) => !mapping[r.account]).length : 0;
  const share = exp ? knownShare(exp.rows, remembered) : null;
  const result = useMemo((): UploadResult | null => {
    if (!text) return null;
    if (!exp) return validateUpload(text, company, existing);
    if (exp.errors.length) return { ok: false, months: [], errors: exp.errors.map((message) => ({ level: "error" as const, message })), warnings: [], restatedMonths: [], newMonths: [] };
    if (unmapped) return null;
    return validateUpload(toTemplate(company, exp, mapping), company, existing);
  }, [text, exp, mapping, unmapped, company, existing]);
  const needsReason = !!result && result.restatedMonths.length > 0;
  const canAccept = !!result?.ok && (!needsReason || reason.trim().length >= 5);

  return (
    <>
      <section className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">1 · Get a file</h4>
          <p className="text-sm text-ink-2">
            Use the portfolio template, <span className="font-medium text-ink">or upload the company&apos;s own P&amp;L export</span> as it comes out of {company.accountingSystem}: you map its accounts to the portfolio lines once, and the mapping is remembered for next month. Amounts in {company.baseCurrency}, whole units.
          </p>
          <MonthRange from={from} to={to} setFrom={setFrom} setTo={setTo} count={months.length} />
        </div>
        <div className="flex flex-col gap-1.5 md:items-end md:pt-5">
          <Button onClick={() => downloadText(`${slug(company.name)}-template-${range}.csv`, buildTemplate(company, months))} data-testid="download-template">
            <Download className="h-3.5 w-3.5" /> Blank template
          </Button>
          <Tip content="The template pre-filled with synthetic figures for this company.">
            <Button variant="ghost" className="text-brand" onClick={() => downloadText(`${slug(company.name)}-example-${range}.csv`, buildTemplate(company, months, exampleValues(company, months)))} data-testid="download-example">
              <Download className="h-3.5 w-3.5" /> Example — template (synthetic)
            </Button>
          </Tip>
          <Tip content={`A synthetic P&L export in ${company.name}'s own account names, to try the mapping step.`}>
            <Button variant="ghost" className="text-brand" onClick={() => downloadText(`${slug(company.name)}-${slug(company.accountingSystem)}-export-${range}.csv`, buildCompanyExport(company, months, exampleValues(company, months)))} data-testid="download-export-example">
              <Download className="h-3.5 w-3.5" /> Example — {company.accountingSystem} export (synthetic)
            </Button>
          </Tip>
        </div>
      </section>

      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">2 · Upload the file</h4>
        <DropZone fileName={fileName} onFile={readFile} />
      </section>

      {exp && !exp.errors.length && (
        <section data-testid="mapping-section">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">3 · Map {company.name}&apos;s accounts</h4>
          <p className="mb-2 text-xs text-muted">
            {exp.rows.length} accounts · {unmapped ? <span className="font-medium text-warn">{unmapped} still to map</span> : "all mapped"} · subtotals are ignored except total revenue, which is used to check the mapping. One-off and non-operating items are excluded from operating figures.
          </p>
          {share !== null && share < 0.5 && (
            <p className="mb-2 flex items-center gap-1.5 rounded-md bg-warn-soft px-3 py-2 text-xs text-warn" data-testid="mapping-unfamiliar">
              <AlertTriangle className="h-3.5 w-3.5" /> Only {Math.round(share * 100)}% of these accounts match {company.name}&apos;s earlier packs. Check this is the right company&apos;s export.
            </p>
          )}
          <div className="thin-scroll max-h-72 overflow-y-auto rounded-md border border-line">
            <table className="w-full text-sm" data-testid="mapping-table">
              <thead className="sticky top-0 bg-subtle">
                <tr className="border-b border-line text-xs text-muted">
                  <th className="px-3 py-1.5 text-left font-medium">{company.accountingSystem} account</th>
                  <th className="px-3 py-1.5 text-right font-medium">{monthLabel(exp.months[exp.months.length - 1] ?? 0)}</th>
                  <th className="px-3 py-1.5 text-left font-medium">Portfolio line</th>
                  <th className="px-3 py-1.5 text-left font-medium" />
                </tr>
              </thead>
              <tbody>
                {exp.rows.map((r) => {
                  const v = r.values[exp.months[exp.months.length - 1]];
                  return (
                    <tr key={r.account} className={cn("border-b border-line/60 last:border-0", !mapping[r.account] && "bg-warn-soft/40")}>
                      <td className="px-3 py-1 text-ink">{r.account}</td>
                      <td className="num px-3 py-1 text-right text-ink-2">{v === null || v === undefined ? "—" : v.toLocaleString("en-US")}</td>
                      <td className="px-3 py-1">
                        <select
                          aria-label={`Map ${r.account}`}
                          value={mapping[r.account] ?? ""}
                          onChange={(e) => {
                            setMapping({ ...mapping, [r.account]: (e.target.value || null) as MapTarget | null });
                            setSource({ ...source, [r.account]: "manual" });
                          }}
                          className="h-7 w-64 rounded-md border border-line-strong px-1.5 text-sm"
                        >
                          <option value="">— choose —</option>
                          {[...new Set(TARGETS.map((t) => t.group))].map((g) => (
                            <optgroup key={g} label={g}>
                              {TARGETS.filter((t) => t.group === g).map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1">{SOURCE_BADGE[mapping[r.account] ? source[r.account] : "none"]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {result && (
        <section data-testid="upload-results">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{exp ? "4" : "3"} · Validation & preview</h4>
          <StatusBadges ok={result.ok} errors={result.errors.length} warnings={result.warnings.length} count={result.months.length} extra={result.restatedMonths.length > 0 && <Badge tone="info">Restates {result.restatedMonths.map(monthLabel).join(", ")}</Badge>} />
          <Issues errors={result.errors} warnings={result.warnings} />
          {result.months.length > 0 && (
            <div className="thin-scroll overflow-x-auto rounded-md border border-line">
              <table className="w-full text-sm" data-testid="upload-preview">
                <thead>
                  <tr className="border-b border-line bg-subtle text-xs text-muted">
                    <th className="px-3 py-1.5 text-left font-medium">What the portfolio will show</th>
                    <th className="px-3 py-1.5 text-right font-medium">Revenue</th>
                    <th className="px-3 py-1.5 text-right font-medium">Gross margin</th>
                    <th className="px-3 py-1.5 text-right font-medium">EBITDA</th>
                    <th className="px-3 py-1.5 text-right font-medium">EBITDA margin</th>
                    <th className="px-3 py-1.5 text-right font-medium">Labor</th>
                    <th className="px-3 py-1.5 text-right font-medium">Op. cash flow</th>
                    <th className="px-3 py-1.5 text-right font-medium">Headcount</th>
                  </tr>
                </thead>
                <tbody>
                  {result.months.map((m) => {
                    const r = m.record;
                    const prev = existing[m.month];
                    const restated = result.restatedMonths.includes(m.month);
                    return (
                      <tr key={m.month} className={cn("border-b border-line/60 last:border-0", restated && "bg-info-soft/40")}>
                        <td className="px-3 py-1.5 text-ink">
                          {monthLabel(m.month)} {restated ? <Badge tone="info">restated</Badge> : prev ? null : <Badge tone="pos">new</Badge>}
                          {restated && prev && <div className="text-[11px] text-muted">was: revenue {fmtUsd(prev.revenue, { decimals: 2 })} · EBITDA {fmtUsd(prev.ebitda, { decimals: 2 })}</div>}
                        </td>
                        <td className="num px-3 py-1.5 text-right">{fmtUsd(r.revenue, { decimals: 2 })}</td>
                        <td className="num px-3 py-1.5 text-right">{fmtPct(r.revenue ? r.grossProfit / r.revenue : null)}</td>
                        <td className="num px-3 py-1.5 text-right">{fmtUsd(r.ebitda, { decimals: 2 })}</td>
                        <td className="num px-3 py-1.5 text-right">{fmtPct(r.revenue ? r.ebitda / r.revenue : null)}</td>
                        <td className="num px-3 py-1.5 text-right">{r.directLabor === null ? "N/A" : fmtUsd(r.directLabor + (r.operatingPersonnel ?? 0), { decimals: 2 })}</td>
                        <td className="num px-3 py-1.5 text-right">{fmtUsd(r.cashFromOperations, { decimals: 2 })}</td>
                        <td className="num px-3 py-1.5 text-right">{m.employees ?? "N/A"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {needsReason && result.ok && (
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-ink-2">Reason for restating {result.restatedMonths.map(monthLabel).join(", ")} (required)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Late supplier invoices booked after the original pack" className="h-8 w-full rounded-md border border-line-strong px-2.5 text-sm focus:border-brand/50 focus:outline-none" data-testid="restatement-reason" />
            </label>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <span className="flex max-w-xl items-start gap-1.5 text-xs text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          An upload delivers consolidated monthly lines as submitted. It cannot provide entity-level books, account-level drill-down, organic vs acquired splits or same-day data. Lines in the template: {LINES.filter((l) => l.kind !== "id").length}.
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!canAccept}
            data-testid="accept-upload"
            onClick={() => {
              const finalMapping = exp ? (Object.fromEntries(Object.entries(mapping).filter(([, v]) => v)) as Record<string, MapTarget>) : undefined;
              accept(company.id, fileName ?? "upload.csv", result!, needsReason ? reason.trim() : null, finalMapping);
              const ms = result!.months.map((m) => m.month);
              onDone(
                `${monthLabel(ms[0])}${ms.length > 1 ? ` – ${monthLabel(ms[ms.length - 1])}` : ""} for ${company.name} ${ms.length > 1 ? "are" : "is"} now part of portfolio reporting${result!.restatedMonths.length ? "; the previous version is kept in the upload history" : ""}.${finalMapping ? ` The account mapping is saved — next month's ${company.accountingSystem} export maps itself.` : ""}`,
              );
            }}
          >
            Accept upload
          </Button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- budget

function Budget({ company, onCancel, onDone }: { company: Company; onCancel: () => void; onDone: (msg: string) => void }) {
  const acceptBudget = useWorkspace((s) => s.acceptBudget);
  // Default: the current calendar year to the latest closed month (budgets are approved per year).
  const [from, setFrom] = useState(LAST_MONTH - (LAST_MONTH % 12));
  const [to, setTo] = useState(LAST_MONTH);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<BudgetResult | null>(null);
  const months = useMemo(() => {
    const out: number[] = [];
    for (let m = Math.min(from, to); m <= Math.max(from, to); m++) out.push(m);
    return out;
  }, [from, to]);
  const existing = getData().budgetsLocal.filter((b) => b.companyId === company.id);
  const range = `${monthKey(months[0])}-to-${monthKey(months[months.length - 1])}`;
  return (
    <>
      <section className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">1 · Get the budget template</h4>
          <p className="text-sm text-ink-2">
            The company&apos;s approved monthly budget: revenue, COGS, operating expenses and EBITDA (checked), optionally cash from operations. It powers budget vs actual for {company.name}. {existing.length ? `A budget is already held for ${existing.length} months — uploaded months replace it.` : "No budget is held yet."}
          </p>
          <MonthRange from={from} to={to} setFrom={setFrom} setTo={setTo} count={months.length} />
        </div>
        <div className="flex flex-col gap-1.5 md:items-end md:pt-5">
          <Button onClick={() => downloadText(`${slug(company.name)}-budget-template-${range}.csv`, buildBudgetTemplate(company, months))} data-testid="download-budget-template">
            <Download className="h-3.5 w-3.5" /> Blank budget template
          </Button>
          <Button variant="ghost" className="text-brand" onClick={() => downloadText(`${slug(company.name)}-budget-example-${range}.csv`, buildBudgetTemplate(company, months, exampleBudget(company, months)))} data-testid="download-budget-example">
            <Download className="h-3.5 w-3.5" /> Example budget (synthetic)
          </Button>
        </div>
      </section>
      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">2 · Upload the budget</h4>
        <DropZone
          fileName={fileName}
          onFile={(f) => {
            setFileName(f.name);
            f.text().then((t) => setResult(validateBudget(t, company, existing)));
          }}
        />
      </section>
      {result && (
        <section data-testid="upload-results">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">3 · Validation & preview</h4>
          <StatusBadges ok={result.ok} errors={result.errors.length} warnings={result.warnings.length} count={result.rows.length} />
          <Issues errors={result.errors} warnings={result.warnings} />
          {result.rows.length > 0 && (
            <div className="thin-scroll overflow-x-auto rounded-md border border-line">
              <table className="w-full text-sm" data-testid="budget-preview">
                <thead>
                  <tr className="border-b border-line bg-subtle text-xs text-muted">
                    <th className="px-3 py-1.5 text-left font-medium">Budget</th>
                    <th className="px-3 py-1.5 text-right font-medium">Revenue</th>
                    <th className="px-3 py-1.5 text-right font-medium">COGS</th>
                    <th className="px-3 py-1.5 text-right font-medium">Opex</th>
                    <th className="px-3 py-1.5 text-right font-medium">EBITDA</th>
                    <th className="px-3 py-1.5 text-right font-medium">EBITDA margin</th>
                    <th className="px-3 py-1.5 text-right font-medium">Op. cash flow</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.month} className="border-b border-line/60 last:border-0">
                      <td className="px-3 py-1.5 text-ink">
                        {monthLabel(r.month)} {result.replacedMonths.includes(r.month) ? <Badge tone="info">replaces</Badge> : <Badge tone="pos">new</Badge>}
                      </td>
                      <td className="num px-3 py-1.5 text-right">{fmtUsd(r.revenue, { decimals: 2 })}</td>
                      <td className="num px-3 py-1.5 text-right">{fmtUsd(r.cogs, { decimals: 2 })}</td>
                      <td className="num px-3 py-1.5 text-right">{fmtUsd(r.operatingExpenses, { decimals: 2 })}</td>
                      <td className="num px-3 py-1.5 text-right">{fmtUsd(r.ebitda, { decimals: 2 })}</td>
                      <td className="num px-3 py-1.5 text-right">{fmtPct(r.revenue ? r.ebitda / r.revenue : null)}</td>
                      <td className="num px-3 py-1.5 text-right">{fmtUsd(r.cashFromOperations, { decimals: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!result?.ok}
          data-testid="accept-budget"
          onClick={() => {
            acceptBudget(company.id, fileName ?? "budget.csv", result!.rows);
            const ms = result!.rows.map((r) => r.month);
            onDone(`Budget for ${monthLabel(ms[0])}${ms.length > 1 ? ` – ${monthLabel(ms[ms.length - 1])}` : ""} is now used for ${company.name}'s budget vs actual.`);
          }}
        >
          Accept budget
        </Button>
      </div>
    </>
  );
}
