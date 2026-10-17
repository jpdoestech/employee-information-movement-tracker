import { test, expect } from "@playwright/test";

for (const [width, height] of [
  [320, 740],
  [375, 812],
  [768, 1024],
  [1366, 768],
  [812, 375],
]) {
  test(`Government ID tabs, draft controls and responsive columns at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    await page
      .getByRole("button", { name: "EMP-0000002", exact: true })
      .click();
    const editor = page.getByRole("dialog", {
      name: "Employee profile",
      exact: true,
    });
    await editor
      .getByRole("button", { name: "Edit Government IDs", exact: true })
      .click();
    const values = {
      "BIR TIN": "012345678",
      "SSS Number": "0912345678",
      "PhilHealth PIN": "012345678901",
      "Pag-IBIG MID": "012345678901",
    };
    for (const [label, value] of Object.entries(values))
      await editor.getByLabel(label, { exact: true }).fill(value);
    await editor
      .getByRole("button", { name: "Save to Supabase", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Save employee changes", exact: true })
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(editor).toHaveCount(0);

    await page
      .getByRole("button", { name: "Customize Columns", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Customize Columns",
      exact: true,
    });
    await dialog
      .getByRole("tab", { name: "Government IDs", exact: true })
      .click();
    const ids = dialog.getByRole("region", { name: "Government ID columns" });
    await expect(ids.getByRole("checkbox")).toHaveCount(4);
    for (const label of Object.keys(values))
      await ids
        .getByRole("checkbox", { name: new RegExp(`^${label}`) })
        .check();
    await expect(dialog.getByLabel("Live column preview")).toHaveCount(0);
    await dialog
      .getByRole("tab", { name: "Column order", exact: true })
      .click();
    await dialog
      .getByRole("checkbox", { name: "Select BIR TIN to move", exact: true })
      .check();
    await dialog
      .getByRole("button", { name: "Hide selected columns", exact: true })
      .click();
    await expect(dialog.locator('[data-column-key="bir_tin"]')).toHaveCount(0);
    await dialog
      .getByRole("tab", { name: "Government IDs", exact: true })
      .click();
    await expect(
      ids.getByRole("checkbox", { name: /^BIR TIN/ }),
    ).not.toBeChecked();
    await ids.getByRole("checkbox", { name: /^BIR TIN/ }).check();
    await dialog
      .getByRole("tab", { name: "Column order", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Pin sss_number", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Pin sss_number", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await dialog
      .getByRole("tab", { name: "Government IDs", exact: true })
      .click();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Discard unsaved changes?", exact: true })
      .getByRole("button", { name: "Continue editing", exact: true })
      .click();
    await expect(
      ids.getByRole("checkbox", { name: /^SSS Number/ }),
    ).toBeChecked();
    await dialog
      .getByRole("button", { name: "Apply & Save", exact: true })
      .click();
    const save = page.getByRole("dialog", {
      name: "Save personal view",
      exact: true,
    });
    await save.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("button", { name: "Apply & Save", exact: true })
      .click();
    await save.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const table = page.getByLabel("Scrollable employee table");
    await expect(table).toContainText("09-1234567-8");
    await expect(table.locator('td[title="09-1234567-8"]')).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Customize Columns", exact: true })
      .click();
    await dialog
      .getByRole("tab", { name: "Government IDs", exact: true })
      .click();
    await expect(
      dialog
        .getByRole("region", { name: "Government ID columns" })
        .getByRole("checkbox", { name: /^SSS Number/ }),
    ).toBeChecked();
    await dialog.screenshot({
      path: `.test-db/reports/verification/government-columns-${width}.png`,
    });
    await dialog
      .getByRole("button", { name: "Clear custom column layout", exact: true })
      .click();
    await expect(
      dialog
        .getByRole("region", { name: "Government ID columns" })
        .getByRole("checkbox", { name: /^SSS Number/ }),
    ).not.toBeChecked();
    await dialog
      .getByRole("tab", { name: "Government IDs", exact: true })
      .click();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Discard unsaved changes?", exact: true })
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await expect(table).toContainText("09-1234567-8");
  });
}
