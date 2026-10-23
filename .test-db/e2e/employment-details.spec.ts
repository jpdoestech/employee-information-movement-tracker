import { test, expect } from "@playwright/test";
const keys = [
  "employee_number",
  "client_employee_number",
  "branch",
  "client",
  "employee_category",
  "manpower_classification",
  "department",
  "position",
  "date_hired",
  "date_hired-duration",
  "employment_type",
  "status",
];
for (const [width, height] of [
  [375, 740],
  [768, 1024],
  [1366, 768],
  [812, 375],
]) {
  test(`employment sequence and effective-date service duration at ${width}x${height}`, async ({
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
      .getByRole("button", { name: "Edit Employment Details", exact: true })
      .click();
    const employment = editor.getByRole("group", {
      name: "Employment Details",
      exact: true,
    });
    const sequence = () =>
      employment
        .locator(".field-slot")
        .evaluateAll((els) => els.map((el) => el.getAttribute("data-field")));
    expect(await sequence()).toEqual([...keys, "remarks"]);
    await editor.getByLabel("Date Hired", { exact: true }).fill("2020-01-15");
    await expect(
      editor.getByLabel("Length of Service", { exact: true }),
    ).toContainText("6 years");
    await editor
      .getByRole("button", { name: "Employment Status", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Employment Status options", exact: true })
      .getByRole("option", { name: "Inactive", exact: true })
      .click();
    await editor
      .getByLabel("Effective Date *", { exact: true })
      .fill("2022-03-20");
    await expect(
      editor.getByLabel("Length of Service", { exact: true }),
    ).toHaveText("2 years, 2 months, 5 days");
    expect(await sequence()).toEqual([
      ...keys,
      "status_effective_date",
      "separation_category",
      "separation_reason",
      "remarks",
    ]);
    await editor
      .getByRole("button", { name: "Back to overview", exact: true })
      .click();
    const overview = editor.getByRole("region", {
      name: "Employment Details",
      exact: true,
    });
    expect(await overview.locator("dt").allTextContents()).toEqual([
      "System ID",
      "ID",
      "Primary Branch",
      "Primary Client",
      "Employee Category",
      "Employment Manpower Classification",
      "Department",
      "Position",
      "Date Hired",
      "Length of Service",
      "Employment Type",
      "Employment Status",
      "Effective Date",
      "Separation Category",
      "Reason for Separation",
      "Remarks",
    ]);
    await expect(overview).toContainText("2 years, 2 months, 5 days");
    expect(
      await editor.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({
      path: `.test-db/reports/verification/employment-sequence-${width}x${height}.png`,
    });
  });
}
