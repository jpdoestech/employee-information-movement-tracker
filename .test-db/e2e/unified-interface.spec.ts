import { test, expect } from "@playwright/test";
const output = ".test-db/reports/ui-modernization";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("eimt-theme", "light"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://**", (route) => route.abort("blockedbyclient"));
});
for (const [width, height] of [
  [320, 740],
  [375, 812],
  [390, 844],
  [768, 1024],
  [1024, 768],
  [1280, 800],
  [1440, 1000],
  [1920, 1080],
  [844, 390],
]) {
  test(`integrated dashboard retains approved composition and content at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await expect(page.locator(".analytics-stats strong").first()).toHaveText(
      "29",
    );
    await expect(page.locator(".analytics-stats .stat")).toHaveCount(6);
    await expect(page.locator(".analytics-panel")).toHaveCount(5);
    const toolbar = page.locator(".analytics-toolbar");
    const before = await toolbar.boundingBox();
    const nav = page.getByRole("navigation", {
      name: "Primary mobile navigation",
      exact: true,
    });
    const navBefore = width <= 760 ? await nav.boundingBox() : null;
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `${output}/unified-dashboard-${width}x${height}.png`,
    });
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: `${output}/unified-dashboard-${width === 390 ? "mobile" : "desktop"}.png`,
      });
    await page
      .locator(".analytics-scroll")
      .evaluate((element) => (element.scrollTop = element.scrollHeight));
    expect(await toolbar.boundingBox()).toEqual(before);
    if (navBefore) expect(await nav.boundingBox()).toEqual(navBefore);
    await expect(
      page.getByRole("link", { name: /Payroll|Attendance|Recruitment|Leave/ }),
    ).toHaveCount(0);
    if (width === 390)
      await page.screenshot({
        path: `${output}/unified-dashboard-mobile-details.png`,
      });
    if (width === 1440) {
      await page.evaluate(() => window.trackerAppearance.setTheme("dark"));
      await page
        .locator(".analytics-scroll")
        .evaluate((element) => (element.scrollTop = 0));
      await page.screenshot({ path: `${output}/unified-dashboard-dark.png` });
    }
  });
}
for (const width of [390, 1440]) {
  test(`finished module inventory stays bounded at ${width}px`, async ({
    page,
  }) => {
    const height = width === 390 ? 844 : 1000;
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
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
      if (route === "employees")
        await expect(
          page.getByRole("button", { name: "EMP-0000002", exact: true }),
        ).toBeVisible();
      if (["movements", "organization", "audit"].includes(route))
        await page.locator('.data-scroll-region[aria-busy="false"]').waitFor();
      if (route === "fields")
        await expect(
          page.getByRole("button", {
            name: "Edit group Personal Information",
            exact: true,
          }),
        ).toBeVisible();
      if (route === "permissions") {
        await page
          .getByRole("button", {
            name: "Edit access for Demo Administrator",
            exact: true,
          })
          .click();
        await expect(page.locator(".permission-matrix")).toBeVisible();
      }
      if (route === "sync")
        await expect(
          page.getByText("Google account not connected", { exact: true }),
        ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: `${output}/unified-${route}-${width}.png`,
      });
    }
    await page.goto("/#employees");
    await page
      .getByRole("button", { name: "EMP-0000002", exact: true })
      .click();
    const profile = page.getByRole("region", {
      name: "Employee profile",
      exact: true,
    });
    await expect(profile).toBeVisible();
    await page.screenshot({ path: `${output}/unified-profile-${width}.png` });
    await profile
      .getByRole("button", { name: "Edit details", exact: true })
      .click();
    await expect(
      profile.getByRole("textbox", { name: "Last Name", exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: `${output}/unified-editor-${width}.png` });
  });
}
