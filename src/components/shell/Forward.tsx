"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { routes } from "@/lib/routes";
import Loading from "@/app/loading";

/** Old addresses (/insights, /compare) forward to where those views live now, keeping their parameters. */
export function Forward({ from }: { from: "insights" | "compare" }) {
  const router = useRouter();
  const p = useSearchParams();
  useEffect(() => {
    let to: string;
    if (from === "insights") {
      if (p.get("tab") === "ask") to = routes.ask(p.get("q") ?? undefined);
      else if (p.get("tab") === "benchmark") to = routes.benchmark();
      else to = routes.findings({ insight: p.get("insight") ?? undefined, severity: p.get("severity") ?? undefined, category: p.get("category") ?? undefined });
    } else if (p.get("subject")) to = routes.comparePeers(p.get("subject")!);
    else to = p.get("ids") ? routes.compareSide(p.get("ids")!.split(",")) : "/companies?tab=compare";
    router.replace(to);
  }, [from, p, router]);
  return <Loading />;
}
