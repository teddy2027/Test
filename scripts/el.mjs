import { chromium } from "@playwright/test";
const [, , path, sel, out, w = "1440"] = process.argv;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: Number(w), height: 900 } });
await p.goto(`http://localhost:${process.env.PORT ?? 3000}${path}`, { waitUntil: "networkidle" }); await p.waitForTimeout(Number(process.env.WAIT ?? 1600));
await p.locator(sel).first().screenshot({ path: out }); await b.close();
