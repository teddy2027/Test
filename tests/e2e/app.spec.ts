import { expect, test } from "@playwright/test";
import { readFileSync } from "fs";
import { kpiText, setSector, tableRowCount, trackErrors, waitForApp } from "./helpers";

test.describe("Portfolio Intelligence", () => {
  test("app loads with KPI cards, 12 companies and the demo indicator", async ({ page }) => {
    const errors = await trackErrors(page);
    await page.goto("/");
    await waitForApp(page);
    await expect(page.getByRole("heading", { name: "Portfolio Overview" })).toBeVisible();
    await expect(page.getByTestId("kpi-cards")).toBeVisible();
    expect(await tableRowCount(page)).toBe(12);
    await expect(page.getByTestId("kpi-reporting-value")).toHaveText("10 / 12");
    await expect(page.getByText("Concept Demo · Fictional Data").first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("sidebar navigation reaches every main view", async ({ page }) => {
    const errors = await trackErrors(page);
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    for (const [label, heading] of [
      ["Cross-Portfolio Insights", "Cross-Portfolio Insights"],
      ["Company Comparison", "Company Comparison"],
      ["Portfolio Companies", "Portfolio Companies"],
      ["Data Connections", "Data Connections"],
      ["Reporting", "Reporting"],
      ["Portfolio Overview", "Portfolio Overview"],
    ]) {
      await nav.getByRole("link", { name: label }).click();
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test("fund filter updates KPIs and table", async ({ page }) => {
    await page.goto("/");
    const before = await kpiText(page, "kpi-revenue");
    await page.getByLabel("Fund").selectOption("fund-iii");
    await expect.poll(() => kpiText(page, "kpi-revenue")).not.toBe(before);
    expect(await tableRowCount(page)).toBe(6);
    await page.getByTestId("reset-filters").click();
    expect(await tableRowCount(page)).toBe(12);
  });

  test("sector filter applies to table, KPIs and chart cohort", async ({ page }) => {
    await page.goto("/");
    await setSector(page, "Business Services");
    expect(await tableRowCount(page)).toBe(7);
    await expect(page.getByTestId("kpi-reporting-value")).toHaveText("5 / 7");
    await expect(page.getByTestId("trend-chart")).toContainText("Fixed cohort of 5 companies");
  });

  test("period filter changes reporting coverage", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Reporting period").selectOption("2026-Q2");
    await expect(page.getByTestId("kpi-reporting-value")).toHaveText("12 / 12");
    await page.getByLabel("Period type").selectOption("ttm");
    await expect(page.getByRole("heading", { level: 1, name: "Portfolio Overview" })).toBeVisible();
    await expect(page.getByText("TTM Jun 2026").first()).toBeVisible();
  });

  test("table sorting and company selection", async ({ page }) => {
    await page.goto("/");
    const first = () => page.locator('[data-testid="portfolio-table"] tbody tr').first().getAttribute("data-testid");
    expect(await first()).toBe("row-meridian-services"); // default: revenue desc
    await page.getByTestId("sort-revenue").click();
    await expect.poll(first).toBe("row-lattice-technologies"); // asc, N/A last
    await page.getByTestId("sort-ebitdaMargin").click();
    await expect.poll(first).not.toBe("row-lattice-technologies");
    await page.getByTestId("row-cedar-cloud").click();
    await expect(page.getByTestId("company-name")).toHaveText("Cedar Cloud");
  });

  test("CSV export contains visible rows and the synthetic-data banner", async ({ page }) => {
    await page.goto("/");
    await setSector(page, "Software");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-csv").click()]);
    const csv = readFileSync((await dl.path())!, "utf8");
    expect(csv).toContain("SYNTHETIC DATA");
    expect(csv).toContain("Industry: Software");
    expect(csv).toContain("Atlas Software");
    expect(csv).not.toContain("Meridian Services");
  });

  test("company comparison: side by side and peer cohort", async ({ page }) => {
    await page.goto("/compare");
    await expect(page.getByTestId("compare-chip")).toHaveCount(3);
    await page.getByTestId("add-company").click();
    await page.getByRole("button", { name: /Beacon Analytics/ }).click();
    await expect(page.getByTestId("compare-chip")).toHaveCount(4);
    await expect(page.getByText(/span software and services/)).toBeVisible();
    await page.getByRole("radio", { name: "Company vs peer cohort" }).click();
    await expect(page.getByTestId("peer-count")).toHaveText("4");
    await expect(page.getByTestId("small-cohort-warning")).toBeVisible();
    await page.getByLabel("Peer cohort").selectOption("vintage");
    await expect(page.getByTestId("small-cohort-warning")).toContainText(/too small|No eligible peers/);
  });

  test("insight drill-down opens supporting analysis", async ({ page }) => {
    await page.goto("/insights");
    const card = page.locator('[data-testid="insight-card"][data-rule="labor_outpacing_revenue"][data-company="meridian-services"]');
    await card.click();
    const drawer = page.getByTestId("insight-drawer");
    await expect(drawer).toBeVisible();
    for (const t of ["Computed finding", "KPI history", "Comparison with business services peers", "Underlying components", "Possible explanations", "Data source & period context"]) await expect(drawer.getByText(t)).toBeVisible();
    await drawer.getByRole("button", { name: /Inspect company data/ }).click();
    await expect(page.getByTestId("company-name")).toHaveText("Meridian Services");
  });

  test("Ask Your Portfolio answers, supports follow-ups and declines unsupported questions", async ({ page }) => {
    await page.goto("/insights?tab=ask");
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

  test("Data Connections: two connection types, effort, pipeline and depth comparison", async ({ page }) => {
    const errors = await trackErrors(page);
    await page.goto("/connections");
    await expect(page.getByTestId("depth-compare")).toContainText("organic");
    await expect(page.getByTestId("depth-compare")).toContainText("Sponsor effort");
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
    await page.goto("/connections");
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
    await page.goto("/");
    expect(await tableRowCount(page)).toBe(13);
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
    await expect(page.getByTestId("migration-timeline")).toContainText("Sandbox opened");
    await page.getByTestId("advance-call_held").click();
    await expect(page.getByTestId("migration-timeline")).toContainText("Demo held");
    await page.goto("/connections");
    await expect(page.getByTestId("pipeline-summary")).toContainText("opened the sandbox");
    expect(errors).toEqual([]);
  });

  test("CFO can decline from the invite page", async ({ page }) => {
    await page.goto("/invite/sm4q9t2b7kx8"); // Summit: invite sent, no response yet
    await page.getByTestId("not-now").click();
    await expect(page.getByTestId("not-now-done")).toBeVisible();
    await page.goto("/companies/summit-compliance");
    await expect(page.getByTestId("migration-timeline")).toContainText("Not now");
  });

  test("invalid invite link is handled", async ({ page }) => {
    await page.goto("/invite/doesnotexist");
    await expect(page.getByTestId("invite-invalid")).toBeVisible();
  });

  test("reporting views export CSV", async ({ page }) => {
    await page.goto("/reporting");
    await page.getByTestId("report-cost").click();
    await expect(page.getByTestId("report-preview")).toContainText("Cross-portfolio cost insight summary");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("report-csv").click()]);
    const csv = readFileSync((await dl.path())!, "utf8");
    expect(csv).toContain("SYNTHETIC DATA");
    expect(csv).toContain("Labor - revenue growth gap");
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
