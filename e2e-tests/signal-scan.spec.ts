import { test, expect } from "@playwright/test";

test("filter companies by SDG and enable right-time ranking", async ({ page }) => {
  await page.goto("/en/picker");

  await expect(page.getByRole("heading", { name: /Signal Scan/ })).toBeVisible();
  await page.getByRole("button", { name: "7", exact: true }).click();
  await expect(page.getByText("Affordable and Clean Energy")).toBeVisible();
  await expect(page.getByText(/companies found/)).toBeVisible();

  await page.getByRole("button", { name: "Find at the right time" }).click();
  await expect(page.getByText("Right-time mode:")).toBeVisible();
  await expect(page.getByText("ranked by timing + evidence")).toBeVisible();
});
