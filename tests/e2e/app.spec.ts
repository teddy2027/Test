import { expect, test } from "@playwright/test";
import { readFileSync } from "fs";
import { kpiText, setSector, tableRowCount, trackErrors, waitForApp } from "./helpers";

test.describe("Portfolio Intelligence", () => {
  test("app loads with KPI cards, fund roll-up and the demo indicator", async ({ page }) => {
    const errors = await trackErrors(page);
    await page.goto("/");
    await waitForApp(page);
    await expect(page.getByRole("heading", { level: 1, name: "Portfolio", exact: true })).toBeVisible();
    await expect(page.getByTestId("kpi-cards")).toBeVisible();
    await expect(page.getByTestId("kpi-reporting-value")).toHaveText("10 / 12");
    // Funds add up to the portfolio total, which equals the KPI card.
    const total = await kpiText(page, "kpi-revenue");
    await expect(page.getByTestId("fund-total")).toContainText(total!);
    await expect(page.getByTestId("fund-fund-ii")).toBeVisible();
    await expect(page.getByTestId("fund-fund-iii")).toBeVisible();
    await expect(page.getByTestId("portfolio-table")).toHaveCount(0); // company-level tools live in Companies
    await expect(page.getByText("Concept Demo · Fictional Data").first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("three-item navigation; old addresses forward to their new homes", async ({ page }) => {
    const errors = await trackErrors(page);
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link")).toHaveCount(3);
    for (const [label, heading] of [
      ["Companies", "Companies"],
      ["Data Connections", "Data Connections"],
      ["Portfolio", "Portfolio"],
    ]) {
      await nav.getByRole("link", { name: label, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
    }
    await page.goto("/insights");
    await expect(page).toHaveURL(/\/companies\?tab=findings/);
    await page.goto("/compare?subject=summit-compliance");
    await expect(page).toHaveURL(/tab=compare&mode=peers&subject=summit-compliance/);
    await expect(page.getByTestId("peer-section")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("fund filter updates KPIs and the company list", async ({ page }) => {
    await page.goto("/");
    const before = await kpiText(page, "kpi-revenue");
    await page.getByLabel("Fund").selectOption("fund-iii");
    await expect.poll(() => kpiText(page, "kpi-revenue")).not.toBe(before);
    await expect(page.getByTestId("fund-fund-ii")).toHaveCount(0);
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Companies", exact: true }).click();
    await expect.poll(() => tableRowCount(page)).toBe(6);
    await page.getByTestId("reset-filters").click();
    await expect.poll(() => tableRowCount(page)).toBe(12);
  });

  test("sector filter applies to KPIs, trend cohort and company list", async ({ page }) => {
    await page.goto("/");
    await setSector(page, "Business Services");
    await expect(page.getByTestId("kpi-reporting-value")).toHaveText("5 / 7");
    await expect(page.getByTestId("trend-chart")).toContainText("Fixed cohort of 5 companies");
    await page.goto("/companies");
    await expect.poll(() => tableRowCount(page)).toBe(7);
  });

  test("benchmark by group: cost measures, group medians table and small-group rule", async ({ page }) => {
    await page.goto("/companies?tab=compare&mode=benchmark");
    const chart = page.getByTestId("compare-chart");
    await expect(chart).toContainText("Labor intensity by company");
    await expect(chart.getByTestId("compare-group-block")).toHaveCount(3);
    await expect(chart).toContainText(/Subscription software5 companies · median/);
    await expect(chart).toContainText("too small to benchmark");
    const table = page.getByTestId("group-benchmark");
    await expect(table.getByTestId("group-row")).toHaveCount(3);
    await expect(table).toContainText("Recurring managed services");
    await expect(page.getByTestId("benchmark-summary")).toContainText(/Meridian Services \+10\.9 pp/);
    await page.getByLabel("Group companies by").selectOption("sector");
    await expect(table.getByTestId("group-row")).toHaveCount(2);
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("benchmark-export").click()]);
    expect(readFileSync((await dl.path())!, "utf8")).toContain("Labor intensity (median)");
    await chart.locator(".recharts-bar-rectangle").first().click();
    await expect(page).toHaveURL(/\/companies\/[a-z-]+$/);
  });

  test("period filter changes reporting coverage", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Reporting period").selectOption("2026-Q2");
    await expect(page.getByTestId("kpi-reporting-value")).toHaveText("12 / 12");
    await page.getByLabel("Period type").selectOption("ttm");
    await expect(page.getByRole("heading", { level: 1, name: "Portfolio", exact: true })).toBeVisible();
    await expect(page.getByText("TTM Jun 2026").first()).toBeVisible();
  });

  test("company list sorting and opening a company", async ({ page }) => {
    await page.goto("/companies");
    const first = () => page.locator('[data-testid="portfolio-table"] tbody tr').first().getAttribute("data-testid");
    await expect.poll(first).toBe("row-meridian-services"); // default: revenue desc
    await page.getByTestId("sort-revenue").click();
    await expect.poll(first).toBe("row-lattice-technologies"); // asc, N/A last
    await page.getByTestId("sort-ebitdaMargin").click();
    await expect.poll(first).not.toBe("row-lattice-technologies");
    await page.getByTestId("row-cedar-cloud").click();
    await expect(page.getByTestId("company-name")).toHaveText("Cedar Cloud");
  });

  test("CSV export contains visible rows and the synthetic-data banner", async ({ page }) => {
    await page.goto("/companies");
    await setSector(page, "Software");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-csv").click()]);
    const csv = readFileSync((await dl.path())!, "utf8");
    expect(csv).toContain("SYNTHETIC DATA");
    expect(csv).toContain("Industry: Software");
    expect(csv).toContain("Atlas Software");
    expect(csv).not.toContain("Meridian Services");
  });

  test("tick companies to compare them side by side, then print", async ({ page }) => {
    await page.goto("/companies");
    await expect(page.getByTestId("compare-selected")).toBeDisabled();
    await page.getByTestId("select-meridian-services").check();
    await page.getByTestId("select-harbor-operations").check();
    await page.getByTestId("select-beacon-analytics").check();
    await page.getByTestId("compare-selected").click();
    await expect(page).toHaveURL(/tab=compare&mode=side/);
    await expect(page.getByTestId("compare-chip")).toHaveCount(3);
    await expect(page.getByText(/span software and services/)).toBeVisible();
    await page.getByTestId("compare-add").click();
    await page.getByRole("button", { name: /Atlas Software/ }).click();
    await expect(page.getByTestId("compare-chip")).toHaveCount(4);
    await expect(page.getByTestId("compare-print")).toBeVisible();
  });

  test("company vs peers: from the company page, with peers from the whole portfolio or the filters", async ({ page }) => {
    await page.goto("/companies/meridian-services");
    await page.getByTestId("compare-peers").click();
    const peers = page.getByTestId("peer-section");
    await expect(page).toHaveURL(/mode=peers&subject=meridian-services/);
    await expect(peers.getByTestId("peer-count")).toHaveText("4");
    await expect(peers.getByTestId("small-cohort-warning")).toBeVisible();
    await page.getByLabel("Fund").selectOption("fund-ii");
    await expect(peers.getByTestId("peer-count")).toHaveText("4"); // default: whole portfolio
    await peers.getByRole("radio", { name: "Current filters" }).click();
    await expect(peers.getByTestId("peer-count")).toHaveText("2"); // Fund II business services with Q3 data: Horizon, Harbor
    await peers.getByLabel("Peer cohort").selectOption("vintage");
    await expect(peers.getByTestId("small-cohort-warning")).toContainText(/too small|No eligible peers/);
  });

  test("findings: one row per company, ranked, opening the supporting analysis", async ({ page }) => {
    await page.goto("/companies?tab=findings");
    const rows = page.getByTestId("findings-attention").getByTestId("findings-row");
    await expect(rows.first()).toHaveAttribute("data-company", "meridian-services"); // high severity, largest company
    await expect(page.locator('[data-testid="insight-card"]')).toHaveCount(0); // collapsed by default
    await page.getByTestId("expand-meridian-services").click();
    const card = page.locator('[data-testid="insight-card"][data-rule="labor_outpacing_revenue"][data-company="meridian-services"]');
    await card.click();
    const drawer = page.getByTestId("insight-drawer");
    await expect(drawer).toBeVisible();
    for (const t of ["Computed finding", "KPI history", "Comparison with business services peers", "Underlying components", "Possible explanations", "Data source & period context"]) await expect(drawer.getByText(t)).toBeVisible();
    await drawer.getByRole("button", { name: /Inspect company data/ }).click();
    await expect(page.getByTestId("company-name")).toHaveText("Meridian Services");
  });

  test("findings: Outperforming and All views switch the list", async ({ page }) => {
    await page.goto("/companies?tab=findings");
    await page.getByRole("radio", { name: /Outperforming/ }).click();
    await expect(page.getByTestId("findings-positive")).toBeVisible();
    await expect(page.getByTestId("findings-attention")).toHaveCount(0);
    await expect(page.getByTestId("findings-positive")).toContainText("Beacon Analytics");
    await page.getByRole("radio", { name: "All" }).click();
    await expect(page.getByTestId("findings-attention")).toBeVisible();
    await expect(page.getByTestId("findings-positive")).toBeVisible();
    await page.getByRole("radio", { name: /Needs attention/ }).click();
    await expect(page.getByTestId("findings-positive")).toHaveCount(0);
  });

  test("Reports menu lists every report and opens each one", async ({ page }) => {
    await page.goto("/connections");
    await page.getByTestId("reports-menu").click();
    for (const id of ["report-quarterly", "report-side", "report-peers", "report-benchmark"]) await expect(page.getByTestId(id)).toBeVisible();
    await page.getByTestId("report-benchmark").click();
    await expect(page.getByTestId("benchmark-mode")).toBeVisible();
    await expect(page.getByTestId("compare-print")).toBeVisible();
  });

  test("Ask Your Portfolio answers, supports follow-ups and declines unsupported questions", async ({ page }) => {
    await page.goto("/companies?tab=ask");
    await page.getByTestId("ask-input").fill("What is our average EBITDA margin?");
    await page.getByTestId("ask-submit").click();
    await expect(page.getByTestId("ask-loading")).toBeVisible();
    await expect(page.getByTestId("ask-direct-answer").last()).toContainText("Portfolio EBITDA margin");
    await page.getByTestId("ask-input").fill("What about software companies?");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("ask-interpretation").last()).toContainText("follow-up");
    await expect(page.getByTestId("ask-interpretation").last()).toContainText("Software");
    await page.getByTestId("ask-input").fill("What is our IRR?");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("ask-direct-answer").last()).toContainText("outside this operating-financial dataset");
    await expect(page.getByTestId("chat-turn")).toHaveCount(3);
  });

  test("Data Connections: two connection types, effort, pipeline and Upload vs DualEntry", async ({ page }) => {
    const errors = await trackErrors(page);
    await page.goto("/connections");
    await expect(page.getByTestId("add-company")).toHaveCount(0); // adding lives in Companies only
    await expect(page.getByTestId("close-meridian-services")).toHaveText("14 days");
    await expect(page.getByTestId("arrives-meridian-services")).toHaveText(/~\d+ days/);
    await expect(page.getByTestId("arrives-northstar-systems")).toHaveText("At close");
    await expect(page.getByTestId("budget-bluepeak-solutions")).toHaveText("Missing");
    await expect(page.getByTestId("conn-row-apex-workforce")).toContainText("Low");
    await expect(page.getByTestId("conn-row-meridian-services")).toContainText("NetSuite");
    await expect(page.getByTestId("depth-compare")).toContainText(/Northstar Systems: \+8\.1% organic vs \+23\.2% reported/);
    await expect(page.getByTestId("depth-compare")).toContainText("Northbridge effort");
    await expect(page.getByTestId("effort-panel")).toBeVisible();
    await expect(page.getByTestId("pipeline-panel")).toContainText("Harbor Operations");
    await expect(page.getByText("Uploaded by Northbridge").first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("sponsor upload: example file validates, previews and completes the quarter", async ({ page }) => {
    const errors = await trackErrors(page);
    await page.goto("/");
    await expect(page.getByTestId("kpi-reporting-value")).toHaveText("10 / 12");
    await page.goto("/connections");
    await page.getByTestId("upload-apex-workforce").click();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-example").click()]);
    await page.getByTestId("upload-input").setInputFiles((await dl.path())!);
    await expect(page.getByTestId("upload-results")).toBeVisible();
    await expect(page.getByTestId("upload-preview")).toBeVisible();
    await page.getByTestId("accept-upload").click();
    await expect(page.getByTestId("upload-success")).toBeVisible();
    await page.goto("/");
    await expect(page.getByTestId("kpi-reporting-value")).toHaveText("11 / 12");
    expect(errors).toEqual([]);
  });

  test("upload the company's own export: accounts mapped once, remembered next time", async ({ page }) => {
    const errors = await trackErrors(page);
    await page.goto("/companies/apex-workforce");
    await page.getByTestId("open-upload").click();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-export-example").click()]);
    const csv = readFileSync((await dl.path())!, "utf8");
    // Rename one account so it needs a manual mapping.
    const file = csv.replace("6400 Travel and other", "6400 Sundry");
    await page.getByTestId("upload-input").setInputFiles({ name: "apex-gp-export.csv", mimeType: "text/csv", buffer: Buffer.from(file) });
    await expect(page.getByTestId("mapping-table")).toBeVisible();
    await expect(page.getByTestId("mapping-section")).toContainText("1 still to map");
    await expect(page.getByTestId("accept-upload")).toBeDisabled();
    await expect(page.getByLabel("Map 6900 Transaction costs (one-off)")).toHaveValue("EXCLUDE");
    await page.getByLabel("Map 6400 Sundry").selectOption("OPEX_OTHER");
    await expect(page.getByTestId("upload-preview")).toBeVisible();
    await page.getByTestId("accept-upload").click();
    await expect(page.getByTestId("upload-success")).toContainText("mapping is saved");
    await page.getByRole("button", { name: "Done" }).click();
    // Next upload of the same export: everything is remembered.
    await page.getByTestId("open-upload").click();
    await page.getByTestId("upload-input").setInputFiles({ name: "apex-gp-export.csv", mimeType: "text/csv", buffer: Buffer.from(file) });
    await expect(page.getByTestId("mapping-section")).toContainText("all mapped");
    await expect(page.getByTestId("mapping-table").getByText("remembered").first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("upload a budget: validated, then used for budget vs actual", async ({ page }) => {
    const errors = await trackErrors(page);
    await page.goto("/companies/apex-workforce");
    await page.getByTestId("open-upload").click();
    await page.getByRole("radio", { name: "Budget" }).click();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-budget-example").click()]);
    const csv = readFileSync((await dl.path())!, "utf8");
    const broken = csv.replace(/^(BUDGET_EBITDA,[^,]*,)(-?\d+)/m, (_m, a, n) => `${a}${Number(n) + 777}`);
    await page.getByTestId("upload-input").setInputFiles({ name: "budget.csv", mimeType: "text/csv", buffer: Buffer.from(broken) });
    await expect(page.getByTestId("upload-issues")).toContainText("budget EBITDA");
    await expect(page.getByTestId("accept-budget")).toBeDisabled();
    await page.getByTestId("upload-input").setInputFiles({ name: "budget.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await expect(page.getByTestId("budget-preview")).toBeVisible();
    await page.getByTestId("accept-budget").click();
    await expect(page.getByTestId("upload-success")).toContainText("budget vs actual");
    expect(errors).toEqual([]);
  });

  test("upload rejects a file with broken control totals", async ({ page }) => {
    await page.goto("/companies/apex-workforce");
    await page.getByTestId("open-upload").click();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-example").click()]);
    const csv = readFileSync((await dl.path())!, "utf8").replace(/^(TOTAL_REVENUE,[^,\n]*,)(\d+)/m, (_m, a, n) => `${a}${Number(n) + 5000}`);
    await page.getByTestId("upload-input").setInputFiles({ name: "broken.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await expect(page.getByTestId("upload-issues")).toContainText(/total/i);
    await expect(page.getByTestId("accept-upload")).toBeDisabled();
  });

  test("add an upload company: awaiting data until the first pack", async ({ page }) => {
    const errors = await trackErrors(page);
    await page.goto("/companies");
    await page.getByTestId("add-company").click();
    await page.getByTestId("add-name").fill("Orbit Facility Group");
    await page.getByTestId("add-cfo-name").fill("Maya Lind");
    await page.getByTestId("add-cfo-email").fill("maya.lind@orbit.example");
    await page.getByTestId("path-upload").click();
    await page.getByTestId("add-submit").click();
    await expect(page.getByTestId("company-name")).toHaveText("Orbit Facility Group");
    await expect(page.getByTestId("onboarding-banner")).toBeVisible();
    await expect(page.getByTestId("awaiting-data")).toBeVisible();
    await expect(page.getByText("Awaiting data").first()).toBeVisible();
    await expect(page.getByTestId("compare-peers")).toHaveCount(0); // nothing to compare until the first upload
    await page.getByTestId("open-upload").click();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-example").click()]);
    await page.getByTestId("upload-input").setInputFiles((await dl.path())!);
    await page.getByTestId("accept-upload").click();
    await expect(page.getByTestId("upload-success")).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByTestId("awaiting-data")).toHaveCount(0);
    await expect(page.getByTestId("company-kpis")).toBeVisible();
    await expect(page.getByTestId("compare-peers")).toBeVisible();
    await page.goto("/companies");
    await expect.poll(() => tableRowCount(page)).toBe(13);
    await expect(page.getByTestId("select-orbit-facility-group")).toBeEnabled();
    expect(errors).toEqual([]);
  });

  test("add a DualEntry company: company approves scope, then data goes live", async ({ page }) => {
    const errors = await trackErrors(page);
    await page.goto("/companies");
    await page.getByTestId("add-company").click();
    await page.getByTestId("add-name").fill("Vega Ledger Cloud");
    await page.getByTestId("add-cfo-name").fill("Tom Reyes");
    await page.getByTestId("add-cfo-email").fill("tom.reyes@vega.example");
    await page.getByTestId("path-dualentry").click();
    await page.getByTestId("add-submit").click();
    await expect(page.getByTestId("share-pending")).toBeVisible();
    await page.getByTestId("open-approval").click();
    await expect(page.getByTestId("approval-page")).toBeVisible();
    await expect(page.getByTestId("approve-share")).toBeDisabled();
    await page.getByTestId("confirm-relationship").check();
    await page.getByTestId("gran-entity").check();
    await expect(page.getByTestId("approve-share")).toBeDisabled(); // second approver required
    await page.getByTestId("second-approver").fill("Ana Ortiz");
    await page.getByTestId("approve-share").click();
    await expect(page.getByTestId("approval-done")).toContainText("active");
    await page.getByRole("link", { name: /Northbridge.s side/ }).click();
    await expect(page.getByTestId("company-name")).toHaveText("Vega Ledger Cloud");
    await expect(page.getByTestId("company-kpis")).toBeVisible();
    await expect(page.getByTestId("share-panel")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("Explore DualEntry: send invite, CFO books a demo and opens the sandbox, status updates", async ({ page }) => {
    const errors = await trackErrors(page);
    await page.goto("/companies/meridian-services");
    await page.getByTestId("explore-dualentry").click();
    const panel = page.getByTestId("explore-panel");
    await expect(panel.getByTestId("talking-points")).toBeVisible();
    await panel.getByTestId("send-invite").click();
    await expect(page.getByTestId("invite-dialog")).toContainText("Daniel Okafor");
    await expect(page.getByTestId("invite-preview")).toContainText("Book a demo with Daniel");
    await expect(page.getByTestId("invite-preview")).toContainText("Open a sandbox");
    await page.getByTestId("send-invite-confirm").click();
    await expect(page.getByTestId("invite-sent")).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(panel.getByTestId("booking-status")).toHaveText("Not booked yet");
    await expect(panel.getByTestId("sandbox-status")).toHaveText("Not opened yet");

    await panel.getByTestId("invite-link").click();
    await expect(page.getByTestId("invite-page")).toContainText("Meridian Services");
    await page.getByTestId("open-sandbox").click();
    await expect(page.getByTestId("sandbox-ready")).toBeVisible();
    await page.getByTestId("slot").first().click();
    await page.getByTestId("confirm-booking").click();
    await expect(page.getByTestId("booking-confirmed")).toBeVisible();

    await page.goto("/companies/meridian-services");
    await expect(page.getByTestId("booking-status")).toContainText("booked by");
    await expect(page.getByTestId("sandbox-status")).toContainText("Opened");
    await expect(page.getByTestId("explore-stage")).toHaveText("Demo booked");
    await page.getByTestId("advance-call_held").click();
    await expect(page.getByTestId("explore-stage")).toHaveText("Demo held");
    await page.goto("/connections");
    await expect(page.getByTestId("pipeline-summary")).toContainText("opened the sandbox");
    expect(errors).toEqual([]);
  });

  test("silent invite shows as stalled; CFO can decline from the invite page", async ({ page }) => {
    await page.goto("/companies/summit-compliance"); // Summit: invite sent 19 days ago, no response
    await expect(page.getByTestId("stalled")).toBeVisible();
    await expect(page.getByTestId("explore-panel")).toContainText("follow up or resend");
    await page.goto("/connections");
    await expect(page.getByTestId("pipeline-summary")).toContainText("1 stalled");
    await page.goto("/invite/sm4q9t2b7kx8");
    await page.getByTestId("not-now").click();
    await expect(page.getByTestId("not-now-done")).toBeVisible();
    await page.goto("/companies/summit-compliance");
    await expect(page.getByTestId("explore-stage")).toHaveText("Not now");
    await expect(page.getByTestId("stalled")).toHaveCount(0);
  });

  test("invalid invite link is handled", async ({ page }) => {
    await page.goto("/invite/doesnotexist");
    await expect(page.getByTestId("invite-invalid")).toBeVisible();
  });

  test("quarterly pack opens from Portfolio and exports CSV", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("reports-menu").click();
    await page.getByTestId("report-quarterly").click();
    await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Portfolio", exact: true })).toHaveClass(/bg-side-active/);
    await expect(page.getByTestId("report-preview")).toContainText("Quarterly portfolio operating summary");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("report-csv").click()]);
    const csv = readFileSync((await dl.path())!, "utf8");
    expect(csv).toContain("SYNTHETIC DATA");
    expect(csv).toContain("Meridian Services");
  });

  test("company deep dive tabs and connected vs upload depth", async ({ page }) => {
    await page.goto("/companies/northstar-systems");
    await page.getByTestId("tab-ent").click();
    await expect(page.getByTestId("entity-panel")).toContainText("Vantage Data Systems LLC");
    await page.getByTestId("tab-cf").click();
    await expect(page.getByTestId("cash-flow")).toContainText("Cash interest");
    await page.getByRole("radio", { name: "Monthly" }).click();
    await expect(page.getByTestId("cash-flow")).toContainText("Sep ’26");
    await page.goto("/companies/meridian-services");
    await page.getByTestId("tab-ent").click();
    await expect(page.getByTestId("entity-locked")).toBeVisible();
    await page.getByTestId("tab-bva").click();
    await expect(page.getByTestId("bva")).toContainText("EBITDA bridge");
  });
});
