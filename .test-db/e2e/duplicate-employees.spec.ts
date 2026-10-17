import { test, expect, type Page } from "@playwright/test";
import { fillGovernmentIds } from "./profile-fixtures";
async function entry(page: Page, first: string) {
  await page.getByRole("button", { name: "Add employee", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "New employee",
    exact: true,
  });
  await editor.getByLabel("Last Name *", { exact: true }).fill("Duplicate");
  await editor.getByLabel("First Name *", { exact: true }).fill(first);
  await editor.getByLabel("Birth Date", { exact: true }).fill("1991-02-03");
  await fillGovernmentIds(editor);
  return editor;
}
for (const [width, height] of [
  [375, 740],
  [768, 1024],
  [1366, 768],
  [812, 375],
]) {
  test(`possible duplicate review preserves drafts and shows assignment context at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    const first = await entry(page, "Alexandria");
    await first
      .getByRole("button", { name: "Initial organization", exact: true })
      .click();
    await page
      .getByRole("dialog", {
        name: "Initial organization options",
        exact: true,
      })
      .getByRole("option", { name: /Example Client/ })
      .first()
      .click();
    await first
      .getByRole("tab", { name: "Employment Details", exact: true })
      .click();
    await first.getByLabel("Department", { exact: true }).fill("Quality");
    await first.getByLabel("Position", { exact: true }).fill("Analyst");
    await first
      .getByRole("button", { name: "Save to Supabase", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Create employee", exact: true })
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(first).toHaveCount(0);
    const second = await entry(page, "Alexandrie");
    await second
      .getByRole("button", { name: "Save to Supabase", exact: true })
      .click();
    const review = page.getByRole("dialog", {
      name: "Possible duplicate employee",
      exact: true,
    });
    await expect(review).toBeVisible();
    await expect(
      review.getByText("Duplicate, Alexandria", { exact: true }),
    ).toBeVisible();
    for (const label of [
      "Branch",
      "Client",
      "Department",
      "Position",
      "Quality",
      "Analyst",
    ])
      await expect(review.getByText(label, { exact: true })).toBeVisible();
    await expect(review.getByText(/Example.*Branch/)).toBeVisible();
    await expect(
      review.getByText("Example Client", { exact: true }),
    ).toBeVisible();
    const bounds = (await review.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
    await expect(
      review.getByRole("button", { name: "Continue", exact: true }),
    ).toBeInViewport();
    await page.screenshot({
      path: `.test-db/reports/verification/duplicate-review-${width}.png`,
    });
    await review.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      second.getByLabel("First Name *", { exact: true }),
    ).toHaveValue("Alexandrie");
    await expect(
      page.getByRole("dialog", { name: "Create employee", exact: true }),
    ).toHaveCount(0);
    await second
      .getByRole("button", { name: "Save to Supabase", exact: true })
      .click();
    await review.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(second).toHaveCount(0);
    await page
      .getByRole("searchbox", { name: "Search employees", exact: true })
      .fill("Duplicate, Alexandrie");
    await expect(
      page.getByLabel("Scrollable employee table").locator("tbody tr"),
    ).toHaveCount(1);
  });
}
test("superadmin can configure the global name threshold with shared confirmation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#permissions");
  await page
    .getByRole("button", { name: "Register settings", exact: true })
    .click();
  const input = page.getByLabel("Name similarity threshold (%)", {
    exact: true,
  });
  await expect(input).toHaveValue("90");
  await input.fill("101");
  await expect(
    page.getByRole("button", {
      name: "Save duplicate check settings",
      exact: true,
    }),
  ).toBeDisabled();
  await input.fill("100");
  await page
    .getByRole("button", { name: "Save duplicate check settings", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Save register display policy",
    exact: true,
  });
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(input).toHaveValue("100");
  await page
    .getByRole("button", { name: "Save duplicate check settings", exact: true })
    .click();
  await confirmation
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Save duplicate check settings",
      exact: true,
    }),
  ).toBeDisabled();
  await page.goto("/#employees");
  await page.goto("/#permissions");
  await page
    .getByRole("button", { name: "Register settings", exact: true })
    .click();
  await expect(input).toHaveValue("100");
});

test("bulk identity edits show duplicate review and cancellation preserves the whole draft", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#employees");
  await page
    .getByRole("checkbox", { name: "Select EMP-0000002", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Select EMP-0000003", exact: true })
    .check();
  await page.getByRole("button", { name: "Bulk update", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "Bulk update employees",
    exact: true,
  });
  await editor
    .getByRole("button", { name: "Fields to update", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Fields to update options",
    exact: true,
  });
  for (const label of ["Last Name", "First Name", "Birth Date"]) {
    await picker.getByRole("combobox").fill(label);
    await picker.getByRole("option", { name: new RegExp(`^${label}`) }).click();
  }
  await picker.getByRole("button", { name: "Apply", exact: true }).click();
  await editor.getByLabel("Last Name", { exact: true }).fill("BulkDuplicate");
  await editor.getByLabel("First Name", { exact: true }).fill("Sample");
  await editor.getByLabel("Birth Date", { exact: true }).fill("1990-04-05");
  await editor
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Confirm update", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: "Possible duplicate employee",
    exact: true,
  });
  await expect(
    review.getByText("BulkDuplicate, Sample", { exact: true }),
  ).toHaveCount(2);
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    editor.getByRole("button", { name: "Confirm update", exact: true }),
  ).toBeVisible();
  await editor
    .getByRole("button", { name: "Confirm update", exact: true })
    .click();
  await review.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page
    .getByRole("searchbox", { name: "Search employees", exact: true })
    .fill("BulkDuplicate, Sample");
  await expect(
    page.getByLabel("Scrollable employee table").locator("tbody tr"),
  ).toHaveCount(2);
});

test("editing name parts reviews the new full name and retains the draft on cancellation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#employees");
  const first = await entry(page, "Alexandria");
  await first
    .getByRole("button", { name: "Save to Supabase", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Create employee", exact: true })
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await expect(first).toHaveCount(0);
  const second = await entry(page, "Alexandria");
  await second
    .getByLabel("Last Name *", { exact: true })
    .fill("DifferentSurname");
  await second
    .getByRole("button", { name: "Save to Supabase", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Create employee", exact: true })
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await expect(second).toHaveCount(0);
  await page
    .getByRole("searchbox", { name: "Search employees", exact: true })
    .fill("DifferentSurname, Alexandria");
  await page
    .getByLabel("Scrollable employee table")
    .getByRole("cell", { name: "DifferentSurname, Alexandria", exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: "Employee profile",
    exact: true,
  });
  await editor
    .getByRole("button", { name: "Edit details", exact: true })
    .click();
  await editor.getByLabel("Last Name", { exact: true }).fill("Duplicate");
  await editor
    .getByRole("button", { name: "Save to Supabase", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: "Possible duplicate employee",
    exact: true,
  });
  await expect(
    review.getByText("Duplicate, Alexandria", { exact: true }),
  ).toBeVisible();
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(editor.getByLabel("Last Name", { exact: true })).toHaveValue(
    "Duplicate",
  );
  await editor
    .getByRole("button", { name: "Save to Supabase", exact: true })
    .click();
  await review.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page
    .getByRole("searchbox", { name: "Search employees", exact: true })
    .fill("Duplicate, Alexandria");
  await expect(
    page.getByLabel("Scrollable employee table").locator("tbody tr"),
  ).toHaveCount(2);
});
