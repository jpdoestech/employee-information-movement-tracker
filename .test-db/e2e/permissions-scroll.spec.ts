import { expect, test } from "@playwright/test";
for (const viewport of [
  { width: 375, height: 740 },
  { width: 768, height: 1024 },
  { width: 1366, height: 600 },
  { width: 812, height: 375 },
]) {
  test(`Permissions content scrolls under stationary tabs at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#permissions");
    const tabs = page.getByRole("navigation", { name: "Access configuration" });
    const region = page.locator(".admin-scroll-region");
    for (const name of ["Access rules", "Users", "Register settings"]) {
      await tabs.getByRole("button", { name, exact: true }).click();
      const before = await tabs.boundingBox();
      const bounds = await region.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.height).toBeGreaterThan(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
      await region.hover();
      await page.mouse.wheel(0, 10000);
      await expect
        .poll(() =>
          region.evaluate(
            (el) => el.scrollHeight - el.scrollTop - el.clientHeight,
          ),
        )
        .toBeLessThanOrEqual(1);
      expect(await tabs.boundingBox()).toEqual(before);
      await expect(
        tabs.getByRole("button", { name, exact: true }),
      ).toBeInViewport();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollHeight <= innerHeight + 1,
        ),
      ).toBe(true);
    }
  });
}
