import { test, expect } from "@playwright/test";
const sizes = [
  [1366, 768],
  [1920, 1080],
  [768, 1024],
  [390, 844],
  [844, 390],
];
for (const theme of ["light", "dark"])
  for (const [width, height] of sizes) {
    test(`AMS ${theme} workspace and dialogs at ${width}x${height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.addInitScript(
        (value) => localStorage.setItem("eimt-theme", value),
        theme,
      );
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page
        .getByRole("button", { name: "Explore synthetic demo" })
        .click();
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
        await expect(page.locator("main")).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const box = await page.locator(".workspace-footer").boundingBox();
        expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
      }
      await page.goto("/#employees");
      await page
        .getByRole("button", { name: "EMP-0000002", exact: true })
        .click();
      const editor = page.getByRole("dialog", {
        name: "Employee profile",
        exact: true,
      });
      await editor
        .getByRole("button", { name: "Edit details", exact: true })
        .click();
      await editor
        .getByLabel("Last Name", { exact: false })
        .fill("Draft preserved");
      const chrome = await editor.locator(":scope > footer").boundingBox();
      await editor
        .locator(".employee-tab-body")
        .evaluate((el) => (el.scrollTop = el.scrollHeight));
      expect((await editor.locator(":scope > footer").boundingBox())!.y).toBe(
        chrome!.y,
      );
      const bounds = await editor.boundingBox();
      expect(bounds!.width).toBeLessThanOrEqual(Math.min(width, 880));
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
      await page.screenshot({
        path: `.test-db/reports/verification/ams-${theme}-${width}.png`,
      });
      await editor.getByRole("button", { name: "Close dialog" }).click();
      const discard = page.getByRole("dialog", {
        name: "Discard unsaved changes?",
      });
      await discard
        .getByRole("button", { name: "Continue editing", exact: true })
        .click();
      await expect(
        editor.getByRole("textbox", { name: "Last Name", exact: true }),
      ).toHaveValue("Draft preserved");
    });
  }
test("appearance and rail persist without resetting data or drafts", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#employees");
  await page
    .getByRole("searchbox", { name: "Search employees" })
    .fill("Employee 02");
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  const choices = page.getByRole("dialog", { name: "Appearance", exact: true });
  await choices.getByRole("button", { name: "Light", exact: true }).click();
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await choices
    .getByRole("button", { name: "Close Appearance", exact: true })
    .click();
  await expect(
    page.getByRole("searchbox", { name: "Search employees" }),
  ).toHaveValue("Employee 02");
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-sidebar",
    "expanded",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("mobile navigation contains keyboard focus and Escape restores its opener", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  const opener = page.getByRole("button", { name: "Open navigation", exact: true });
  await opener.click();
  const drawer = page.getByRole("dialog", { name: "Navigation", exact: true });
  const close = drawer.getByRole("button", { name: "Close navigation", exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(drawer.getByRole("link", { name: "Audit history", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await expect(page.locator(".workspace")).not.toHaveAttribute("inert");
});
