import { test, expect } from "@playwright/test";
import { fillGovernmentIds } from "./profile-fixtures";

for (const [width, height] of [
  [375, 740],
  [768, 1024],
  [1366, 600],
  [812, 375],
]) {
  test(`profile entries and mandatory government IDs save through confirmation at ${width}x${height}`, async ({
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
    await expect(editor.getByRole("tab")).toHaveText([
      "Profile",
      "Government ID",
      "Address",
      "Additional information",
    ]);
    await expect(editor.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(editor.getByLabel("Phone", { exact: true })).toBeVisible();
    await expect(
      editor.getByRole("textbox", { name: "Employee Name", exact: true }),
    ).toHaveCount(0);
    await editor
      .getByRole("textbox", { name: "Last Name *", exact: true })
      .fill("Profile");
    await editor
      .getByRole("textbox", { name: "First Name *", exact: true })
      .fill("Sample");
    await editor
      .getByRole("textbox", { name: "Position", exact: true })
      .fill("Analyst");
    await editor.getByLabel("Department", { exact: true }).fill("Operations");
    await editor.getByLabel("Date Hired", { exact: true }).fill("2026-10-01");
    await editor.getByLabel("Birth Date", { exact: true }).fill("1990-01-02");
    for (const [label, option] of [
      ["Gender", "Female"],
      ["Civil Status", "Single"],
      ["Employment Type", "Regular"],
      ["Status Reason", "Active / Normal"],
    ]) {
      await editor.getByRole("button", { name: label, exact: true }).click();
      await page
        .getByRole("dialog", { name: `${label} options`, exact: true })
        .getByRole("option", { name: option, exact: true })
        .click();
    }
    await editor
      .getByLabel("Status Effective Date", { exact: true })
      .fill("2026-10-01");
    await editor
      .getByLabel("Remarks", { exact: true })
      .fill("Synthetic verification profile");
    await editor
      .getByRole("button", { name: "Save to Supabase", exact: true })
      .click();
    await expect(
      editor.getByRole("tab", { name: "Government ID", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("dialog", { name: "Create employee", exact: true }),
    ).toHaveCount(0);
    await fillGovernmentIds(editor);
    const tin = editor.getByRole("textbox", { name: "BIR TIN *", exact: true });
    await tin.fill("1234A");
    await expect(tin).toHaveAttribute("aria-invalid", "true");
    await editor
      .getByRole("button", { name: "Save to Supabase", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Create employee", exact: true }),
    ).toHaveCount(0);
    await tin.fill("012-345-678");
    await expect(tin).toHaveValue("012345678");
    await expect(tin).not.toHaveAttribute("aria-invalid", "true");
    await editor
      .getByRole("button", { name: "Save to Supabase", exact: true })
      .click();
    const confirm = page.getByRole("dialog", {
      name: "Create employee",
      exact: true,
    });
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(tin).toHaveValue("012345678");
    expect(
      await editor.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({
      path: `.test-db/reports/verification/profile-entries-${width}x${height}.png`,
    });
    await editor
      .getByRole("button", { name: "Save to Supabase", exact: true })
      .click();
    await confirm
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    await page
      .getByRole("searchbox", { name: "Search employees", exact: true })
      .fill("Profile, Sample");
    const savedRow = page
      .getByLabel("Scrollable employee table")
      .locator("tbody tr")
      .first();
    await expect(savedRow).toContainText("Profile, Sample");
    await savedRow.locator("td.employee-name").click();
    const profile = page.getByRole("dialog", {
      name: "Employee profile",
      exact: true,
    });
    await expect(profile.getByLabel("Position", { exact: true })).toHaveValue(
      "Analyst",
    );
    await expect(
      profile.getByRole("textbox", { name: "Position", exact: true }),
    ).toHaveCount(1);
    await expect(profile.getByLabel("Department", { exact: true })).toHaveValue(
      "Operations",
    );
    await expect(profile.getByLabel("Birth Date", { exact: true })).toHaveValue(
      "1990-01-02",
    );
    await profile
      .getByRole("tab", { name: "Government ID", exact: true })
      .click();
    await expect(
      profile.getByRole("textbox", { name: "BIR TIN *", exact: true }),
    ).toHaveValue("012345678");
    await expect(
      profile.getByRole("textbox", { name: "SSS Number *", exact: true }),
    ).toHaveValue("0123456789");
  });
}
