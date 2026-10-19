"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Check, Clock, FileSpreadsheet, FileUp, Plug, Plus, Rocket, Timer, X } from "lucide-react";
import { getData } from "@/lib/data";
import { DEMO_TODAY, lastReportedLabel } from "@/lib/data/calendar";
import type { Company } from "@/lib/data/types";
import { analyzeCompany } from "@/lib/engine/company";
import { fmtPct, formatDateTime } from "@/lib/format";
import { useScope } from "@/lib/state/hooks";
import { EFFORT, effortSummary, emptyMigration, STAGE_LABEL } from "@/lib/workspace/migration";
import { useWorkspace } from "@/lib/workspace/store";
import type { MigrationStage } from "@/lib/workspace/types";
import { AddCompanyDialog } from "../companies/AddCompanyDialog";
import { ConnectionBadge, FreshnessDot, QualityBadge, StatusPill } from "../fin/fin";
import { PageHeader } from "../overview/OverviewPage";
import { UploadDialog } from "../uploads/UploadDialog";
import { Badge, Button, CardHeader, Select, Tip } from "../ui/primitives";

const days = (iso: string) => Math.max(0, Math.round((Date.parse(DEMO_TODAY) - Date.parse(iso)) / 86400000));

function DepthCompare({ connected, external }: { connected: Company; external: Company }) {
  const { period } = useScope();
  const submissions = useWorkspace((s) => s.submissions);
  const a = analyzeCompany(connected.id, period);
  const b = analyzeCompany(external.id, period);
  const eff = effortSummary(getData(), submissions, external.id);
  const rows: { label: string; a: React.ReactNode; b: React.ReactNode }[] = [
    { label: "Finance system", a: connected.accountingSystem, b: external.accountingSystem },
    { label: "How figures arrive", a: "Published from the ledger at each close (company-approved scope)", b: "Monthly pack, uploaded by Northbridge" },
    { label: "Sponsor effort", a: "None", b: `~${(eff.hoursPerMonth || EFFORT.hoursPerPack).toFixed(1)} h / month (est.)${eff.reuploads ? ` · ${eff.reuploads} re-upload${eff.reuploads > 1 ? "s" : ""}` : ""}` },
    { label: "Last refresh", a: `${formatDateTime(connected.lastUpdated)} (${days(connected.lastUpdated)}d)`, b: `${formatDateTime(external.lastUpdated)} (${days(external.lastUpdated)}d)` },
    { label: "Data through", a: lastReportedLabel(connected.lastReportedMonth), b: lastReportedLabel(external.lastReportedMonth) },
    { label: "Close timeline", a: connected.closeDays ? `${connected.closeDays} business days` : "—", b: external.closeDays ? `${external.closeDays} business days` : "—" },
    {
      label: "Organic growth when M&A distorts the comparison",
      a: a.yoy?.acquisitions.length ? `${fmtPct(a.yoy.organicRevenueGrowth, { signed: true })} organic vs ${fmtPct(a.yoy.revenueGrowth, { signed: true })} reported` : "Computable from entity ledgers",
      b: b.yoy?.acquisitions.length ? `Not determinable (reported ${fmtPct(b.yoy.revenueGrowth, { signed: true })})` : "Not determinable from consolidated figures",
    },
    { label: "Entity P&L + intercompany eliminations", a: <Check className="h-4 w-4 text-pos" />, b: <X className="h-4 w-4 text-faint" /> },
    { label: "Working-capital / cash bridge", a: <Check className="h-4 w-4 text-pos" />, b: <X className="h-4 w-4 text-faint" /> },
    { label: "Account-level drill-down", a: <Check className="h-4 w-4 text-pos" />, b: <X className="h-4 w-4 text-faint" /> },
    { label: "Data confidence", a: <QualityBadge q={connected.dataQuality} />, b: <QualityBadge q={external.dataQuality} /> },
  ];
  return (
    <table className="w-full text-sm" data-testid="depth-compare">
      <thead>
        <tr className="border-b border-line text-xs text-muted">
          <th className="w-[30%] px-4 py-2 text-left font-medium" />
          <th className="px-3 py-2 text-left font-medium">
            <Link href={`/companies/${connected.id}`} className="text-sm font-semibold text-ink hover:text-brand">
              {connected.name}
            </Link>{" "}
            <ConnectionBadge company={connected} compact />
          </th>
          <th className="px-3 py-2 text-left font-medium">
            <Link href={`/companies/${external.id}`} className="text-sm font-semibold text-ink hover:text-brand">
              {external.name}
            </Link>{" "}
            <ConnectionBadge company={external} compact />
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-line/60 last:border-0">
            <td className="px-4 py-2 text-muted">{r.label}</td>
            <td className="px-3 py-2 text-ink-2">{r.a}</td>
            <td className="px-3 py-2 text-ink-2">{r.b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const PIPELINE: MigrationStage[] = ["not_started", "introduced", "call_booked", "call_held", "evaluating", "migrating", "connected", "declined"];

export function ConnectionsPage() {
  const { period, data } = useScope();
  const ws = useWorkspace();
  const [add, setAdd] = useState(false);
  const [upload, setUpload] = useState<Company | null>(null);
  const connected = data.companies.filter((c) => c.connection === "dualentry" && c.lastReportedMonth >= 0);
  const uploads = data.companies.filter((c) => c.connection === "upload");
  const external = uploads.filter((c) => c.lastReportedMonth >= 0);
  const [left, setLeft] = useState("northstar-systems");
  const [right, setRight] = useState("meridian-services");
  const leftCo = data.companyById.get(left) ?? connected[0];
  const rightCo = data.companyById.get(right) ?? external[0];
  const analyses = useMemo(() => data.companies.map((c) => ({ c, a: analyzeCompany(c.id, period) })), [data.companies, period]);
  const effort = effortSummary(data, ws.submissions);
  const awaiting = data.companies.filter((c) => c.lastReportedMonth < 0).length;
  const complete = analyses.filter((x) => x.a.current.status === "complete").length;
  // Pipeline covers companies still on uploads plus those that migrated through it.
  const pipelineCos = data.companies.filter((c) => c.connection === "upload" || ws.migration[c.id]);
  const stageOf = (id: string) => (ws.migration[id] ?? emptyMigration(id)).stage;
  const counts = PIPELINE.map((s) => ({ s, n: pipelineCos.filter((c) => stageOf(c.id) === s).length })).filter((x) => x.n > 0);
  const sandboxes = pipelineCos.filter((c) => ws.migration[c.id]?.sandbox).length;

  return (
    <div className="space-y-4">
      <PageHeader title="Data Connections" subtitle="How each company's figures reach Northbridge — and what each route can and can't deliver.">
        <Button variant="primary" onClick={() => setAdd(true)} data-testid="add-company">
          <Plus className="h-3.5 w-3.5" /> Add portfolio company
        </Button>
      </PageHeader>

      <div className="grid gap-3 md:grid-cols-4">
        {[
          { icon: Plug, label: "DualEntry · live", n: connected.length, sub: `Published at close · avg. close ${effort.avgDaysDualEntry?.toFixed(1) ?? "—"} business days`, tone: "text-brand" },
          { icon: FileSpreadsheet, label: "Uploaded by Northbridge", n: uploads.filter((c) => c.lastReportedMonth >= 0).length, sub: `Arrives ~${effort.avgDaysUpload ? Math.round(effort.avgDaysUpload) : "—"} business days after month-end`, tone: "text-ink-2" },
          { icon: Clock, label: "Awaiting data", n: awaiting, sub: "Added; first upload or approval pending", tone: "text-info" },
          { icon: Check, label: `${period.label} complete`, n: `${complete}/${data.companies.length}`, sub: "Every month submitted or synced", tone: "text-pos" },
        ].map((t) => (
          <div key={t.label} className="rounded-lg border border-line bg-surface p-4 shadow-card">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <t.icon className={`h-3.5 w-3.5 ${t.tone}`} /> {t.label}
            </div>
            <div className="num mt-1 text-2xl font-semibold text-ink">{t.n}</div>
            <div className="text-xs text-muted">{t.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface shadow-card" data-testid="effort-panel">
          <CardHeader
            title={
              <span className="flex items-center gap-1.5">
                <Timer className="h-4 w-4 text-muted" /> Manual reporting effort
              </span>
            }
            description={`Northbridge uploads the monthly pack for ${effort.uploadCompanies} compan${effort.uploadCompanies === 1 ? "y" : "ies"} · last ${EFFORT.windowMonths} months`}
          />
          <div className="grid grid-cols-3 gap-px bg-line">
            {[
              ["Effort", `~${effort.hoursPerMonth.toFixed(1)} h / month`, `Estimate: ${EFFORT.hoursPerPack} h per pack + ${EFFORT.hoursPerReupload} h per re-upload`],
              ["Re-uploads", String(effort.reuploads), "Restated packs in the window"],
              ["Timeliness", `${effort.avgDaysUpload ? Math.round(effort.avgDaysUpload) : "—"} vs ${effort.avgDaysDualEntry ? Math.round(effort.avgDaysDualEntry) : "—"} days`, "Upload vs DualEntry, business days after month-end"],
            ].map(([k, v, sub]) => (
              <div key={k} className="bg-surface px-4 py-3">
                <div className="text-[11px] text-muted">{k}</div>
                <div className="num text-lg font-semibold text-ink">{v}</div>
                <div className="text-[11px] text-muted">{sub}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface shadow-card" data-testid="pipeline-panel">
          <CardHeader
            title={
              <span className="flex items-center gap-1.5">
                <Rocket className="h-4 w-4 text-brand" /> Explore DualEntry — portfolio pipeline
              </span>
            }
            description="Where each upload company stands after its DualEntry invite. Northbridge sees milestones only."
          />
          <div className="flex flex-wrap gap-2 px-4 py-3" data-testid="pipeline-summary">
            {counts.map(({ s, n }) => (
              <span key={s} className="rounded-md border border-line bg-subtle px-2 py-1 text-xs">
                <span className="num font-semibold text-ink">{n}</span> <span className="text-muted">{STAGE_LABEL[s].toLowerCase()}</span>
              </span>
            ))}
            {sandboxes > 0 && (
              <span className="rounded-md border border-brand/20 bg-brand-soft/50 px-2 py-1 text-xs">
                <span className="num font-semibold text-ink">{sandboxes}</span> <span className="text-muted">opened the sandbox</span>
              </span>
            )}
          </div>
          <div className="border-t border-line px-4 py-2">
            {pipelineCos
              .filter((c) => stageOf(c.id) !== "not_started")
              .map((c) => (
                <Link key={c.id} href={`/companies/${c.id}#explore`} className="flex items-center justify-between py-1 text-sm hover:text-brand">
                  <span className="text-ink">{c.name}</span>
                  <span className="text-xs text-muted">
                    {STAGE_LABEL[stageOf(c.id)]}
                    {ws.migration[c.id]?.booking && stageOf(c.id) === "call_booked" ? ` · ${new Date(`${ws.migration[c.id]!.booking!.slot}:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : ""}
                    {ws.migration[c.id]?.sandbox ? " · sandbox" : ""} <ArrowRight className="inline h-3 w-3" />
                  </span>
                </Link>
              ))}
          </div>
        </div>
      </div>

      {leftCo && rightCo && (
        <div className="rounded-lg border border-line bg-surface shadow-card">
          <CardHeader
            title="What a ledger connection changes"
            description="Same portfolio, same period — the difference is how much Northbridge can see, how quickly, and at what effort."
            actions={
              <>
                <Select ariaLabel="Connected company" value={leftCo.id} onChange={setLeft} options={connected.map((c) => ({ value: c.id, label: c.name }))} />
                <span className="text-xs text-muted">vs</span>
                <Select ariaLabel="External company" value={rightCo.id} onChange={setRight} options={external.map((c) => ({ value: c.id, label: c.name }))} />
              </>
            }
          />
          <DepthCompare connected={leftCo} external={rightCo} />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-subtle/50 px-4 py-2.5">
            <span className="text-xs text-muted">These are limits of a file, not deliberate restrictions. Moving to DualEntry is the company&apos;s decision.</span>
            <Link href={`/companies/${rightCo.id}#explore`} className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline" data-testid="explore-from-connections">
              Explore DualEntry for {rightCo.name} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-line bg-surface shadow-card" data-testid="connections-table">
        <CardHeader title="Connection inventory" description={`Reporting status for ${period.label} · freshness standard 30 days`} />
        <div className="thin-scroll overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead>
              <tr className="border-b border-line bg-subtle text-xs text-muted">
                <th className="px-4 py-2 text-left font-medium">Company</th>
                <th className="px-3 py-2 text-left font-medium">Connection</th>
                <th className="px-3 py-2 text-left font-medium">Last refresh</th>
                <th className="px-3 py-2 text-left font-medium">Data through</th>
                <th className="px-3 py-2 text-left font-medium">{period.label}</th>
                <th className="px-3 py-2 text-left font-medium">Gaps</th>
                <th className="px-3 py-2 text-left font-medium">Explore DualEntry</th>
                <th className="px-4 py-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {analyses.map(({ c, a }) => {
                const pendingReq = ws.requests.find((r) => r.companyId === c.id && r.status === "pending");
                return (
                  <tr key={c.id} className="border-b border-line/60" data-testid={`conn-row-${c.id}`}>
                    <td className="whitespace-nowrap px-4 py-2">
                      <Link href={`/companies/${c.id}`} className="font-medium text-ink hover:text-brand">
                        {c.name}
                      </Link>
                      {c.userAdded && <Badge tone="info" className="ml-1.5">Added</Badge>}
                      <div className="text-[11px] text-muted">
                        {c.financeLead.name} · {c.financeLead.title}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <ConnectionBadge company={c} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <FreshnessDot company={c} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-2">{lastReportedLabel(c.lastReportedMonth)}</td>
                    <td className="px-3 py-2">
                      <StatusPill status={a.current.status} months={a.current.monthsAvailable} expected={a.current.monthsExpected} awaiting={c.lastReportedMonth < 0} />
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {c.missingFields.length ? (
                        <Tip content={<ul className="list-disc pl-4">{c.missingFields.map((f) => <li key={f}>{f}</li>)}</ul>}>
                          <span className="cursor-help">
                            <Badge tone={c.missingFields.some((f) => /Q3|September|Budget|Labor/.test(f)) ? "warn" : "neutral"}>
                              {c.missingFields.length} gap{c.missingFields.length === 1 ? "" : "s"}
                            </Badge>
                          </span>
                        </Tip>
                      ) : (
                        <span className="text-faint">None</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">
                      {c.connection === "upload" || ws.migration[c.id] ? (
                        <Link href={`/companies/${c.id}#explore`} className="text-ink-2 hover:text-brand">
                          {STAGE_LABEL[stageOf(c.id)]}
                        </Link>
                      ) : (
                        <span className="text-faint">On DualEntry</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      {c.connection === "upload" ? (
                        <Button size="xs" onClick={() => setUpload(c)} data-testid={`upload-${c.id}`}>
                          <FileUp className="h-3 w-3" /> Upload
                        </Button>
                      ) : pendingReq ? (
                        <Link href={`/companies/${c.id}`} className="text-xs font-medium text-info hover:underline">
                          Awaiting approval
                        </Link>
                      ) : (
                        <Link href={`/companies/${c.id}`} className="text-xs text-muted hover:text-brand">
                          View share scope
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <AddCompanyDialog open={add} onOpenChange={setAdd} />
      {upload && <UploadDialog company={upload} open onOpenChange={(v) => !v && setUpload(null)} />}
    </div>
  );
}
