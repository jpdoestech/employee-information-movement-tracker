import { test, expect } from "@playwright/test";

for (const width of [375, 1366]) {
  test(`employee data cells and keyboard open the editor without disrupting selection at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    const row = page
      .getByLabel("Scrollable employee table")
      .locator("tbody tr")
      .first();
    await expect(row).toBeVisible();
    const editor = page.getByRole("dialog", {
      name: "Employee profile",
      exact: true,
    });
    await row.getByRole("checkbox").check();
    await expect(row).toHaveAttribute("aria-selected", "true");
    await expect(editor).toHaveCount(0);
    for (const cell of [
      row.locator("td.row-ordinal"),
      row.locator("td.employee-name"),
      row.locator('td[title="Inactive"]'),
    ]) {
      await cell.click();
      await expect(editor).toBeVisible();
      await expect(
        editor.getByLabel("Employee Name", { exact: true }),
      ).toHaveValue("Synthetic Employee 01");
      await editor
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
      await expect(editor).toHaveCount(0);
    }
    await row.focus();
    await row.press("Enter");
    await expect(editor).toBeVisible();
    await editor.getByRole("tab", { name: "Contact", exact: true }).click();
    await editor
      .getByLabel("Email", { exact: true })
      .fill("edited-row@example.invalid");
    await editor
      .getByRole("button", { name: "Save to Supabase", exact: true })
      .click();
    const confirmation = page.getByRole("dialog", {
      name: "Save employee changes",
      exact: true,
    });
    await expect(confirmation).toBeVisible();
    await confirmation
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await expect(editor.getByLabel("Email", { exact: true })).toHaveValue(
      "edited-row@example.invalid",
    );
    await editor
      .getByRole("button", { name: "Save to Supabase", exact: true })
      .click();
    await confirmation
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    await row.focus();
    await row.press("Space");
    await expect(editor).toBeVisible();
    await editor.getByRole("tab", { name: "Contact", exact: true }).click();
    await expect(editor.getByLabel("Email", { exact: true })).toHaveValue(
      "edited-row@example.invalid",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  });
}
