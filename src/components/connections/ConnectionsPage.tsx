"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Clock, Database, FileSpreadsheet, Mail, Plug, Plus, Rocket, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { getData } from "@/lib/data";
import { DEMO_TODAY, monthLabel } from "@/lib/data/calendar";
import type { Company } from "@/lib/data/types";
import { analyzeCompany } from "@/lib/engine/company";
import { fmtPct, formatDateTime } from "@/lib/format";
import { useScope } from "@/lib/state/hooks";
import { ConnectionBadge, FreshnessDot, QualityBadge, StatusPill } from "../fin/fin";
import { PageHeader } from "../overview/OverviewPage";
import { Badge, Button, CardHeader, Select, Tip } from "../ui/primitives";
import { ExploreDualEntryDialog } from "./ExploreDialog";
import { OnboardingWizard, type Method } from "./OnboardingWizard";

const days = (iso: string) => Math.round((Date.parse(DEMO_TODAY) - Date.parse(iso)) / 86400000);

function DepthCompare({ connected, external }: { connected: Company; external: Company }) {
  const { period } = useScope();
  const a = analyzeCompany(connected.id, period);
  const b = analyzeCompany(external.id, period);
  const rows: { label: string; a: React.ReactNode; b: React.ReactNode }[] = [
    { label: "Finance system", a: connected.accountingSystem, b: external.accountingSystem },
    { label: "How data arrives", a: "Authorized ledger sync (read-only)", b: external.connection === "upload" ? "Monthly template upload" : "Emailed reporting pack" },
    { label: "Last refresh", a: `${formatDateTime(connected.lastUpdated)} (${days(connected.lastUpdated)}d)`, b: `${formatDateTime(external.lastUpdated)} (${days(external.lastUpdated)}d)` },
    { label: "Data through", a: monthLabel(connected.lastReportedMonth), b: monthLabel(external.lastReportedMonth) },
    { label: "Close timeline", a: `${connected.closeDays} business days`, b: external.closeDays ? `${external.closeDays} business days` : "—" },
    {
      label: "Organic growth when M&A distorts the comparison",
      a: a.yoy?.acquisitions.length ? `${fmtPct(a.yoy.organicRevenueGrowth, { signed: true })} organic vs ${fmtPct(a.yoy.revenueGrowth, { signed: true })} reported` : "Computable from entity ledgers",
      b: b.yoy?.acquisitions.length ? `Not determinable (reported ${fmtPct(b.yoy.revenueGrowth, { signed: true })})` : "Not determinable from consolidated upload",
    },
    { label: "Entity P&L + intercompany eliminations", a: <Check className="h-4 w-4 text-pos" />, b: <X className="h-4 w-4 text-faint" /> },
    { label: "Working-capital / cash bridge", a: <Check className="h-4 w-4 text-pos" />, b: <X className="h-4 w-4 text-faint" /> },
    { label: "Account-level drill-down from any metric", a: <Check className="h-4 w-4 text-pos" />, b: <X className="h-4 w-4 text-faint" /> },
    { label: "Data confidence", a: <QualityBadge q={connected.dataQuality} />, b: <QualityBadge q={external.dataQuality} /> },
  ];
  return (
    <table className="w-full text-sm" data-testid="depth-compare">
      <thead>
        <tr className="border-b border-line text-xs text-muted">
          <th className="w-[34%] px-4 py-2 text-left font-medium" />
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

export function ConnectionsPage() {
  const { period } = useScope();
  const data = getData();
  const [wizard, setWizard] = useState<{ open: boolean; company: string | null }>({ open: false, company: null });
  const [explore, setExplore] = useState<Company | null>(null);
  const [pending, setPending] = useState<Record<string, Method>>({});
  const connected = data.companies.filter((c) => c.connection === "dualentry");
  const external = data.companies.filter((c) => c.connection !== "dualentry");
  const [left, setLeft] = useState("northstar-systems");
  const [right, setRight] = useState("meridian-services");
  const analyses = useMemo(() => data.companies.map((c) => ({ c, a: analyzeCompany(c.id, period) })), [data.companies, period]);
  const counts = {
    dualentry: connected.length,
    upload: data.companies.filter((c) => c.connection === "upload").length,
    not: data.companies.filter((c) => c.connection === "not_connected").length,
  };
  const avgFresh = (cs: Company[]) => (cs.length ? Math.round(cs.reduce((s, c) => s + days(c.lastUpdated), 0) / cs.length) : 0);
  const avgClose = (cs: Company[]) => {
    const v = cs.filter((c) => c.closeDays).map((c) => c.closeDays!);
    return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : "—";
  };
  const complete = analyses.filter((x) => x.a.current.status === "complete").length;

  return (
    <div className="space-y-4">
      <PageHeader title="Data Connections" subtitle="Onboard portfolio companies, control what is shared, and see how reporting depth differs by connection type.">
        <Button variant="primary" onClick={() => setWizard({ open: true, company: null })} data-testid="open-wizard">
          <Plus className="h-3.5 w-3.5" /> Connect a company
        </Button>
      </PageHeader>

      <div className="grid gap-3 md:grid-cols-4">
        {[
          { icon: Plug, label: "DualEntry connected", n: counts.dualentry, sub: `Avg. freshness ${avgFresh(connected)}d · avg. close ${avgClose(connected)} days`, tone: "text-brand" },
          { icon: FileSpreadsheet, label: "Standardized upload", n: counts.upload, sub: `Avg. freshness ${avgFresh(data.companies.filter((c) => c.connection === "upload"))}d · avg. close ${avgClose(data.companies.filter((c) => c.connection === "upload"))} days`, tone: "text-ink-2" },
          { icon: Database, label: "Not connected", n: counts.not, sub: `Emailed packs · avg. freshness ${avgFresh(data.companies.filter((c) => c.connection === "not_connected"))}d`, tone: "text-warn" },
          { icon: Clock, label: `${period.label} complete`, n: `${complete}/${data.companies.length}`, sub: "Companies with every month submitted", tone: "text-pos" },
        ].map((t) => (
          <div key={t.label} className="rounded-lg border border-line bg-surface p-4 shadow-card">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <t.icon className={cn("h-3.5 w-3.5", t.tone)} /> {t.label}
            </div>
            <div className="num mt-1 text-2xl font-semibold text-ink">{t.n}</div>
            <div className="text-xs text-muted">{t.sub}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-line bg-surface shadow-card">
        <CardHeader
          title="What a ledger connection changes"
          description="Same portfolio, same period — the difference is how much the sponsor can see, and how quickly."
          actions={
            <>
              <Select ariaLabel="Connected company" value={left} onChange={setLeft} options={connected.map((c) => ({ value: c.id, label: c.name }))} />
              <span className="text-xs text-muted">vs</span>
              <Select ariaLabel="External company" value={right} onChange={setRight} options={external.map((c) => ({ value: c.id, label: c.name }))} />
            </>
          }
        />
        <DepthCompare connected={data.companyById.get(left)!} external={data.companyById.get(right)!} />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-subtle/50 px-4 py-2.5">
          <span className="text-xs text-muted">Finance-system modernization is optional and company-led. Evaluations are based on system needs, never on financial performance.</span>
          <Button size="sm" variant="subtle" onClick={() => setExplore(data.companyById.get(right)!)} data-testid="explore-from-connections">
            <Rocket className="h-3.5 w-3.5" /> Explore DualEntry for {data.companyById.get(right)!.name}
          </Button>
        </div>
      </div>

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
                <th className="px-3 py-2 text-left font-medium">Budget</th>
                <th className="px-3 py-2 text-left font-medium">Missing fields</th>
                <th className="px-3 py-2 text-left font-medium">Confidence</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {analyses.map(({ c, a }) => (
                <tr key={c.id} className="border-b border-line/60" data-testid={`conn-row-${c.id}`}>
                  <td className="whitespace-nowrap px-4 py-2">
                    <Link href={`/companies/${c.id}`} className="font-medium text-ink hover:text-brand">
                      {c.name}
                    </Link>
                    <div className="text-[11px] text-muted">
                      {c.financeLead.name} · {c.financeLead.title}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <ConnectionBadge company={c} />
                    {pending[c.id] && <Badge tone="info" className="ml-1">{pending[c.id] === "invite" ? "Invitation prepared" : "Pending activation"}</Badge>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <FreshnessDot company={c} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-2">{monthLabel(c.lastReportedMonth)}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={a.current.status} months={a.current.monthsAvailable} expected={a.current.monthsExpected} />
                  </td>
                  <td className="px-3 py-2 text-ink-2">{a.budget.status === "complete" ? (a.budget.cfo === null ? "P&L only" : "Complete") : <span className="text-warn">Missing</span>}</td>
                  <td className="px-3 py-2 text-xs">
                    {c.missingFields.length ? (
                      <Tip content={<ul className="list-disc pl-4">{c.missingFields.map((f) => <li key={f}>{f}</li>)}</ul>}>
                        <span className="cursor-help">
                          <Badge tone={c.missingFields.some((f) => /Q3|September|Budget|Labor/.test(f)) ? "warn" : "neutral"}>{c.missingFields.length} gap{c.missingFields.length === 1 ? "" : "s"}</Badge>
                        </span>
                      </Tip>
                    ) : (
                      <span className="text-faint">None</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <QualityBadge q={c.dataQuality} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    {c.connection === "not_connected" ? (
                      <Button size="xs" variant="primary" onClick={() => setWizard({ open: true, company: c.id })} data-testid={`invite-${c.id}`}>
                        <Mail className="h-3 w-3" /> Invite finance lead
                      </Button>
                    ) : (
                      <Button size="xs" onClick={() => setWizard({ open: true, company: c.id })}>
                        Manage
                      </Button>
                    )}
                    {c.connection !== "dualentry" && (
                      <Button size="xs" variant="ghost" className="ml-1 text-brand" onClick={() => setExplore(c)} data-testid={`explore-${c.id}`}>
                        Explore DualEntry
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <OnboardingWizard
        open={wizard.open}
        onOpenChange={(v) => setWizard({ open: v, company: v ? wizard.company : null })}
        initialCompany={wizard.company}
        onComplete={(id, m) => setPending({ ...pending, [id]: m })}
      />
      <ExploreDualEntryDialog company={explore} open={!!explore} onOpenChange={(v) => !v && setExplore(null)} />
    </div>
  );
}
