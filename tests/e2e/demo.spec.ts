import { expect, test } from "@playwright/test";
import { kpiText, setSector, tableRowCount, trackErrors, waitForApp } from "./helpers";

/** The eight-step live demonstration from DEMO_SCRIPT.md, end to end. */
test("eight-step live demo", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await trackErrors(page);

  // Step 1 — Portfolio: KPIs reconcile with the fund roll-up
  await page.goto("/");
  await waitForApp(page);
  const totalRevenue = await kpiText(page, "kpi-revenue");
  expect(totalRevenue).toMatch(/^\$\d+\.\dM$/);
  const fundTotal = page.getByTestId("fund-total");
  await expect(fundTotal).toContainText(totalRevenue!);
  await expect(fundTotal).toContainText("10 / 12");

  // Step 2 — Filter by Business Services: KPIs, trend cohort and funds update
  await setSector(page, "Business Services");
  await expect.poll(() => kpiText(page, "kpi-revenue")).not.toBe(totalRevenue);
  const servicesRevenue = await kpiText(page, "kpi-revenue");
  await expect(fundTotal).toContainText(servicesRevenue!);
  await expect(page.getByTestId("trend-chart")).toContainText("Fixed cohort of 5 companies");

  // Step 3 — Companies: findings ranked by company, Meridian first; labor benchmark across services businesses
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Companies", exact: true }).click();
  await expect.poll(() => tableRowCount(page)).toBe(7);
  await page.getByTestId("tab-findings").click();
  const firstRow = page.getByTestId("findings-attention").getByTestId("findings-row").first();
  await expect(firstRow).toHaveAttribute("data-company", "meridian-services");
  await page.getByTestId("expand-meridian-services").click();
  const card = page.locator('[data-testid="insight-card"][data-rule="labor_outpacing_revenue"][data-company="meridian-services"]');
  await expect(card).toContainText("merits investigation");
  await expect(card).toContainText(/labor costs grew 22\.\d% while revenue increased 11\.\d%/);

  // Step 4 — Inspect Meridian: labor trend, revenue trend, EBITDA margin
  await card.click();
  await page.getByTestId("insight-drawer").getByRole("button", { name: /Inspect company data/ }).click();
  await expect(page.getByTestId("company-name")).toHaveText("Meridian Services");
  await expect(page.getByTestId("chart-labor")).toBeVisible();
  await expect(page.getByTestId("chart-margins")).toBeVisible();
  await expect(page.getByTestId("company-kpis")).toContainText("−6.8 pp");

  // Step 5 — Compare with asset-light business services peers
  await page.getByTestId("compare-peers").click();
  await expect(page.getByTestId("peer-rules")).toContainText("Business Services");
  await expect(page.getByTestId("peer-count")).toHaveText("4");
  const peerTable = page.getByTestId("peer-table");
  for (const m of ["Labor intensity", "EBITDA margin", "Revenue growth"]) await expect(peerTable).toContainText(m);

  // Step 6 — Ask Your Portfolio
  await page.goto("/companies?tab=ask");
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
  await expect(depth).toContainText(/Northstar Systems: \+8\.\d% organic vs \+23\.\d% reported/);
  await expect(depth).toContainText("Not determinable");
  await expect(depth).toContainText("Northbridge effort");
  await page.getByTestId("explore-meridian-services").click();
  const panel = page.getByTestId("explore-panel");
  await expect(panel.getByTestId("talking-points")).toBeVisible();
  await panel.getByTestId("send-invite").click();
  await page.getByTestId("send-invite-confirm").click();
  await page.getByRole("button", { name: "Done" }).click();
  await panel.getByTestId("invite-link").click();
  await page.getByTestId("slot").first().click();
  await page.getByTestId("confirm-booking").click();
  await expect(page.getByTestId("booking-confirmed")).toBeVisible();
  await page.getByRole("link", { name: "Back to Portfolio Intelligence" }).click();
  await expect(page.getByTestId("pipeline-panel")).toContainText("Meridian Services");

  // Step 8 — Back to Portfolio: filters and figures remain consistent
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Portfolio", exact: true }).click();
  await expect.poll(() => kpiText(page, "kpi-revenue")).toBe(servicesRevenue);
  await expect(page.getByTestId("fund-total")).toContainText(servicesRevenue!);
  await page.getByTestId("reset-filters").click();
  await expect.poll(() => kpiText(page, "kpi-revenue")).toBe(totalRevenue);

  expect(errors).toEqual([]);
});
