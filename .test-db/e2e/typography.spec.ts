import { test, expect, type Locator } from "@playwright/test";

async function size(el: Locator, pixels: string) {
  await expect(el).toBeVisible();
  expect(await el.evaluate((e) => getComputedStyle(e).fontSize)).toBe(pixels);
}
async function bounded(el: Locator, width: number, height: number) {
  const box = (await el.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
  expect(await el.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(
    true,
  );
}
for (const [width, height] of [
  [320, 740],
  [375, 812],
  [768, 1024],
  [1366, 768],
  [812, 375],
  [1920, 1080],
]) {
  test(`shared page typography at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const fontRequests: string[] = [];
    page.on("request", (r) => {
      if (r.resourceType() === "font") fontRequests.push(r.url());
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    expect(
      await page
        .locator("body")
        .evaluate((e) => getComputedStyle(e).fontFamily),
    ).toContain("Segoe UI Variable");
    await size(page.locator(".stat strong").first(), "30px");
    for (const route of [
      "employees",
      "movements",
      "organization",
      "fields",
      "permissions",
      "sync",
      "audit",
    ]) {
      await page.goto(`/#${route}`);
      await size(page.locator(".topbar h1"), "14px");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    }
    await page.goto("/#employees");
    const table = page.getByLabel("Scrollable employee table");
    await expect(table.locator("tbody tr").first()).toBeVisible();
    await size(table.locator(".employee-name").first(), "12px");
    expect(
      await table
        .locator(".employee-name")
        .first()
        .evaluate((e) => getComputedStyle(e).fontWeight),
    ).toBe("600");
    await size(table.locator(".employee-id .text-link").first(), "11px");
    expect(
      await table
        .locator(".employee-id")
        .first()
        .evaluate((e) => getComputedStyle(e).fontFamily),
    ).toContain("monospace");
    await size(table.locator("th button").first(), "10px");
    expect(
      await table
        .locator("th button")
        .first()
        .evaluate((e) => getComputedStyle(e).textTransform),
    ).toBe("uppercase");
    await size(
      page.getByRole("searchbox", { name: "Search employees" }),
      "12px",
    );
    expect(
      await page
        .locator(".register > .workspace-toolbar")
        .evaluate((e) => getComputedStyle(e).paddingLeft),
    ).toBe("12px");
    expect(
      await page
        .locator(".register > .workspace-toolbar")
        .evaluate((e) => getComputedStyle(e).paddingRight),
    ).toBe("12px");
    if (width > 760)
      expect(
        (await page.locator(".register .search-control").boundingBox())!.width,
      ).toBeLessThanOrEqual(320);
    if (width < 760)
      expect(
        (await page.locator(".register .search-control").boundingBox())!.width,
      ).toBeGreaterThanOrEqual(180);
    const scrollBefore = await table.boundingBox();
    await table.evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
    expect(await table.boundingBox()).toEqual(scrollBefore);
    await bounded(page.locator(".register .pagination"), width, height);
    expect(fontRequests).toEqual([]);
    await page.screenshot({
      path: `.test-db/reports/verification/typography-page-${width}x${height}.png`,
    });
  });
  test(`shared modal typography at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    for (const [route, button, title] of [
      ["employees", "Add employee", "New employee"],
      ["fields", "New field", "Create field definition"],
      ["movements", "New transaction", "New movement transaction"],
      ["employees", "Customize Columns", "Customize Columns"],
      [
        "employees",
        "Configure client filters and defaults",
        "Client entry settings",
      ],
    ]) {
      await page.goto(`/#${route}`);
      await page.getByRole("button", { name: button, exact: true }).click();
      const modal = page.getByRole("dialog", { name: title, exact: true });
      await size(modal.locator("header h2"), "14px");
      await bounded(modal, width, height);
      if (title === "Customize Columns")
        await modal.getByRole("tab", { name: "View settings" }).click();
      const input = modal
        .locator('input:not([type="checkbox"]), textarea')
        .first();
      if (await input.count()) await size(input, "14px");
      const label = modal.locator(".field > label").first();
      if (title === "New employee") {
        await size(label, "11px");
        expect(
          await label.evaluate((e) => getComputedStyle(e).fontFamily),
        ).toContain("Segoe UI Variable");
      }
      if (title === "Create field definition") {
        const type = modal.getByRole("button", {
          name: "Field type",
          exact: true,
        });
        await size(type, "14px");
        expect(
          (await type.locator(".picker-label").boundingBox())!.height,
        ).toBeLessThanOrEqual(22);
      }
      await page.screenshot({
        path: `.test-db/reports/verification/typography-${route}-${width}x${height}.png`,
      });
      await modal
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
    }
  });
}
