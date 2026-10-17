import { test, expect } from "@playwright/test";
import { fillGovernmentIds } from "./profile-fixtures";

for (const width of [375, 1366]) {
  test(`employment order, conditional requirements and custom reason at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 740 });
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
      .getByRole("tab", { name: "Employment Details", exact: true })
      .click();
    const employment = editor.getByRole("group", {
      name: "Employment Details",
      exact: true,
    });
    expect(
      await employment
        .locator(".field-slot")
        .evaluateAll((elements) =>
          elements.map((el) => el.getAttribute("data-field")),
        ),
    ).toEqual([
      "employee_number",
      "client_employee_number",
      "branch",
      "client",
      "manpower_classification",
      "department",
      "position",
      "date_hired",
      "date_hired-duration",
      "employment_type",
      "status",
      "remarks",
    ]);
    await expect(
      editor.getByLabel("Effective Date", { exact: true }),
    ).toHaveCount(0);
    await editor
      .getByRole("tab", { name: "Personal Information", exact: true })
      .click();
    await editor.getByLabel("Last Name *", { exact: true }).fill("Employment");
    await editor.getByLabel("First Name *", { exact: true }).fill("Example");
    await editor
      .getByRole("tab", { name: "Employment Details", exact: true })
      .click();
    async function choose(label: string, option: string) {
      await editor.getByRole("button", { name: label, exact: true }).click();
      await page
        .getByRole("dialog", { name: `${label} options`, exact: true })
        .getByRole("option", { name: option, exact: true })
        .click();
    }
    await choose("Employment Status", "Inactive");
    await editor
      .getByRole("button", { name: "Save to Supabase", exact: true })
      .click();
    await expect(
      editor.getByText(
        "department is required when employment is not active.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog", { name: "Create employee", exact: true }),
    ).toHaveCount(0);
    await editor.getByLabel("Department *", { exact: true }).fill("Operations");
    await editor.getByLabel("Position *", { exact: true }).fill("Analyst");
    await editor.getByLabel("Date Hired *", { exact: true }).fill("2026-01-01");
    await choose("Employment Type", "Regular");
    await editor
      .getByLabel("Effective Date *", { exact: true })
      .fill("2026-10-12");
    await choose("Separation Category", "VOLUNTARY");
    await choose("Reason for Separation", "Others (specify)");
    await editor
      .getByRole("button", { name: "Save to Supabase", exact: true })
      .click();
    await expect(
      editor.getByText("Specify the other reason.", { exact: true }),
    ).toBeVisible();
    await editor
      .getByLabel("Specify reason *", { exact: true })
      .fill("Relocating with family");
    await fillGovernmentIds(editor);
    await expect(
      editor.getByRole("button", { name: "Status Reason", exact: true }),
    ).toHaveCount(0);
    await expect(
      editor.getByLabel("Other Separation Reason", { exact: true }),
    ).toHaveCount(0);
    expect(
      await editor.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await editor
      .getByRole("button", { name: "Save to Supabase", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Create employee", exact: true })
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
  });
}

test("typo correction keeps the draft on cancellation and creates no movement", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#employees");
  await page.getByRole("button", { name: "EMP-0000002", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "Employee profile",
    exact: true,
  });
  await editor
    .getByRole("button", { name: "Edit details", exact: true })
    .click();
  await editor.getByLabel("Position", { exact: true }).fill("Team Leader");
  await editor
    .getByRole("button", { name: "Save to Supabase", exact: true })
    .click();
  const choice = page.getByRole("dialog", {
    name: "Classify employment changes",
    exact: true,
  });
  await choice.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(editor.getByLabel("Position", { exact: true })).toHaveValue(
    "Team Leader",
  );
  await editor
    .getByRole("button", { name: "Save to Supabase", exact: true })
    .click();
  await choice
    .getByRole("button", { name: "Typo correction", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Save employee changes", exact: true })
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  await page.getByRole("button", { name: "EMP-0000002", exact: true }).click();
  await editor
    .getByRole("button", { name: "Edit details", exact: true })
    .click();
  await expect(editor.getByLabel("Position", { exact: true })).toHaveValue(
    "Team Leader",
  );
  await editor
    .getByRole("tab", { name: "Record history", exact: true })
    .click();
  await expect(editor.locator(".timeline-item")).toHaveCount(0);
});
