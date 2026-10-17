import { test, expect } from "@playwright/test";
for (const width of [375, 1366]) {
  test(`field icons, configured sizing and unchecked default persist at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#fields");
    await page.getByRole("button", { name: "New field", exact: true }).click();
    const form = page.getByRole("dialog", {
      name: "Create field definition",
      exact: true,
    });
    await form.getByLabel("Label", { exact: true }).fill("Equipment received");
    await form.getByLabel("Immutable machine key").fill("equipment_received");
    await form.getByRole("button", { name: "Field type", exact: true }).click();
    const types = page.getByRole("dialog", {
      name: "Field type options",
      exact: true,
    });
    await expect(types.locator(".field-type-icon")).toHaveCount(9);
    await types.getByRole("option", { name: "checkbox", exact: true }).click();
    await expect(form.getByLabel("max length", { exact: true })).toHaveCount(0);
    await form.getByLabel("Input width (characters)").fill("18");
    await form.getByLabel("Use the preview value as the default").check();
    await expect(
      form.getByLabel("Equipment received", { exact: true }),
    ).not.toBeChecked();
    await form
      .getByRole("button", { name: "Save definition", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Save field definition", exact: true })
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(form).toHaveCount(0);
    await page
      .getByRole("button", {
        name: "Edit field Equipment received",
        exact: true,
      })
      .click();
    const edit = page.getByRole("dialog", {
      name: "Edit field definition",
      exact: true,
    });
    await expect(
      edit.getByLabel("Use the preview value as the default"),
    ).toBeChecked();
    await expect(
      edit.getByLabel("Equipment received", { exact: true }),
    ).not.toBeChecked();
    await expect(edit.getByLabel("Input width (characters)")).toHaveValue("18");
    await edit.getByRole("button", { name: "Field type", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Field type options", exact: true })
      .getByRole("option", { name: "checkbox", exact: true })
      .click();
    await expect(
      edit.getByLabel("Use the preview value as the default"),
    ).toBeChecked();
    await expect(edit.getByLabel("Input width (characters)")).toHaveValue("18");
    const box = (await edit.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await edit.getByRole("button", { name: "Cancel", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Discard unsaved changes?", exact: true })
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await expect(edit).toHaveCount(0);
    await page.goto("/#employees");
    await page
      .getByRole("button", { name: "Add employee", exact: true })
      .click();
    const employee = page.getByRole("dialog", {
      name: "New employee",
      exact: true,
    });
    await employee
      .getByRole("tab", { name: "Additional information", exact: true })
      .click();
    await expect(
      employee.getByLabel("Equipment received", { exact: true }),
    ).not.toBeChecked();
    await expect(
      employee
        .locator(
          '[role="tabpanel"]:not([hidden]) .value-type-icon .field-type-icon',
        )
        .first(),
    ).toBeVisible();
    await page.screenshot({
      path: `.test-db/reports/verification/field-icons-${width}.png`,
    });
  });
}
