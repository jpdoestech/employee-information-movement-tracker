import { test, expect, type Page } from "@playwright/test";

async function accounts(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#permissions");
  await page.getByRole("button", { name: "Add user", exact: true }).click();
}

for (const [width, height] of [
  [1366, 768],
  [375, 740],
  [768, 1024],
  [812, 375],
]) {
  test(`create user preserves cancelled draft and enrolls only after Continue at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await accounts(page);
    const create = page.getByRole("button", {
      name: "Create user",
      exact: true,
    });
    await expect(create).toBeDisabled();
    await page
      .getByLabel("Email address", { exact: true })
      .fill("colleague@example.test");
    await page
      .getByLabel("Initial password", { exact: true })
      .fill("Synthetic-password-123!");
    await page
      .getByLabel("Display name", { exact: true })
      .fill("New colleague");
    await expect(create).toBeDisabled();
    await page
      .getByLabel("Reason for account change", { exact: true })
      .fill("Synthetic onboarding");
    await create.click();
    const confirmation = page.getByRole("dialog", {
      name: "Create user account",
      exact: true,
    });
    await expect(confirmation).toBeVisible();
    const bounds = await confirmation.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
    await confirmation
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await expect(
      page.getByLabel("Initial password", { exact: true }),
    ).toHaveValue("Synthetic-password-123!");
    await expect(
      page.getByRole("button", { name: "Deactivate account", exact: true }),
    ).toHaveCount(0);
    await create.click();
    await confirmation
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Add user", exact: true }),
    ).toHaveCount(0);
    const row = page.getByRole("row").filter({ hasText: "New colleague" });
    await expect(row).toContainText("Viewer");
    await row
      .getByRole("button", {
        name: "Manage account for New colleague",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", { name: "Deactivate account", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.getByRole("button", { name: "Add user", exact: true }).click();
    await expect(
      page.getByLabel("Initial password", { exact: true }),
    ).toHaveValue("");
    await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(
      "",
    );
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.screenshot({
      path: `.test-db/reports/release/accounts-${width}x${height}.png`,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const scroll = page.locator(".admin-scroll-region");
    const tabs = await page.locator(".admin-tabs").boundingBox();
    await scroll.evaluate(
      (element) => (element.scrollTop = element.scrollHeight),
    );
    expect(await page.locator(".admin-tabs").boundingBox()).toEqual(tabs);
  });
}
