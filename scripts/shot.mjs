// Usage: node scripts/shot.mjs <path> <outfile> [width] [height] [fullPage]
import { chromium } from "@playwright/test";
const [, , path = "/", out = "shot.png", w = "1440", h = "900", full = "1"] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`http://localhost:${process.env.PORT ?? 3000}${path}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1600);
await page.screenshot({ path: out, fullPage: full === "1" });
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no console errors");
await browser.close();
