import { test, expect } from "@playwright/test";
for (const [width, height] of [
  [1440, 900],
  [390, 844],
  [768, 1024],
  [844, 390],
]) {
  test(`column preview is readable, read-only and follows draft pins at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    await page
      .getByRole("button", { name: "Customize Columns", exact: true })
      .click();
    const editor = page.getByRole("dialog", {
      name: "Customize Columns",
      exact: true,
    });
    const preview = editor.getByLabel("Live column preview", { exact: true });
    await expect(preview).toContainText("Sample employee");
    await expect(preview).not.toContainText("Synthetic Employee");
    await expect(preview.locator("button,input,a")).toHaveCount(0);
    await editor
      .getByRole("button", { name: "Visible columns", exact: true })
      .click();
    const picker = page.getByRole("dialog", {
      name: "Visible columns options",
      exact: true,
    });
    await picker.getByRole("combobox").fill("Age");
    await picker.getByRole("option", { name: /^Age / }).click();
    await picker.getByRole("button", { name: "Apply", exact: true }).click();
    await editor.getByRole("button", { name: "Pin age", exact: true }).click();
    const listKeys = await editor
      .locator(".column-list li")
      .evaluateAll((items) =>
        items.map((el) => el.getAttribute("data-column-key")),
      );
    expect(listKeys.slice(0, 2)).toEqual(["name", "age"]);
    const headers = await preview
      .locator("thead th:not(.row-ordinal)")
      .allTextContents();
    expect(headers.slice(0, 2)).toEqual(["Employee Name", "Age"]);
    await editor
      .getByRole("checkbox", { name: "Select Age to move", exact: true })
      .check();
    await editor
      .getByRole("button", { name: "Move selected columns up", exact: true })
      .click();
    expect(
      (
        await preview.locator("thead th:not(.row-ordinal)").allTextContents()
      ).slice(0, 2),
    ).toEqual(["Age", "Employee Name"]);
    await expect(
      editor.getByRole("button", {
        name: "Move selected columns up",
        exact: true,
      }),
    ).toBeDisabled();
    const bounds = await preview.boundingBox();
    expect(bounds!.width).toBeGreaterThan(100);
    expect(bounds!.height).toBeGreaterThan(55);
    if (width <= 760) {
      const orderBounds = (await editor.locator(".column-list").boundingBox())!;
      const headingBounds = (await editor
        .getByRole("heading", { name: /Live preview/ })
        .boundingBox())!;
      expect(orderBounds.y + orderBounds.height).toBeLessThanOrEqual(
        headingBounds.y,
      );
    }
    expect(
      await editor.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({
      path: `.test-db/reports/screenshots/column-preview-${width}x${height}.png`,
    });
    await editor.getByRole("button", { name: "Cancel", exact: true }).click();
    await page
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await expect(
      page
        .getByLabel("Scrollable employee table")
        .getByRole("columnheader", { name: "Age", exact: true }),
    ).toHaveCount(0);
  });
}
test("managed drafts keep their starting revision after background refresh", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#permissions");
  await page
    .getByRole("button", { name: "Register settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add column view", exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: "Managed column view",
    exact: true,
  });
  await editor.getByRole("tab", { name: "View settings", exact: true }).click();
  await editor.getByLabel("Saved view name").fill("My stale draft");
  await page.evaluate(async () => {
    const path = "/src/demo.ts";
    const demo = await import(path);
    const ctx = await demo.demoQuery("context");
    await demo.demoMutate("register_settings", {
      row_numbers_allowed: false,
      expected_version: ctx.register_settings.row_version,
    });
  });
  await page.clock.runFor(31000);
  await expect(
    editor
      .getByLabel("Live column preview")
      .getByRole("columnheader", { name: "Row number", exact: true }),
  ).toHaveCount(0);
  await editor
    .getByRole("button", { name: "Apply & Save", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Save managed column view", exact: true })
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await expect(editor).toContainText(
    "Register settings changed; reload before saving",
  );
  await expect(editor.getByLabel("Saved view name")).toHaveValue(
    "My stale draft",
  );
  const saved = await page.evaluate(async () => {
    const path = "/src/demo.ts";
    return (await (await import(path)).demoQuery("context")).register_settings
      .managed_views;
  });
  expect(saved).toEqual([]);
});
