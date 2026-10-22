import { test, expect, type Page } from "@playwright/test";
async function enter(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#employees");
  await expect(
    page.getByLabel("Scrollable employee table").locator("tbody tr").first(),
  ).toBeVisible();
}
for (const [width, height] of [
  [375, 740],
  [1366, 600],
  [1920, 900],
]) {
  test(`content widths, uniform rows and minimal chrome at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await enter(page);
    await page
      .getByRole("button", { name: "Customize Columns", exact: true })
      .click();
    const designer = page.getByRole("dialog", {
      name: "Customize Columns",
      exact: true,
    });
    await designer
      .getByRole("button", { name: "Visible columns", exact: true })
      .click();
    const picker = page.getByRole("dialog", {
      name: "Visible columns options",
      exact: true,
    });
    await picker
      .getByRole("button", { name: "Select visible", exact: true })
      .click();
    await picker.getByRole("button", { name: "Apply", exact: true }).click();
    await designer
      .getByRole("button", { name: "Apply & Save", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Save personal view", exact: true })
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(designer).toHaveCount(0);
    const table = page.getByLabel("Scrollable employee table");
    const sizes = await table.evaluate((el) => {
      const rows = Array.from(el.querySelectorAll("tbody tr"));
      const bottom = el.getBoundingClientRect().bottom;
      return {
        heights: rows.map((r) => r.getBoundingClientRect().height),
        visible: rows.filter(
          (r) => r.getBoundingClientRect().bottom <= bottom - 14,
        ).length,
        emailWidth: el
          .querySelector('td[title="synthetic1@example.invalid"]')
          ?.getBoundingClientRect().width,
        phoneWidth: el
          .querySelector('td[title="0912-345-6789"]')
          ?.getBoundingClientRect().width,
      };
    });
    expect(
      Math.max(...sizes.heights) - Math.min(...sizes.heights),
    ).toBeLessThan(1);
    if (width > 760) {
      expect(sizes.visible).toBeGreaterThanOrEqual(height < 700 ? 9 : 15);
      expect(Math.max(...sizes.heights)).toBeLessThanOrEqual(40);
    }
    expect(sizes.emailWidth).toBeGreaterThan(sizes.phoneWidth!);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("status").filter({ hasText: "Loading authorized data" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Dismiss notice" }).click();
    await page.screenshot({
      path: `.test-db/reports/screenshots/dense-register-${width}.png`,
    });
  });
}

test("long saved-view names wrap within their control instead of clipping", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await enter(page);
  await page
    .getByRole("button", { name: "Customize Columns", exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: "Customize Columns",
    exact: true,
  });
  const name = "North branch employee register and client placements";
  await editor.getByRole("tab", { name: "View settings", exact: true }).click();
  await editor.getByLabel("Saved view name", { exact: true }).fill(name);
  await editor
    .getByRole("button", { name: "Apply & Save", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Save personal view", exact: true })
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await page.getByRole("button", { name: "Saved view", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Saved view options", exact: true })
    .getByRole("option", { name, exact: true })
    .click();
  const label = page
    .getByRole("button", { name: "Saved view", exact: true })
    .locator(".picker-label");
  await expect(label).toHaveText(name);
  expect(
    await label.evaluate(
      (el) =>
        el.scrollHeight <= el.clientHeight + 1 &&
        el.scrollWidth <= el.clientWidth + 1,
    ),
  ).toBe(true);
  expect(await label.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe(
    "normal",
  );
});

test("slow transaction feedback disappears after three seconds without cancelling the transaction", async ({
  page,
}) => {
  await enter(page);
  await page.getByRole("button", { name: "Add employee", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "New employee",
    exact: true,
  });
  const before = await editor.boundingBox();
  await page.evaluate(async () => {
    // Exercise the same tracker used by mutation and preview RPCs with controlled latency.
    const moduleUrl = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname === "/src/transactions.ts");
    if (!moduleUrl) throw new Error("Transaction module was not loaded");
    const { trackTransaction, pendingTransactions } = await import(
      /* @vite-ignore */ moduleUrl
    );
    (window as any).pendingTransactionCount = () =>
      pendingTransactions().length;
    void trackTransaction(
      "Saving employee",
      () =>
        new Promise<void>((resolve) => {
          (window as any).finishSlowTransaction = resolve;
        }),
    );
  });
  const progress = editor.locator('.floating-notification[role="status"]');
  await expect(progress).toContainText("Saving employee");
  expect(await editor.boundingBox()).toEqual(before);
  await expect(progress).toHaveCount(0, { timeout: 4000 });
  expect(
    await page.evaluate(() => (window as any).pendingTransactionCount()),
  ).toBe(1);
  await page.evaluate(() => (window as any).finishSlowTransaction());
  await expect
    .poll(() => page.evaluate(() => (window as any).pendingTransactionCount()))
    .toBe(0);
  await expect(progress).toHaveCount(0);
});
