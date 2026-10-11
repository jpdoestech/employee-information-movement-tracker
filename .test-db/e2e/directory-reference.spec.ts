import { test, expect } from "@playwright/test";

for (const width of [375, 1440]) {
  test(`quiet search focus and inline filter clearing at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    const table = page.getByLabel("Scrollable employee table");
    await expect(table.locator("tbody tr").first()).toBeVisible();
    const search = page.getByRole("searchbox", { name: "Search employees" });
    const before = await search.boundingBox();
    await search.focus();
    expect(
      await search.evaluate((el) => getComputedStyle(el).outlineStyle),
    ).toBe("none");
    expect(await search.evaluate((el) => getComputedStyle(el).boxShadow)).toBe(
      "none",
    );
    expect(await search.boundingBox()).toEqual(before);
    const region = await table.boundingBox();
    if (width < 760)
      await page
        .getByRole("button", { name: "More filters", exact: true })
        .click();
    await page.getByRole("button", { name: "Status", exact: true }).click();
    const picker = page.getByRole("dialog", {
      name: "Status options",
      exact: true,
    });
    const optionSearch = picker.getByRole("combobox");
    expect(
      await optionSearch.evaluate((el) => getComputedStyle(el).outlineStyle),
    ).toBe("none");
    await picker.getByRole("option", { name: "Inactive", exact: true }).click();
    await picker.getByRole("button", { name: "Apply", exact: true }).click();
    if (width < 760)
      await page
        .getByRole("dialog", { name: "More filters", exact: true })
        .getByRole("button", { name: "Close More filters" })
        .click();
    await expect(table.locator("tbody tr")).toHaveCount(5);
    await expect(page.locator(".chips")).toHaveCount(0);
    expect(await table.boundingBox()).toEqual(region);
    await page.screenshot({
      path: `.test-db/reports/screenshots/directory-reference-${width}.png`,
    });
    if (width < 760)
      await page
        .getByRole("button", { name: "More filters", exact: true })
        .click();
    await page
      .getByRole("button", { name: "Clear Status", exact: true })
      .click();
    if (width < 760)
      await page
        .getByRole("dialog", { name: "More filters", exact: true })
        .getByRole("button", { name: "Close More filters" })
        .click();
    await expect(table.locator("tbody tr")).toHaveCount(25);
    if (width > 760) {
      expect((await page.locator(".sidebar").boundingBox())!.width).toBe(72);
      await expect(
        page.getByRole("navigation", { name: "Section navigation" }),
      ).toBeVisible();
    }
  });
}
