"use client";
import { useState } from "react";
import { CalendarCheck, CheckCircle2, FlaskConical } from "lucide-react";
import { cn } from "@/lib/cn";
import { getData } from "@/lib/data";
import { DEMO_TODAY } from "@/lib/data/calendar";
import { formatDate } from "@/lib/format";
import { bookingSlots, linkExpiry, repById } from "@/lib/workspace/migration";
import { useWorkspace } from "@/lib/workspace/store";
import { Button } from "../ui/primitives";
import { ExternalFrame } from "./ExternalFrame";

const fmtSlot = (slot: string) => new Date(`${slot}:00Z`).toLocaleString("en-US", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const input = "h-8 w-full rounded-md border border-line-strong px-2.5 text-sm";

/** What the CFO sees from the invite link: book a demo with the routed rep, and/or open a sandbox with sample data. */
export function InvitePage({ token }: { token: string }) {
  const migration = useWorkspace((s) => Object.values(s.migration).find((m) => m.token === token));
  const book = useWorkspace((s) => s.bookCall);
  const openSandbox = useWorkspace((s) => s.openSandbox);
  const notNow = useWorkspace((s) => s.notNow);
  const company = migration ? getData().companyById.get(migration.companyId) : undefined;
  const rep = repById(migration?.repId ?? null);
  const [slot, setSlot] = useState<string | null>(null);
  const [name, setName] = useState(company?.financeLead.name ?? "");
  const [email, setEmail] = useState(company?.financeLead.email ?? "");
  const [reschedule, setReschedule] = useState(false);

  if (!migration || !company || !rep || !migration.introducedAt)
    return (
      <ExternalFrame label="Invitation">
        <div className="rounded-lg border border-line bg-surface p-8 text-center" data-testid="invite-invalid">
          <p className="font-medium text-ink">This link isn&apos;t valid</p>
          <p className="mt-1 text-sm text-muted">Ask the person who invited you for a new link.</p>
        </div>
      </ExternalFrame>
    );
  const expired = Date.parse(linkExpiry(migration.introducedAt)) < Date.parse(`${DEMO_TODAY}T00:00:00Z`);
  const booked = migration.booking && !reschedule;
  const repFirst = rep.name.split(" ")[0];
  const validContact = name.trim().length > 1 && email.includes("@");

  return (
    <ExternalFrame label="Invitation" wide>
      <div className="space-y-5" data-testid="invite-page">
        <div>
          <p className="text-sm text-muted">Northbridge Equity Partners invited {company.name} to explore DualEntry</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Hi {company.financeLead.name.split(" ")[0]} — see how DualEntry would run {company.name}&apos;s finance</h1>
        </div>

        {expired ? (
          <div className="rounded-lg border border-line bg-surface p-6 text-center text-sm text-muted">This link expired. Ask Northbridge to resend the invite.</div>
        ) : (
          <>
            <div className="grid gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-xs text-muted">Your name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-muted">Work email</span>
                <input value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
              {/* Demo with the routed rep */}
              <section className="rounded-lg border border-line bg-surface p-5" data-testid="demo-section">
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand-ink">{rep.name.split(" ").map((x) => x[0]).join("")}</span>
                  <div className="text-sm">
                    <div className="flex items-center gap-1.5 font-semibold text-ink">
                      <CalendarCheck className="h-4 w-4 text-brand" /> Book a 30-minute demo with {rep.name}
                    </div>
                    <div className="text-muted">{rep.title}</div>
                  </div>
                </div>
                {booked ? (
                  <div className="rounded-md border border-pos/30 bg-pos-soft/50 p-5 text-center" data-testid="booking-confirmed">
                    <CheckCircle2 className="mx-auto h-8 w-8 text-pos" />
                    <p className="mt-2 font-semibold text-ink">You&apos;re booked with {repFirst}</p>
                    <p className="text-sm text-ink-2">{fmtSlot(migration.booking!.slot)} (UTC) · invitation sent to {migration.booking!.email}</p>
                    <Button className="mt-3" onClick={() => setReschedule(true)}>
                      Reschedule
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="mb-3 text-xs text-muted">
                      {repFirst} will cover your close{company.entityCount > 1 ? ` across ${company.entityCount} entities` : ""}, moving from {company.accountingSystem}, and what you&apos;d share with Northbridge — always your choice. Times in UTC.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-5" data-testid="slots">
                      {bookingSlots().map((d) => (
                        <div key={d.day}>
                          <div className="mb-1 text-xs font-medium text-ink-2">{new Date(`${d.day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}</div>
                          <div className="space-y-1">
                            {d.times.map((t) => {
                              const s = `${d.day}T${t}`;
                              return (
                                <button key={s} onClick={() => setSlot(s)} className={cn("w-full rounded-md border px-2 py-1 text-sm", slot === s ? "border-brand bg-brand text-white" : "border-line text-ink-2 hover:border-brand/40")} data-testid="slot">
                                  {t}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex justify-end">
                      <Button
                        variant="primary"
                        disabled={!slot || !validContact}
                        data-testid="confirm-booking"
                        onClick={() => {
                          book(token, slot!, name.trim(), email.trim());
                          setReschedule(false);
                        }}
                      >
                        Confirm demo
                      </Button>
                    </div>
                  </>
                )}
              </section>

              {/* Sandbox */}
              <section className="flex flex-col rounded-lg border border-line bg-surface p-5" data-testid="sandbox-section">
                <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <FlaskConical className="h-4 w-4 text-brand" /> Try DualEntry in a sandbox
                </div>
                {migration.sandbox ? (
                  <div className="rounded-md border border-pos/30 bg-pos-soft/50 p-4 text-center" data-testid="sandbox-ready">
                    <CheckCircle2 className="mx-auto h-8 w-8 text-pos" />
                    <p className="mt-2 font-semibold text-ink">Your sandbox is ready</p>
                    <p className="text-sm text-ink-2">Sign-in link sent to {migration.sandbox.email}. Available for 30 days.</p>
                  </div>
                ) : (
                  <>
                    <ul className="mb-4 list-disc space-y-1 pl-4 text-sm text-ink-2">
                      <li>A sample {company.entityCount > 1 ? "multi-entity " : ""}company with 12 months of transactions</li>
                      <li>Run a month-end close, consolidation and reports yourself</li>
                      <li>Sample data only — none of {company.name}&apos;s figures, nothing shared with Northbridge</li>
                    </ul>
                    <Button className="mt-auto self-start" variant="primary" disabled={!validContact} onClick={() => openSandbox(token, name.trim(), email.trim())} data-testid="open-sandbox">
                      Open my sandbox
                    </Button>
                  </>
                )}
              </section>
            </div>

            {migration.stage === "declined" ? (
              <p className="rounded-md bg-subtle px-3 py-2 text-sm text-ink-2" data-testid="not-now-done">
                Thanks — we&apos;ve let Northbridge know it&apos;s not the right time. You can still book or open the sandbox here later.
              </p>
            ) : (
              !migration.booking &&
              !migration.sandbox && (
                <button className="text-sm text-muted hover:underline" onClick={() => notNow(token)} data-testid="not-now">
                  Not the right time
                </button>
              )
            )}
          </>
        )}
        <p className="text-[11px] text-muted">Link valid until {formatDate(linkExpiry(migration.introducedAt))}. No financial information about {company.name} is shown on this page.</p>
      </div>
    </ExternalFrame>
  );
}
