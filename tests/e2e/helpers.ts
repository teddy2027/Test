import { expect, type Page } from "@playwright/test";

export async function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return errors;
}

export async function setSector(page: Page, sector: "Software" | "Business Services") {
  await page.getByTestId("filter-sector").click();
  await page.getByRole("menuitemcheckbox", { name: new RegExp(sector) }).click();
  await page.keyboard.press("Escape");
}

export async function kpiText(page: Page, id: string) {
  return (await page.getByTestId(`${id}-value`).textContent())?.trim();
}

export async function tableRowCount(page: Page) {
  return page.locator('[data-testid="portfolio-table"] tbody tr[data-testid^="row-"]').count();
}

export async function waitForApp(page: Page) {
  await expect(page.getByTestId("demo-indicator")).toBeVisible();
}
