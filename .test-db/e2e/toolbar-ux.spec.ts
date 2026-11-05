import { test, expect } from "@playwright/test";
for (const [width, height] of [
  [1913, 900],
  [1440, 900],
  [768, 1024],
  [390, 844],
  [844, 390],
]) {
  test(`employee toolbar fits controls and keeps filters usable at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() =>
      localStorage.setItem(
        "eimt-synthetic-managed-views",
        JSON.stringify([
          {
            id: "global",
            name: "Employee register",
            user_id: null,
            scope_type: "all",
            scope_id: null,
            config: {
              columns: ["name", "position"],
              pinned: ["name"],
              showRowNumbers: true,
            },
          },
        ]),
      ),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    await page.evaluate(() => window.trackerAppearance.setTheme("dark"));
    if (width > 760)
      await page
        .getByRole("button", { name: "Expand sidebar", exact: true })
        .click();
    const toolbar = page.getByRole("region", {
      name: "Employee toolbar",
      exact: true,
    });
    const search = toolbar.getByRole("searchbox", { name: "Search employees" });
    await expect(search).toHaveAttribute("placeholder", "Search employees…");
    const searchBounds = (await search.boundingBox())!;
    expect(searchBounds.width).toBeGreaterThan(140);
    const add = toolbar.getByRole("button", {
      name: "Add employee",
      exact: true,
    });
    if (width === 1913) {
      const bounds = (await toolbar.boundingBox())!;
      const action = (await add.boundingBox())!;
      expect(action.x + action.width).toBeLessThanOrEqual(
        bounds.x + bounds.width,
      );
    }
    const table = page.getByLabel("Scrollable employee table");
    const before = await table.boundingBox();
    await toolbar.getByRole("button", { name: "Status", exact: true }).click();
    const picker = page.getByRole("dialog", {
      name: "Status options",
      exact: true,
    });
    const bounds = (await picker.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
    await picker.getByRole("option", { name: "Inactive", exact: true }).click();
    await picker.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(table.locator("tbody tr")).toHaveCount(5);
    expect(await table.boundingBox()).toEqual(before);
    await toolbar
      .getByRole("button", { name: "Clear Status", exact: true })
      .click();
    await expect(table.locator("tbody tr")).toHaveCount(25);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await add.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(add).toBeFocused();
    await expect(add).toBeInViewport();
    expect(
      await add.evaluate((e) => getComputedStyle(e).outlineStyle),
    ).not.toBe("none");
    await search.focus();
    await page.screenshot({
      path: `.test-db/reports/screenshots/toolbar-ux-${width}.png`,
    });
  });
}
