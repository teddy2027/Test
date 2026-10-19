"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { hydrateApp, useApp } from "@/lib/state/store";
import Loading from "@/app/loading";
import { TooltipProvider } from "../ui/primitives";
import { Header } from "./Header";
import { MethodologyDialog, WatchlistSheet } from "./Panels";
import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => hydrateApp(), []);
  const hydrated = useApp((s) => s.hydrated);
  const path = usePathname();
  // Simulated pages that belong to the CFO / DualEntry render without the sponsor's navigation.
  if (path.startsWith("/invite/") || path.startsWith("/approve/")) return <TooltipProvider delayDuration={150}>{hydrated ? children : <div className="p-8"><Loading /></div>}</TooltipProvider>;
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          {hydrated ? <Header /> : <div className="h-[97px] border-b border-line bg-surface" />}
          <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 pb-12 pt-5">{hydrated ? children : <Loading />}</main>
          <footer className="no-print border-t border-line px-6 py-3 text-[11px] text-faint">
            DualEntry | Portfolio Intelligence — concept prototype. Northbridge Equity Partners and all companies are fictional; all figures are synthetic. Not a live DualEntry product.
          </footer>
        </div>
      </div>
      <MethodologyDialog />
      <WatchlistSheet />
    </TooltipProvider>
  );
}
