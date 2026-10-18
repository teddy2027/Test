"use client";
import Link from "next/link";
import { useState } from "react";
import { CalendarCheck, CheckCircle2, FlaskConical } from "lucide-react";
import { cn } from "@/lib/cn";
import { getData } from "@/lib/data";
import { DEMO_TODAY } from "@/lib/data/calendar";
import { formatDate } from "@/lib/format";
import { bookingSlots, linkExpiry, repById } from "@/lib/workspace/migration";
import { useWorkspace } from "@/lib/workspace/store";
import { Button } from "../ui/primitives";

export function ExternalFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-3">
          <span className="text-[17px] font-semibold tracking-tight text-ink">DualEntry</span>
          <span className="text-sm text-muted">{label}</span>
          <span className="ml-auto inline-flex items-center gap-1 rounded border border-warn/30 bg-warn-soft px-1.5 py-0.5 text-[11px] font-medium text-warn">
            <FlaskConical className="h-3 w-3" /> Simulated page · concept demo
          </span>
        </div>
      </div>
      <div className="mx-auto max-w-3xl px-5 py-8">{children}</div>
      <p className="pb-8 text-center text-[11px] text-faint">
        Prototype only — not a DualEntry page. All people and companies are fictional.{" "}
        <Link href="/connections" className="text-brand hover:underline">
          Back to Portfolio Intelligence
        </Link>
      </p>
    </div>
  );
}

const fmtSlot = (slot: string) => new Date(`${slot}:00Z`).toLocaleString("en-US", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

export function BookingPage({ token }: { token: string }) {
  const migration = useWorkspace((s) => Object.values(s.migration).find((m) => m.token === token));
  const book = useWorkspace((s) => s.bookCall);
  const respond = useWorkspace((s) => s.cfoResponse);
  const company = migration ? getData().companyById.get(migration.companyId) : undefined;
  const rep = repById(migration?.repId ?? null);
  const [slot, setSlot] = useState<string | null>(null);
  const [name, setName] = useState(company?.financeLead.name ?? "");
  const [email, setEmail] = useState(company?.financeLead.email ?? "");
  const [reschedule, setReschedule] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!migration || !company || !rep)
    return (
      <ExternalFrame label="Book an intro call">
        <div className="rounded-lg border border-line bg-surface p-8 text-center" data-testid="booking-invalid">
          <p className="font-medium text-ink">This link isn&apos;t valid</p>
          <p className="mt-1 text-sm text-muted">Ask the person who introduced you for a new link.</p>
        </div>
      </ExternalFrame>
    );
  const expired = Date.parse(linkExpiry(migration.introducedAt!)) < Date.parse(`${DEMO_TODAY}T00:00:00Z`);
  const booked = migration.booking && !reschedule;

  return (
    <ExternalFrame label="Book an intro call">
      <div className="space-y-5" data-testid="booking-page">
        <div>
          <p className="text-sm text-muted">Northbridge Equity Partners introduced {company.name} to DualEntry</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Book 30 minutes with {rep.name}</h1>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand-ink">{rep.name.split(" ").map((x) => x[0]).join("")}</span>
          <div className="text-sm">
            <div className="font-medium text-ink">{rep.name}</div>
            <div className="text-muted">{rep.title}</div>
          </div>
          <ul className="ml-auto hidden max-w-xs list-disc pl-4 text-xs text-ink-2 sm:block">
            <li>How DualEntry would run {company.name}&apos;s close{company.entityCount > 1 ? ` across ${company.entityCount} entities` : ""}</li>
            <li>Migrating from {company.accountingSystem}</li>
            <li>What you&apos;d share with Northbridge — always your choice</li>
          </ul>
        </div>

        {expired ? (
          <div className="rounded-lg border border-line bg-surface p-6 text-center text-sm text-muted">This link expired. Reply to the introduction email for a new one.</div>
        ) : booked ? (
          <div className="rounded-lg border border-pos/30 bg-pos-soft/50 p-6 text-center" data-testid="booking-confirmed">
            <CheckCircle2 className="mx-auto h-9 w-9 text-pos" />
            <p className="mt-2 font-semibold text-ink">You&apos;re booked with {rep.name.split(" ")[0]}</p>
            <p className="text-sm text-ink-2">{fmtSlot(migration.booking!.slot)} (UTC) · invitation sent to {migration.booking!.email}</p>
            <Button className="mt-3" onClick={() => setReschedule(true)}>
              Reschedule
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-line bg-surface p-5">
            <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink">
              <CalendarCheck className="h-4 w-4 text-brand" /> Pick a time (UTC)
            </div>
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
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-xs text-muted">Your name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-full rounded-md border border-line-strong px-2.5" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-muted">Email</span>
                <input value={email} onChange={(e) => setEmail(e.target.value)} className="h-8 w-full rounded-md border border-line-strong px-2.5" />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted">Company: {company.name} · Introduced by Northbridge Equity Partners (pre-filled)</span>
              <Button
                variant="primary"
                disabled={!slot || !name.trim() || !email.includes("@")}
                data-testid="confirm-booking"
                onClick={() => {
                  book(token, slot!, name.trim(), email.trim());
                  setReschedule(false);
                }}
              >
                Confirm intro call
              </Button>
            </div>
          </div>
        )}

        {!booked && !expired && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button className="text-brand hover:underline" onClick={() => (respond(token, "info"), setMessage(`${rep.name.split(" ")[0]} will email you more information.`))}>
              Send me more information instead
            </button>
            <span className="text-faint">·</span>
            <button className="text-muted hover:underline" onClick={() => (respond(token, "not_now"), setMessage("Thanks — we've let Northbridge know it's not the right time."))} data-testid="not-now">
              Not now
            </button>
          </div>
        )}
        {message && <p className="rounded-md bg-subtle px-3 py-2 text-sm text-ink-2">{message}</p>}
        <p className="text-[11px] text-muted">Link valid until {formatDate(linkExpiry(migration.introducedAt!))}. No financial information about {company.name} is shown on this page.</p>
      </div>
    </ExternalFrame>
  );
}
