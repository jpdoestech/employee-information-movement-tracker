import { test, expect } from "@playwright/test";

for (const [width, height] of [
  [1440, 900],
  [390, 844],
  [320, 740],
  [768, 1024],
  [844, 390],
]) {
  test(`overview analytics stays bounded and usable at ${width}x${height}`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    if (width === 768)
      await page.evaluate(() => window.trackerAppearance.setTheme("dark"));
    await expect(
      page.getByRole("heading", { name: "Management Analytics" }),
    ).toBeVisible();
    await expect(
      page.locator(".analytics-stats .stat").first().locator("strong"),
    ).not.toHaveText("—");
    const contrast = await page
      .locator(".analytics-stats .stat")
      .first()
      .evaluate((card) => {
        const luminance = (color: string) => {
          const values = color
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number)
            .map((v) => {
              const n = v / 255;
              return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
            });
          return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
        };
        const background = luminance(getComputedStyle(card).backgroundColor);
        return Math.min(
          ...[".stat-label", "strong", "small"].map((selector) => {
            const foreground = luminance(
              getComputedStyle(card.querySelector(selector)!).color,
            );
            return (
              (Math.max(background, foreground) + 0.05) /
              (Math.min(background, foreground) + 0.05)
            );
          }),
        );
      });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    const toolbar = page.locator(".analytics-toolbar");
    const before = await toolbar.boundingBox();
    await page.locator(".analytics-scroll").evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
    expect((await toolbar.boundingBox())!.y).toBe(before!.y);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Date range", exact: true }).click();
    const picker = page.getByRole("dialog", {
      name: "Date range options",
      exact: true,
    });
    const bounds = await picker.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
    await picker.getByRole("option", { name: /^90D/ }).click();
    await expect(
      page.getByRole("button", { name: "Date range", exact: true }),
    ).toContainText("90D");
    await page.getByRole("button", { name: "Date range", exact: true }).click();
    await picker.getByRole("option", { name: /^Custom date/ }).click();
    await page
      .getByRole("button", { name: "Edit date range", exact: true })
      .click();
    const custom = page.getByRole("dialog", {
      name: "Edit date range",
      exact: true,
    });
    await custom.getByLabel("From date").fill("2026-01-01");
    await custom.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(custom).toHaveCount(0);
    await expect(page.locator(".analytics-range")).not.toContainText(
      "2026-01-01",
    );
    await page
      .getByRole("button", { name: "Edit date range", exact: true })
      .click();
    await custom.getByLabel("From date").fill("2026-01-01");
    await custom.getByLabel("To date").fill("2026-01-31");
    await custom.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.locator(".analytics-range")).toContainText("2026-01-01");
    await expect(page.locator(".management-analytics")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await page.locator(".analytics-scroll").evaluate((e) => {
      e.scrollTop = 0;
    });
    await page
      .getByRole("button", { name: "Workforce grouping", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Workforce grouping options", exact: true })
      .getByRole("option", { name: "Client", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Workforce grouping", exact: true }),
    ).toContainText("Client");
    const mix = page.getByRole("region", {
      name: "Age and gender mix",
      exact: true,
    });
    await expect(mix.getByRole("table")).toHaveCount(0);
    await expect(mix.locator(".analytics-distribution-row")).toHaveCount(6);
    await expect(mix).toContainText("18–25");
    await expect(mix).toContainText("61+");
    await expect(mix.locator(".analytics-category").first()).toContainText(":");
    expect(
      await mix.locator(".analytics-distribution").evaluate((element) => ({
        overflow: getComputedStyle(element).overflowY,
        clipped: element.scrollHeight > element.clientHeight,
      })),
    ).toEqual({ overflow: "visible", clipped: false });
    const firstAge = mix.locator(".analytics-distribution-row").first();
    await firstAge.scrollIntoViewIfNeeded();
    const scrollBefore = await page
      .locator(".analytics-scroll")
      .evaluate((e) => e.scrollTop);
    await firstAge.hover();
    await page.mouse.wheel(0, 150);
    await expect
      .poll(() =>
        page.locator(".analytics-scroll").evaluate((e) => e.scrollTop),
      )
      .toBeGreaterThan(scrollBefore);
    await page.screenshot({
      path: `.test-db/reports/screenshots/age-gender-${width}x${height}.png`,
    });
    await page.locator(".analytics-scroll").evaluate((e) => {
      e.scrollTop = 0;
    });
    await page.screenshot({
      path: `.test-db/reports/screenshots/analytics-${width}x${height}.png`,
    });
    await page
      .getByRole("button", { name: "Staffing / PRFs", exact: true })
      .click();
    const list = page.getByRole("dialog", {
      name: "Client staffing / PRFs",
      exact: true,
    });
    await list
      .getByRole("button", { name: "More filters", exact: true })
      .click();
    const staffingFilters = page.getByRole("dialog", {
      name: "More filters",
      exact: true,
    });
    await expect(staffingFilters).toBeVisible();
    await staffingFilters
      .getByRole("button", { name: "Close More filters", exact: true })
      .click();
    await list.getByRole("button", { name: "Add PRF", exact: true }).click();
    const editor = page.getByRole("dialog", {
      name: "Add staffing PRF",
      exact: true,
    });
    const footer = (await editor.locator("footer").boundingBox())!;
    expect(footer.y + footer.height).toBeLessThanOrEqual(height);
    await editor
      .getByRole("button", { name: "PRF client", exact: true })
      .click();
    const clientPicker = page.getByRole("dialog", {
      name: "PRF client options",
      exact: true,
    });
    const clientBounds = (await clientPicker.boundingBox())!;
    expect(clientBounds.x).toBeGreaterThanOrEqual(0);
    expect(clientBounds.y + clientBounds.height).toBeLessThanOrEqual(height);
    await page.keyboard.press("Escape");
    const close = editor.getByRole("button", {
      name: "Close dialog",
      exact: true,
    });
    await close.focus();
    expect(
      await close.evaluate((e) => getComputedStyle(e).outlineStyle),
    ).not.toBe("none");
    await page.screenshot({
      path: `.test-db/reports/screenshots/staffing-${width}x${height}.png`,
    });
    await close.click();
    await list
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
  });
}

test("PRF confirmation cancellation keeps draft, saves once, updates fill rate and preserves edit versions", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page
    .getByRole("button", { name: "Staffing / PRFs", exact: true })
    .click();
  const list = page.getByRole("dialog", {
    name: "Client staffing / PRFs",
    exact: true,
  });
  await list.getByRole("button", { name: "Add PRF", exact: true }).click();
  let editor = page.getByRole("dialog", {
    name: "Add staffing PRF",
    exact: true,
  });
  await editor.getByLabel("PRF No.", { exact: true }).fill("DEMO-PRF-01");
  await editor.getByRole("button", { name: "PRF client", exact: true }).click();
  await page
    .getByRole("dialog", { name: "PRF client options", exact: true })
    .getByRole("option")
    .first()
    .click();
  await editor
    .getByRole("button", { name: "PRF Employment Type", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "PRF Employment Type options", exact: true })
    .getByRole("option", { name: "Regular", exact: true })
    .click();
  await editor
    .getByRole("textbox", { name: /^Department(?: \*)?$/ })
    .fill("Operations");
  await editor
    .getByRole("textbox", { name: /^Position required(?: \*)?$/ })
    .fill("Coordinator");
  await editor.getByLabel("Required headcount").fill("20");
  await editor.getByRole("button", { name: "Save PRF", exact: true }).click();
  const confirm = page.getByRole("dialog", {
    name: "Save staffing PRF",
    exact: true,
  });
  await expect(editor.getByLabel("PRF No.", { exact: true })).toBeDisabled();
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(editor.getByLabel("PRF No.", { exact: true })).toBeEnabled();
  await expect(editor.getByLabel("PRF No.", { exact: true })).toHaveValue(
    "DEMO-PRF-01",
  );
  await editor.getByRole("button", { name: "Save PRF", exact: true }).click();
  await confirm.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(
    list.getByRole("cell", { name: "DEMO-PRF-01", exact: true }),
  ).toBeVisible();
  await list
    .getByRole("button", { name: "Edit DEMO-PRF-01", exact: true })
    .click();
  editor = page.getByRole("dialog", { name: "Edit staffing PRF", exact: true });
  await editor.getByLabel("Required headcount").fill("25");
  await editor
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  const discard = page.getByRole("dialog", {
    name: "Discard unsaved changes?",
    exact: true,
  });
  await discard
    .getByRole("button", { name: "Continue editing", exact: true })
    .click();
  await expect(editor.getByLabel("Required headcount")).toHaveValue("25");
  await editor.getByRole("button", { name: "Save PRF", exact: true }).click();
  await confirm.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await list.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.locator(".analytics-stats .stat").nth(1)).toContainText(
    "25 required today",
  );
});
