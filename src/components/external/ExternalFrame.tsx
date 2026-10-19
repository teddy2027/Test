"use client";
import Link from "next/link";
import { FlaskConical } from "lucide-react";

/** Chrome for the simulated DualEntry pages (invite, data-share approval). */
export function ExternalFrame({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="border-b border-line bg-surface">
        <div className={`mx-auto flex items-center gap-3 px-5 py-3 ${wide ? "max-w-5xl" : "max-w-3xl"}`}>
          <span className="text-[17px] font-semibold tracking-tight text-ink">DualEntry</span>
          <span className="text-sm text-muted">{label}</span>
          <span className="ml-auto inline-flex items-center gap-1 rounded border border-warn/30 bg-warn-soft px-1.5 py-0.5 text-[11px] font-medium text-warn">
            <FlaskConical className="h-3 w-3" /> Simulated page · concept demo
          </span>
        </div>
      </div>
      <div className={`mx-auto px-5 py-8 ${wide ? "max-w-5xl" : "max-w-3xl"}`}>{children}</div>
      <p className="pb-8 text-center text-[11px] text-faint">
        Prototype only — not a DualEntry page. All people and companies are fictional.{" "}
        <Link href="/connections" className="text-brand hover:underline">
          Back to Portfolio Intelligence
        </Link>
      </p>
    </div>
  );
}
