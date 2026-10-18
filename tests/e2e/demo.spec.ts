import { expect, test } from "@playwright/test";
import { kpiText, setSector, tableRowCount, trackErrors, waitForApp } from "./helpers";

/** The eight-step live demonstration from DEMO_SCRIPT.md, end to end. */
test("eight-step live demo", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await trackErrors(page);

  // Step 1 — Portfolio dashboard: 12 companies, reconciled aggregates
  await page.goto("/");
  await waitForApp(page);
  expect(await tableRowCount(page)).toBe(12);
  const totalRevenue = await kpiText(page, "kpi-revenue");
  expect(totalRevenue).toMatch(/^\$\d+\.\dM$/);
  const footer = page.locator('[data-testid="portfolio-table"] tfoot');
  await expect(footer).toContainText(totalRevenue!);

  // Step 2 — Filter by Business Services: table, KPIs and charts update
  await setSector(page, "Business Services");
  expect(await tableRowCount(page)).toBe(7);
  await expect.poll(() => kpiText(page, "kpi-revenue")).not.toBe(totalRevenue);
  const servicesRevenue = await kpiText(page, "kpi-revenue");
  await expect(footer).toContainText(servicesRevenue!);
  await expect(page.getByTestId("trend-chart")).toContainText("Fixed cohort of 5 companies");

  // Step 3 — Cross-Portfolio Insights: labor growth across services businesses, Meridian highlighted
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Cross-Portfolio Insights" }).click();
  const spotlight = page.getByTestId("labor-spotlight");
  await expect(spotlight).toContainText("business services companies");
  await expect(spotlight).toContainText("1 above threshold");
  await expect(spotlight).toContainText(/Meridian Services: labor \+22\.\d% vs revenue \+11\.\d%/);
  const card = page.locator('[data-testid="insight-card"][data-rule="labor_outpacing_revenue"][data-company="meridian-services"]');
  await expect(card).toContainText("merits investigation");

  // Step 4 — Inspect Meridian: labor trend, revenue trend, EBITDA margin
  await card.click();
  await page.getByTestId("insight-drawer").getByRole("button", { name: /Inspect company data/ }).click();
  await expect(page.getByTestId("company-name")).toHaveText("Meridian Services");
  await expect(page.getByTestId("chart-labor")).toBeVisible();
  await expect(page.getByTestId("chart-margins")).toBeVisible();
  await expect(page.getByTestId("company-kpis")).toContainText("−6.8 pp");

  // Step 5 — Compare with asset-light business services peers
  await page.getByRole("link", { name: /Compare with peers/ }).first().click();
  await expect(page.getByTestId("peer-rules")).toContainText("Business Services");
  await expect(page.getByTestId("peer-count")).toHaveText("4");
  const peerTable = page.getByTestId("peer-table");
  for (const m of ["Labor intensity", "EBITDA margin", "Revenue growth"]) await expect(peerTable).toContainText(m);

  // Step 6 — Ask Your Portfolio
  await page.goto("/insights?tab=ask");
  await page.getByTestId("ask-input").fill("Which services companies have labor costs growing faster than revenue, and by how much?");
  await page.getByTestId("ask-submit").click();
  const answer = page.getByTestId("ask-direct-answer").last();
  await expect(answer).toContainText(/Meridian Services by 10\.\d pp \(labor \+22\.\d% vs revenue \+11\.\d%\)/);
  await expect(page.getByTestId("ask-table").last()).toContainText("Meridian Services");
  await page.getByTestId("ask-explore-link").filter({ hasText: "Meridian Services" }).first().click();
  await expect(page.getByTestId("company-name")).toHaveText("Meridian Services");

  // Step 7 — DualEntry advantage: connected vs external, freshness, drill-down, optional migration path
  await page.goto("/connections");
  const depth = page.getByTestId("depth-compare");
  await expect(depth).toContainText("Northstar Systems");
  await expect(depth).toContainText("Meridian Services");
  await expect(depth).toContainText(/organic vs \+23\.\d% reported/);
  await expect(depth).toContainText("Not determinable");
  await expect(depth).toContainText("Sponsor effort");
  await page.getByTestId("explore-from-connections").click();
  const panel = page.getByTestId("explore-panel");
  await expect(panel.getByTestId("talking-points")).toBeVisible();
  await panel.getByTestId("outcome-interested").click();
  await panel.getByTestId("introduce").click();
  await page.getByTestId("mark-sent").click();
  await panel.getByTestId("booking-link").click();
  await page.getByTestId("slot").first().click();
  await page.getByTestId("confirm-booking").click();
  await expect(page.getByTestId("booking-confirmed")).toBeVisible();
  await page.getByRole("link", { name: "Back to Portfolio Intelligence" }).click();
  await expect(page.getByTestId("pipeline-panel")).toContainText("Meridian Services");

  // Step 8 — Back to the Overview: filters and figures remain consistent
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Portfolio Overview" }).click();
  await expect.poll(() => tableRowCount(page)).toBe(7);
  await expect.poll(() => kpiText(page, "kpi-revenue")).toBe(servicesRevenue);
  await page.getByTestId("reset-filters").click();
  await expect.poll(() => kpiText(page, "kpi-revenue")).toBe(totalRevenue);

  expect(errors).toEqual([]);
});
