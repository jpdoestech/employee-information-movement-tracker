import { test, expect } from "@playwright/test";

for (const [width, height] of [
  [1440, 900],
  [390, 844],
  [768, 1024],
  [844, 390],
]) {
  test(`calculated fields in personal and managed column setup at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    for (const managed of [false, true]) {
      if (managed) {
        await page.goto("/#permissions");
        await page
          .getByRole("button", { name: "Register settings", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Add column view", exact: true })
          .click();
      } else
        await page
          .getByRole("button", { name: "Customize Columns", exact: true })
          .click();
      const editor = page.getByRole("dialog", {
        name: managed ? "Managed column view" : "Customize Columns",
        exact: true,
      });
      await editor
        .getByRole("button", { name: "Visible columns", exact: true })
        .click();
      const picker = page.getByRole("dialog", {
        name: "Visible columns options",
        exact: true,
      });
      for (const name of ["Age", "Length of Service"]) {
        await picker.getByRole("combobox").fill(name);
        await picker
          .getByRole("option", { name: new RegExp(`^${name} `) })
          .click();
      }
      await picker.getByRole("button", { name: "Apply", exact: true }).click();
      for (const key of ["age", "length_of_service"])
        await expect(editor.locator(`[data-column-key="${key}"]`)).toHaveCount(
          1,
        );
      await page.screenshot({
        path: `.test-db/reports/screenshots/derived-columns-${managed ? "managed" : "personal"}-${width}.png`,
      });
      await editor
        .getByRole("button", { name: "Apply & Save", exact: true })
        .click();
      await page
        .getByRole("dialog", {
          name: managed ? "Save managed column view" : "Save personal view",
          exact: true,
        })
        .getByRole("button", { name: "Continue", exact: true })
        .click();
      await expect(editor).toHaveCount(0);
      await page.goto("/#employees");
      const table = page.getByLabel("Scrollable employee table");
      for (const name of ["Age", "Length of Service"])
        await expect(
          table.getByRole("columnheader", { name, exact: true }),
        ).toHaveCount(1);
      await table.getByRole("button", { name: "Age", exact: true }).click();
      await expect(table.locator("tbody tr").first()).toContainText(
        "Synthetic Employee 34",
      );
    }
  });
}
