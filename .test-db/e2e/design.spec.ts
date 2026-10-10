import { test, expect } from "@playwright/test";

const routes = [
  ["dashboard", "Overview"],
  ["employees", "Employees"],
  ["movements", "Movements"],
  ["organization", "Organization"],
  ["fields", "Field Builder"],
  ["permissions", "Permissions"],
  ["sync", "Sheets sync"],
  ["audit", "Audit history"],
];

for (const width of [375, 1440]) {
  test(`all workspace screens fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    for (const [route, title] of routes) {
      await page.goto(`/#${route}`);
      await expect(
        page.getByRole("heading", { name: title, exact: true }).first(),
      ).toBeVisible();
      await expect(page.locator(".loading-line")).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      if (width < 760)
        await page.getByRole("button", { name: "Open navigation" }).click();
      const active = page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: title, exact: true });
      await expect(active).toHaveAttribute("aria-current", "page");
      await expect(active).toBeVisible();
      if (width < 760)
        await page
          .getByRole("button", { name: "Close navigation" })
          .click({ position: { x: width - 12, y: 12 } });
      if (["dashboard", "employees", "permissions"].includes(route))
        await page.screenshot({
          path: `.test-db/reports/screenshots/${route}-${width}.png`,
          fullPage: true,
        });
    }
  });
}

test("navy and gray theme maintains readable text and keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/");
  await page.screenshot({
    path: ".test-db/reports/screenshots/login-1440.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await expect(page.locator(".stat strong").first()).not.toHaveText("—");
  const ratios = await page.evaluate(() => {
    const rgb = (value: string) =>
      value
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number);
    const lum = (value: string) =>
      rgb(value)
        .map((v) => {
          const n = v / 255;
          return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
        })
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    return [
      ".sidebar nav a.active",
      ".sidebar nav a:not(.active)",
      ".brand small",
      ".environment-badge",
      ".stat small",
      ".breadcrumb",
    ].map((selector) => {
      const el = document.querySelector(selector)!;
      let ancestor: Element | null = el;
      while (
        ancestor &&
        getComputedStyle(ancestor).backgroundColor === "rgba(0, 0, 0, 0)"
      )
        ancestor = ancestor.parentElement;
      const fg = lum(getComputedStyle(el).color),
        bg = lum(getComputedStyle(ancestor!).backgroundColor);
      return {
        selector,
        ratio: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
      };
    });
  });
  for (const { selector, ratio } of ratios)
    expect(ratio, selector).toBeGreaterThanOrEqual(4.5);
  const active = page
    .getByRole("navigation")
    .getByRole("link", { name: "Overview", exact: true });
  await active.focus();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(
      () => getComputedStyle(document.activeElement!).outlineStyle,
    ),
  ).toBe("solid");
});
