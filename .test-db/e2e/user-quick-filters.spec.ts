import { test, expect } from "@playwright/test";
for (const [width, height] of [
  [1440, 900],
  [390, 844],
  [768, 1024],
  [844, 390],
]) {
  test(`superadmin assigns user filters with confirmation at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#permissions");
    await page
      .getByRole("button", { name: "Register settings", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Quick filter account", exact: true })
      .click();
    await page
      .getByRole("option", { name: "Demo Administrator", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Configure quick filters", exact: true })
      .click();
    const editor = page.getByRole("dialog", {
      name: "User quick filters",
      exact: true,
    });
    await editor
      .getByRole("checkbox", { name: "Use client/default quick filters" })
      .uncheck();
    await editor
      .getByRole("button", { name: "Quick filter fields", exact: true })
      .click();
    const picker = page.getByRole("dialog", {
      name: "Quick filter fields options",
      exact: true,
    });
    for (const name of ["Department", "Position"])
      await picker
        .getByRole("option", { name: new RegExp(`^${name} `) })
        .click();
    await picker.getByRole("button", { name: "Apply", exact: true }).click();
    const footer = (await editor.locator("footer").boundingBox())!;
    expect(footer.y + footer.height).toBeLessThanOrEqual(height);
    await editor
      .getByRole("button", { name: "Save quick filters", exact: true })
      .click();
    const confirm = page.getByRole("dialog", {
      name: "Save user quick filters",
      exact: true,
    });
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(editor).toContainText("3 of 5 selected");
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
    await expect(editor).toContainText("3 of 5 selected");
    await editor
      .getByRole("button", { name: "Save quick filters", exact: true })
      .click();
    await confirm
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    await page.goto("/#employees");
    const toolbar = page.getByRole("region", {
      name: "Employee toolbar",
      exact: true,
    });
    await expect(
      toolbar.getByRole("button", { name: "Department", exact: true }),
    ).toHaveCount(1);
    await toolbar
      .getByRole("button", { name: "Position", exact: true })
      .click();
    const positions = page.getByRole("dialog", {
      name: "Position options",
      exact: true,
    });
    await positions
      .getByRole("option", { name: "Coordinator", exact: true })
      .click();
    await positions.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(
      toolbar.getByRole("button", { name: "Position", exact: true }),
    ).toContainText("Coordinator");
    await expect(
      page.getByLabel("Scrollable employee table").locator("tbody tr"),
    ).toHaveCount(12);
    await toolbar
      .getByRole("button", { name: "Clear Position", exact: true })
      .click();
    await expect(
      page.getByLabel("Scrollable employee table").locator("tbody tr"),
    ).toHaveCount(25);
    await page.screenshot({
      path: `.test-db/reports/screenshots/user-quick-filters-${width}.png`,
    });
  });
}
