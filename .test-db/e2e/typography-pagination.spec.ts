import { test, expect } from "@playwright/test";

for (const [width, height] of [
  [375, 740],
  [1366, 600],
]) {
  test(`bundled typography and compact page-size selection at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    const rows = page
      .getByLabel("Scrollable employee table")
      .locator("tbody tr");
    await expect(rows).toHaveCount(25);
    const fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      return {
        loaded: Array.from(document.fonts).some(
          (font) => font.family === "Inter" && font.status === "loaded",
        ),
        body: getComputedStyle(document.body).fontFamily,
        input: getComputedStyle(document.querySelector("input")!).fontFamily,
        button: getComputedStyle(document.querySelector("button")!).fontFamily,
      };
    });
    expect(fonts.loaded).toBe(true);
    for (const family of [fonts.body, fonts.input, fonts.button])
      expect(family).toContain("Inter");
    const size = page.getByRole("combobox", {
      name: "Rows per page",
      exact: true,
    });
    expect((await size.boundingBox())!.width).toBeLessThan(100);
    await expect(size.locator("option")).toHaveText(["10", "25", "50", "100"]);
    await size.selectOption("10");
    await expect(rows).toHaveCount(10);
    await expect(page.locator(".pagination")).toContainText("1–10 of 34");
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(page.locator(".pagination")).toContainText("11–20 of 34");
    await size.selectOption("50");
    await expect(rows).toHaveCount(34);
    await expect(page.locator(".pagination")).toContainText("1–34 of 34");
    await expect(
      page.getByRole("button", { name: "Next page", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("textbox", { name: "Search rows per page", exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.test-db/reports/verification/typography-pagination-${width}.png`,
    });
    await page.goto("/#organization");
    await expect(
      page.getByRole("combobox", { name: "Rows per page", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Rows per page", exact: true })
      .selectOption("10");
    await expect(
      page.getByRole("combobox", { name: "Rows per page", exact: true }),
    ).toHaveValue("10");
  });
}
