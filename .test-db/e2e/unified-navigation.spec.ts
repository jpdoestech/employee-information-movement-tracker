import { test, expect } from "@playwright/test";

test("desktop starts labelled and respects a saved collapsed sidebar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-sidebar",
    "expanded",
  );
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-sidebar",
    "collapsed",
  );
  await expect(
    page.getByRole("navigation", { name: "Primary mobile navigation" }),
  ).toHaveCount(0);
});

for (const [width, height] of [
  [320, 740],
  [390, 844],
  [667, 375],
]) {
  test(`mobile navigation preserves drafts and drawer focus at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    const nav = page.getByRole("navigation", {
      name: "Primary mobile navigation",
      exact: true,
    });
    await nav.getByRole("link", { name: "Employees", exact: true }).click();
    await expect(
      nav.getByRole("link", { name: "Employees", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    const frame = await nav.boundingBox();
    for (const control of await nav.locator("a,button").all()) {
      const bounds = (await control.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    await page
      .getByRole("button", { name: "Add employee", exact: true })
      .click();
    const editor = page.getByRole("region", {
      name: "New employee",
      exact: true,
    });
    const name = editor.getByRole("textbox", { name: /^Last Name/ });
    await name.fill("Navigation draft");
    await nav.getByRole("link", { name: "Movements", exact: true }).click();
    const prompt = page.getByRole("dialog", {
      name: "Discard unsaved changes?",
      exact: true,
    });
    await prompt
      .getByRole("button", { name: "Continue editing", exact: true })
      .click();
    await expect(name).toHaveValue("NAVIGATION DRAFT");
    await nav
      .getByRole("button", { name: "More navigation", exact: true })
      .click();
    await expect(page.locator(".workspace")).toHaveAttribute("inert");
    await page.keyboard.press("Escape");
    await expect(
      nav.getByRole("button", { name: "More navigation", exact: true }),
    ).toBeFocused();
    await editor
      .locator(".employee-tab-body")
      .evaluate((element) => (element.scrollTop = element.scrollHeight));
    expect(await nav.boundingBox()).toEqual(frame);
    const footer = (await editor.locator(":scope > footer").boundingBox())!;
    expect(footer.y + footer.height).toBeLessThanOrEqual(frame!.y);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await nav.getByRole("link", { name: "Movements", exact: true }).click();
    await prompt
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await expect(page.locator(".topbar h1")).toHaveText("Movements");
  });
}
