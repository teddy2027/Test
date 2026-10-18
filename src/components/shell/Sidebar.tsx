"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Building2, ChevronDown, ChevronRight, Columns3, FileText, LayoutDashboard, Lightbulb, Plug, Star, BookOpen } from "lucide-react";
import { cn } from "@/lib/cn";
import { getData } from "@/lib/data";
import { useApp } from "@/lib/state/store";
import { useDataVersion } from "@/lib/workspace/store";

const NAV = [
  { href: "/", label: "Portfolio Overview", icon: LayoutDashboard },
  { href: "/insights", label: "Cross-Portfolio Insights", icon: Lightbulb },
  { href: "/compare", label: "Company Comparison", icon: Columns3 },
  { href: "/companies", label: "Portfolio Companies", icon: Building2 },
  { href: "/connections", label: "Data Connections", icon: Plug },
  { href: "/reporting", label: "Reporting", icon: FileText },
];

export function Wordmark() {
  // Text wordmark only: no official logo asset could be retrieved. Drop approved assets into /public/brand to replace.
  return (
    <div className="leading-tight">
      <div className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="text-[16px] font-semibold tracking-tight text-white">DualEntry</span>
        <span className="text-side-muted">|</span>
        <span className="text-[12.5px] font-medium text-side-ink">Portfolio Intelligence</span>
      </div>
      <div className="mt-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-[#e0a43a]">Concept demo · Fictional data</div>
    </div>
  );
}

export function Sidebar() {
  const path = usePathname();
  useDataVersion(); // re-render when companies are added
  const data = getData();
  const [open, setOpen] = useState(true);
  const watch = useApp((s) => s.watchlist);
  const setMethodologyOpen = useApp((s) => s.setMethodologyOpen);
  const setWatchlistOpen = useApp((s) => s.setWatchlistOpen);
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href) && !(href === "/companies" && path.startsWith("/companies/")));

  return (
    <aside className="no-print sticky top-0 hidden h-screen w-[256px] shrink-0 flex-col border-r border-side-line bg-side text-side-ink lg:flex">
      <div className="px-4 pb-4 pt-4">
        <Link href="/" aria-label="DualEntry Portfolio Intelligence home">
          <Wordmark />
        </Link>
      </div>
      <nav className="px-2" aria-label="Primary">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={cn(
              "mb-0.5 flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors",
              isActive(n.href) ? "bg-side-active text-white" : "text-side-ink/80 hover:bg-white/5 hover:text-white",
            )}
          >
            <n.icon className={cn("h-4 w-4", isActive(n.href) ? "text-[#7aa7ff]" : "text-side-muted")} />
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="mt-4 flex min-h-0 flex-1 flex-col border-t border-side-line pt-3">
        <button onClick={() => setOpen(!open)} className="mx-2 flex items-center justify-between rounded px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-side-muted hover:text-side-ink" aria-expanded={open}>
          Companies ({data.companies.length})
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        {open && (
          <div className="thin-scroll mt-1 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {data.funds.map((f) => (
              <div key={f.id} className="mb-2">
                <div className="px-2.5 py-1 text-[11px] text-side-muted">{f.shortName}</div>
                {data.companies
                  .filter((c) => c.fund === f.id)
                  .map((c) => {
                    const active = path === `/companies/${c.id}`;
                    return (
                      <Link
                        key={c.id}
                        href={`/companies/${c.id}`}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2.5 py-[5px] text-[12.5px] transition-colors",
                          active ? "bg-side-active text-white" : "text-side-ink/75 hover:bg-white/5 hover:text-white",
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            c.lastReportedMonth < 0 ? "bg-[#e0a43a]" : c.connection === "dualentry" ? "bg-[#7aa7ff]" : "bg-side-muted",
                          )}
                          aria-label={c.connection}
                        />
                        <span className="flex-1 truncate">{c.name}</span>
                        {watch.includes(c.id) && <Star className="h-3 w-3 fill-[#e0a43a] text-[#e0a43a]" />}
                      </Link>
                    );
                  })}
              </div>
            ))}
            <div className="mt-1 space-y-1 px-2.5 text-[10.5px] text-side-muted">
              <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#7aa7ff]" /> DualEntry · live</div>
              <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-side-muted" /> Uploaded by Northbridge</div>
              <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#e0a43a]" /> Awaiting data</div>
            </div>
          </div>
        )}
      </div>
      <div className="space-y-0.5 border-t border-side-line p-2">
        <button onClick={() => setWatchlistOpen(true)} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-side-ink/80 hover:bg-white/5 hover:text-white">
          <Star className="h-4 w-4 text-side-muted" /> Watchlist
          <span className="ml-auto rounded bg-white/10 px-1.5 text-[11px]">{watch.length}</span>
        </button>
        <button onClick={() => setMethodologyOpen(true)} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-side-ink/80 hover:bg-white/5 hover:text-white">
          <BookOpen className="h-4 w-4 text-side-muted" /> Methodology
        </button>
      </div>
    </aside>
  );
}
