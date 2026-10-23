import { test, expect } from "@playwright/test";
import { fillGovernmentIds } from "./profile-fixtures";
for (const [width, height] of [
  [375, 740],
  [768, 1024],
  [1366, 768],
  [812, 375],
]) {
  test(`replacement search and required entries preserve confirmation at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    await page
      .getByRole("button", { name: "Add employee", exact: true })
      .click();
    const editor = page.getByRole("dialog", {
      name: "New employee",
      exact: true,
    });
    await editor.getByLabel("Last Name *", { exact: true }).fill("Replacement");
    await editor.getByLabel("First Name *", { exact: true }).fill("Fixture");
    await fillGovernmentIds(editor);
    await editor
      .getByRole("tab", { name: "Employment Details", exact: true })
      .click();
    const classification = editor.getByRole("button", {
      name: "Employment Manpower Classification",
      exact: true,
    });
    await expect(classification).toContainText("New/Additional");
    await expect(
      editor.getByRole("button", { name: "Employee replaced", exact: true }),
    ).toHaveCount(0);
    await classification.click();
    await page
      .getByRole("dialog", {
        name: "Employment Manpower Classification options",
        exact: true,
      })
      .getByRole("option", { name: "Replacement", exact: true })
      .click();
    await editor
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await expect(
      editor.getByText("Select the employee being replaced.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog", { name: "Create employee", exact: true }),
    ).toHaveCount(0);
    await editor
      .getByRole("button", { name: "Employee replaced", exact: true })
      .click();
    const picker = page.getByRole("dialog", {
      name: "Employee replaced options",
      exact: true,
    });
    await expect(
      picker.getByRole("option", { name: /Synthetic Employee 01/ }),
    ).toBeVisible();
    await expect(
      picker.getByRole("option", { name: /Synthetic Employee 02/ }),
    ).toHaveCount(0);
    const bounds = (await picker.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
    await picker
      .getByRole("combobox", { name: "Search Employee replaced", exact: true })
      .fill("Employee 09");
    await picker.getByRole("option", { name: /Synthetic Employee 09/ }).click();
    await editor
      .getByRole("button", { name: "Save", exact: true })
      .click();
    const confirmation = page.getByRole("dialog", {
      name: "Create employee",
      exact: true,
    });
    await confirmation
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await expect(
      editor.getByRole("button", { name: "Employee replaced", exact: true }),
    ).toContainText("Synthetic Employee 09");
    await page.screenshot({
      path: `.test-db/reports/verification/manpower-${width}.png`,
    });
    await editor
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await confirmation
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
  });
}
test("Field Builder saves one global or client unique rule through confirmation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#fields");
  await page.getByRole("button", { name: "New field", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "Create field definition",
    exact: true,
  });
  await editor.getByLabel("Label", { exact: true }).fill("Unique reference");
  await editor.getByLabel("Immutable machine key").fill("unique_reference");
  await editor.getByLabel("Unique values", { exact: true }).check();
  await editor
    .getByRole("button", { name: "Uniqueness scope", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Uniqueness scope options", exact: true })
    .getByRole("option", { name: "Within each client", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Save definition", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Save field definition", exact: true })
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  await page
    .getByRole("button", { name: "Edit field Unique reference", exact: true })
    .click();
  const edit = page.getByRole("dialog", {
    name: "Edit field definition",
    exact: true,
  });
  await expect(edit.getByLabel("Unique values", { exact: true })).toBeChecked();
  await expect(
    edit.getByRole("button", { name: "Uniqueness scope", exact: true }),
  ).toContainText("Within each client");
});
