import { test, expect } from "@playwright/test";

test("category edits do not require filling unrelated legacy inactive employment data", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#employees");
  await page.getByRole("button", { name: "EMP-0000001", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "Employee profile",
    exact: true,
  });
  await editor
    .getByRole("button", { name: "Edit Employment Details", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Employee Category", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Employee Category options", exact: true })
    .getByRole("option", { name: "Admin", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Save employee changes", exact: true })
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  const employee = await page.evaluate(async () => {
    const path = "/src/demo.ts";
    return (await import(path)).demoQuery("employee", { id: "demo-1" });
  });
  expect(employee.employee.values.employee_category).toBe("Admin");
  expect(employee.employee.values.status).toBe("Inactive");
});

for (const [width, height, organization, category] of [
  [375, 740, "Head Office", "Admin"],
  [768, 1024, "Example North Branch", "Agency"],
  [1366, 768, "Head Office", "Admin"],
  [812, 375, "Example Client", "Agency"],
] as const) {
  test(`editable ${category} category at ${organization} fits ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
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
    await editor
      .getByRole("button", { name: "Initial organization", exact: true })
      .click();
    const organizationPicker = page.getByRole("dialog", {
      name: "Initial organization options",
      exact: true,
    });
    await organizationPicker
      .getByRole("option", { name: new RegExp(organization) })
      .first()
      .click();
    await editor
      .getByRole("tab", { name: "Personal Information", exact: true })
      .click();
    await editor
      .getByLabel("Last Name *", { exact: true })
      .fill(`Category${width}`);
    await editor.getByLabel("First Name *", { exact: true }).fill("Example");
    await editor
      .getByRole("tab", { name: "Employment Details", exact: true })
      .click();
    await editor
      .getByRole("button", { name: "Employee Category", exact: true })
      .click();
    const picker = page.getByRole("dialog", {
      name: "Employee Category options",
      exact: true,
    });
    await expect(
      picker.getByRole("option", { name: "Admin", exact: true }),
    ).toBeVisible();
    await expect(
      picker.getByRole("option", { name: "Agency", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `.test-db/reports/release/employee-category-picker-${width}x${height}.png`,
    });
    await picker.getByRole("option", { name: category, exact: true }).click();
    await editor
      .getByRole("button", { name: "Save", exact: true })
      .click();
    const confirm = page.getByRole("dialog", {
      name: "Create employee",
      exact: true,
    });
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      editor.getByRole("button", { name: "Employee Category", exact: true }),
    ).toContainText(category);
    await editor
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await confirm
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    await page
      .getByRole("searchbox", { name: "Search employees" })
      .fill(`Category${width}`);
    const table = page.getByLabel("Scrollable employee table");
    await expect(table.locator("tbody tr")).toHaveCount(1);
    await expect(table.locator("tbody")).toContainText(category);
    await page.screenshot({
      path: `.test-db/reports/release/employee-category-${width}x${height}.png`,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
