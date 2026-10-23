import { test, expect } from "@playwright/test";

for (const width of [375, 1366])
  test(`new category follows placement and employee text is cleaned at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    await page
      .getByRole("button", { name: "Add employee", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "New employee",
      exact: true,
    });
    const last = dialog.getByLabel("Last Name *", { exact: true });
    const first = dialog.getByLabel("First Name *", { exact: true });
    await last.fill("  De   la Cruz  ");
    await first.fill("  Ana   Maria  ");
    await expect(first).toHaveValue("  ANA   MARIA  ");
    await first.press("Tab");
    await expect(last).toHaveValue("DE LA CRUZ");
    await first.press("Home");
    await first.press("ArrowRight");
    await first.press("x");
    await expect(first).toHaveValue("AXNA MARIA");
    await first.press("Backspace");
    await expect(first).toHaveValue("ANA MARIA");
    const street = dialog
      .getByRole("group", { name: "Home Address", exact: true })
      .getByLabel("Street / building", { exact: true });
    await street.fill("  12   Sample   Street  ");
    await street.press("Tab");
    await expect(street).toHaveValue("12 Sample Street");
    async function chooseOrganization(label: RegExp) {
      await dialog
        .getByRole("button", { name: "Initial organization", exact: true })
        .click();
      await page
        .getByRole("dialog", {
          name: "Initial organization options",
          exact: true,
        })
        .getByRole("option", { name: label })
        .first()
        .click();
      await dialog
        .getByRole("tab", { name: "Employment Details", exact: true })
        .click();
    }
    await chooseOrganization(/^Head Office/);
    const category = dialog.locator('[data-field="employee_category"]');
    await expect(category.locator("output")).toHaveText("Admin");
    await expect(category.getByRole("button")).toHaveCount(0);
    await chooseOrganization(/^Example North Branch/);
    await expect(category.locator("output")).toHaveText("Agency");
    await chooseOrganization(/^Example Client/);
    await expect(category.locator("output")).toHaveText("Agency");
    await chooseOrganization(/^Head Office/);
    await expect(category.locator("output")).toHaveText("Admin");
    await dialog
      .getByLabel("Department", { exact: true })
      .fill("  HR   Operations  ");
    await dialog.getByLabel("Position", { exact: true }).fill("  QA   Lead  ");
    await dialog.getByLabel("Position", { exact: true }).press("Tab");
    await expect(dialog.getByLabel("Department", { exact: true })).toHaveValue(
      "HR Operations",
    );
    await expect(dialog.getByLabel("Position", { exact: true })).toHaveValue(
      "QA Lead",
    );
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Create employee", exact: true })
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await page
      .getByRole("searchbox", { name: "Search employees" })
      .fill("De la Cruz");
    const row = page
      .getByRole("row")
      .filter({ hasText: "DE LA CRUZ, ANA MARIA" });
    await expect(row).toContainText("Admin");
    await row.getByRole("button").first().click();
    const profile = page.getByRole("dialog", {
      name: "Employee profile",
      exact: true,
    });
    await expect(profile).toContainText("12 Sample Street");
    await profile
      .getByRole("button", { name: "Edit details", exact: true })
      .click();
    await expect(
      profile.getByRole("button", { name: "Employee Category", exact: true }),
    ).toBeVisible();
    const editedName = profile.getByLabel("First Name", { exact: true });
    await editedName.fill("mAriA sAnToS");
    await expect(editedName).toHaveValue("MARIA SANTOS");
    await page.screenshot({
      path: `.test-db/reports/release/employee-entry-normalized-${width}.png`,
    });
    await profile.getByRole("button", { name: "Save", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Save employee changes", exact: true })
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(profile).toHaveCount(0);
    await expect(
      page.getByRole("row").filter({ hasText: "DE LA CRUZ, MARIA SANTOS" }),
    ).toBeVisible();
  });
