import { fillGovernmentIds } from "./profile-fixtures";
import { test, expect } from "@playwright/test";

for (const width of [375, 1366]) {
  test(`Number fields format without rounding storage and inline clear retains confirmation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#fields");
    await page.getByRole("button", { name: "New field", exact: true }).click();
    const definition = page.getByRole("dialog", {
      name: "Create field definition",
      exact: true,
    });
    await definition.getByLabel("Label", { exact: true }).fill("Capacity");
    await definition.getByLabel("Immutable machine key").fill("capacity");
    await definition
      .getByRole("button", { name: "Field group", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Field group options", exact: true })
      .getByRole("option", { name: "Personal Information", exact: true })
      .click();
    await definition
      .getByRole("button", { name: "Field type", exact: true })
      .click();
    const types = page.getByRole("dialog", {
      name: "Field type options",
      exact: true,
    });
    await expect(
      types.getByRole("option", { name: "integer", exact: true }),
    ).toBeVisible();
    await types.getByRole("option", { name: "Number", exact: true }).click();
    await definition
      .getByRole("button", { name: "Save definition", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Save field definition", exact: true })
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(definition).toHaveCount(0);
    await page.goto("/#employees");
    await page
      .getByRole("button", { name: "Add employee", exact: true })
      .click();
    const form = page.getByRole("dialog", {
      name: "New employee",
      exact: true,
    });
    await form
      .getByRole("textbox", { name: "Last Name *", exact: true })
      .fill("Numeric");
    await form
      .getByRole("textbox", { name: "First Name *", exact: true })
      .fill("Sample");
    await fillGovernmentIds(form);
    const number = form.getByLabel("Capacity", { exact: true });
    await number.fill("1,000.00");
    await form
      .getByRole("textbox", { name: "First Name *", exact: true })
      .focus();
    await expect(number).toHaveValue("1,000.00");
    await number.fill("1,00");
    await form
      .getByRole("button", { name: "Save to Supabase", exact: true })
      .click();
    await expect(number).toHaveAttribute("aria-invalid", "true");
    await expect(
      page.getByRole("dialog", { name: "Create employee", exact: true }),
    ).toHaveCount(0);
    await number.fill("1000.125");
    await form
      .getByRole("textbox", { name: "First Name *", exact: true })
      .focus();
    await expect(number).toHaveValue("1,000.13");
    const clear = form.getByRole("button", {
      name: "Clear Capacity",
      exact: true,
    });
    const inputBox = (await number.boundingBox())!,
      clearBox = (await clear.boundingBox())!;
    expect(clearBox.x).toBeGreaterThan(inputBox.x);
    expect(clearBox.x + clearBox.width).toBeLessThanOrEqual(
      inputBox.x + inputBox.width + 1,
    );
    await expect(form.getByText("Clear value", { exact: true })).toHaveCount(0);
    await form
      .getByRole("button", { name: "Save to Supabase", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Create employee", exact: true })
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(form).toHaveCount(0);
    await page
      .getByRole("searchbox", { name: "Search employees", exact: true })
      .fill("Numeric, Sample");
    const row = page
      .getByLabel("Scrollable employee table")
      .locator("tbody tr")
      .first();
    await expect(row).toContainText("Numeric, Sample");
    await row.locator("td.employee-name").click();
    const profile = page.getByRole("dialog", {
      name: "Employee profile",
      exact: true,
    });
    await profile
      .getByRole("button", { name: "Edit details", exact: true })
      .click();
    const existing = profile.getByLabel("Capacity", { exact: true });
    await expect(existing).toHaveValue("1,000.13");
    await existing.focus();
    await expect(existing).toHaveValue("1000.125");
    await profile
      .getByRole("button", { name: "Clear Capacity", exact: true })
      .click();
    await expect(existing).toHaveValue("");
    await profile
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Discard unsaved changes?", exact: true })
      .getByRole("button", { name: "Continue editing", exact: true })
      .click();
    await expect(existing).toHaveValue("");
    await profile
      .getByRole("button", { name: "Save to Supabase", exact: true })
      .click();
    const confirm = page.getByRole("dialog", {
      name: "Save employee changes",
      exact: true,
    });
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(existing).toHaveValue("");
    await profile
      .getByRole("button", { name: "Save to Supabase", exact: true })
      .click();
    await confirm
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(profile).toHaveCount(0);
    await row.locator("td.employee-name").click();
    await profile
      .getByRole("button", { name: "Edit details", exact: true })
      .click();
    await expect(profile.getByLabel("Capacity", { exact: true })).toHaveValue(
      "",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.test-db/reports/verification/number-field-${width}.png`,
    });
  });
}
