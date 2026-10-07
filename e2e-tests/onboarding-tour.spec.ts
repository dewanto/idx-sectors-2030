import { test, expect } from "@playwright/test";

/**
 * Interactive onboarding tour (driver.js).
 * A fresh isolated session has empty localStorage, so the tour auto-starts
 * on the dashboard — exactly the first-visit behaviour under test.
 */

const POPOVER = ".driver-popover";
const TITLE = ".driver-popover-title";
const NEXT = "[data-tour-btn='next']";
const CLOSE = "[data-tour-btn='close']";

async function expectStep(page: import("@playwright/test").Page, title: string) {
  await expect(page.locator(TITLE)).toHaveText(title, { timeout: 15_000 });
}

test("guided tour walks a new visitor through all 7 stops", async ({ page }) => {
  await page.goto("/en");

  // first visit — tour auto-starts on the dashboard
  await expectStep(page, "Dashboard Overview");
  await expect(page.locator(".driver-popover-progress-text")).toHaveText("1 of 7");

  // step 2 — cross-page move to the signal picker
  await page.locator(NEXT).click();
  await expect(page).toHaveURL(/\/en\/picker$/, { timeout: 15_000 });
  await expectStep(page, "Signal Picker");

  // step 3 — same page (run scan)
  await page.locator(NEXT).click();
  await expectStep(page, "Run Scan");

  // step 4 — back to the dashboard signal cards
  await page.locator(NEXT).click();
  await expect(page).toHaveURL(/\/en$/, { timeout: 15_000 });
  await expectStep(page, "Signal Cards");

  // step 5 — heatmap
  await page.locator(NEXT).click();
  await expectStep(page, "Heatmap");

  // step 6 — company file
  await page.locator(NEXT).click();
  await expect(page).toHaveURL(/\/en\/companies\//, { timeout: 15_000 });
  await expectStep(page, "Company File");

  // step 7 — gann analysis
  await page.locator(NEXT).click();
  await expect(page).toHaveURL(/\/en\/gann$/, { timeout: 15_000 });
  await expectStep(page, "Gann Analysis");

  // finishing the last step marks the tour as seen
  await page.locator(NEXT).click();
  await expect(page.locator(POPOVER)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("idx2030_tour_done"))).toBe("1");
  expect(await page.evaluate(() => localStorage.getItem("idx2030_tour_step"))).toBeNull();
});

test("tour can be dismissed, remembered, and relaunched from the navbar", async ({ page }) => {
  await page.goto("/en");
  await expectStep(page, "Dashboard Overview");

  // dismiss mid-tour
  await page.locator(CLOSE).click();
  await expect(page.locator(POPOVER)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("idx2030_tour_done"))).toBe("1");

  // no auto-restart on the next visit — give the auto-start window time to fire
  await page.reload();
  await page.waitForLoadState("load");
  await page.waitForTimeout(1_500);
  await expect(page.locator(POPOVER)).toHaveCount(0);

  // navbar button relaunches the tour from step 1
  await page.getByRole("button", { name: "Take Tour" }).click();
  await expectStep(page, "Dashboard Overview");
  await expect(page.locator(".driver-popover-progress-text")).toHaveText("1 of 7");
});

test("tour text follows the active locale (Bahasa Indonesia)", async ({ page }) => {
  await page.goto("/id");

  await expectStep(page, "Ikhtisar Dasbor");
  await expect(page.getByRole("button", { name: "Ikuti Tur" })).toBeVisible();
  await expect(page.locator(".driver-popover-progress-text")).toHaveText("1 dari 7");

  await page.locator(NEXT).click();
  await expect(page).toHaveURL(/\/id\/picker$/, { timeout: 15_000 });
  await expectStep(page, "Pemilih Sinyal");
});