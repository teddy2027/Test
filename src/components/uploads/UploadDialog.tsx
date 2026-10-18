"use client";
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileUp, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { getData } from "@/lib/data";
import { LAST_MONTH, monthKey, monthLabel } from "@/lib/data/calendar";
import type { Company } from "@/lib/data/types";
import { buildTemplate, LINES, nextMonthsToUpload, recordToValues, validateUpload, type MonthValues, type UploadResult } from "@/lib/workspace/csv";
import { buildAddedCompany, fullHistoryForSeeded } from "@/lib/workspace/synth";
import { useWorkspace } from "@/lib/workspace/store";
import { downloadText, slug } from "@/lib/export";
import { fmtPct, fmtUsd } from "@/lib/format";
import { Badge, Button, Dialog, Tip } from "../ui/primitives";

export function UploadDialog({ company, open, onOpenChange }: { company: Company; open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Upload monthly figures · ${company.name}`} description="Northbridge uploads the company's monthly pack on its behalf. Every upload is validated before it reaches the portfolio." className="w-[min(960px,calc(100vw-32px))]">
      {open && <Body company={company} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function exampleValues(company: Company, months: number[]): Record<number, MonthValues> {
  const added = useWorkspace.getState().companies.find((c) => c.company.id === company.id);
  const built = added ? buildAddedCompany(company, added.input) : fullHistoryForSeeded(company.id);
  const out: Record<number, MonthValues> = {};
  if (!built) return out;
  for (const m of months) {
    const r = built.monthlyLocal.find((x) => x.month === m);
    if (r) out[m] = recordToValues(r, built.operational.find((o) => o.month === m));
  }
  return out;
}

function Body({ company, onDone }: { company: Company; onDone: () => void }) {
  const accept = useWorkspace((s) => s.acceptUpload);
  const added = useWorkspace((s) => s.companies.find((c) => c.company.id === company.id));
  const suggested = nextMonthsToUpload(company, added?.input.historyFrom ?? 21);
  const [from, setFrom] = useState(suggested[0]);
  const [to, setTo] = useState(suggested[suggested.length - 1]);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const months = useMemo(() => {
    const out: number[] = [];
    for (let m = Math.min(from, to); m <= Math.max(from, to); m++) out.push(m);
    return out;
  }, [from, to]);
  const existing = getData().monthlyLocalByCompany.get(company.id) ?? [];
  const allMonths = Array.from({ length: LAST_MONTH + 1 }, (_, i) => i).reverse();

  const readFile = (f: File) => {
    setFileName(f.name);
    setDone(null);
    f.text().then((t) => setResult(validateUpload(t, company, existing)));
  };
  const needsReason = !!result && result.restatedMonths.length > 0;
  const canAccept = !!result?.ok && (!needsReason || reason.trim().length >= 5);

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
      <section className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">1 · Get the template</h4>
          <p className="text-sm text-ink-2">
            One row per line item, one column per month, amounts in {company.baseCurrency} (whole units). Control totals (revenue, COGS, gross profit, EBITDA) are cross-checked automatically.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Months</span>
            <select aria-label="From month" value={from} onChange={(e) => setFrom(Number(e.target.value))} className="h-8 rounded-md border border-line-strong px-2 text-sm">
              {allMonths.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
            <span className="text-muted">to</span>
            <select aria-label="To month" value={to} onChange={(e) => setTo(Number(e.target.value))} className="h-8 rounded-md border border-line-strong px-2 text-sm">
              {allMonths.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
            <span className="text-xs text-faint">({months.length} month{months.length === 1 ? "" : "s"})</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 md:items-end md:pt-5">
          <Button onClick={() => downloadText(`${slug(company.name)}-template-${monthKey(months[0])}-to-${monthKey(months[months.length - 1])}.csv`, buildTemplate(company, months))} data-testid="download-template">
            <Download className="h-3.5 w-3.5" /> Download blank template
          </Button>
          <Tip content="A pack pre-filled with synthetic figures for this company, so you can try the upload without a real file.">
            <Button variant="ghost" className="text-brand" onClick={() => downloadText(`${slug(company.name)}-example-${monthKey(months[0])}-to-${monthKey(months[months.length - 1])}.csv`, buildTemplate(company, months, exampleValues(company, months)))} data-testid="download-example">
              <Download className="h-3.5 w-3.5" /> Download example file (synthetic)
            </Button>
          </Tip>
        </div>
      </section>

      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">2 · Upload the completed file</h4>
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
            if (f) readFile(f);
          }}
          className={cn("flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center", drag ? "border-brand bg-brand-soft/40" : "border-line-strong bg-subtle/50")}
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
              if (f) readFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </section>

      {result && (
        <section data-testid="upload-results">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">3 · Validation & preview</h4>
          <div className="mb-3 flex flex-wrap gap-2">
            {result.ok ? (
              <Badge tone="pos">
                <CheckCircle2 className="h-3 w-3" /> Passed — {result.months.length} month{result.months.length === 1 ? "" : "s"}
              </Badge>
            ) : (
              <Badge tone="neg">
                <XCircle className="h-3 w-3" /> {result.errors.length} error{result.errors.length === 1 ? "" : "s"} — fix and re-upload
              </Badge>
            )}
            {result.warnings.length > 0 && (
              <Badge tone="warn">
                <AlertTriangle className="h-3 w-3" /> {result.warnings.length} warning{result.warnings.length === 1 ? "" : "s"}
              </Badge>
            )}
            {result.restatedMonths.length > 0 && <Badge tone="info">Restates {result.restatedMonths.map(monthLabel).join(", ")}</Badge>}
          </div>
          {(result.errors.length > 0 || result.warnings.length > 0) && (
            <ul className="mb-3 max-h-44 space-y-1 overflow-y-auto rounded-md border border-line p-2 text-xs" data-testid="upload-issues">
              {result.errors.map((e) => (
                <li key={e.message} className="flex gap-1.5 text-neg">
                  <XCircle className="mt-0.5 h-3 w-3 shrink-0" /> {e.message}
                </li>
              ))}
              {result.warnings.map((w) => (
                <li key={w.message} className="flex gap-1.5 text-warn">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {w.message}
                </li>
              ))}
            </ul>
          )}
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
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!canAccept}
            data-testid="accept-upload"
            onClick={() => {
              accept(company.id, fileName ?? "upload.csv", result!, needsReason ? reason.trim() : null);
              const ms = result!.months.map((m) => m.month);
              setDone(`${monthLabel(ms[0])}${ms.length > 1 ? ` – ${monthLabel(ms[ms.length - 1])}` : ""} for ${company.name} ${ms.length > 1 ? "are" : "is"} now part of portfolio reporting${result!.restatedMonths.length ? "; the previous version is kept in the upload history" : ""}.`);
            }}
          >
            Accept upload
          </Button>
        </div>
      </div>
    </div>
  );
}
