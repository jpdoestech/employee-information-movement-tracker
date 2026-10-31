import { test, expect } from "@playwright/test";

for (const [width, height] of [
  [375, 740],
  [768, 1024],
  [1366, 768],
  [812, 375],
])
  test(`name case choices preserve draft, preview and saved spelling at ${width}x${height}`, async ({
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
    const dialog = page.getByRole("dialog", {
      name: "New employee",
      exact: true,
    });
    const last = dialog.getByLabel("Last Name *", { exact: true });
    const first = dialog.getByLabel("First Name *", { exact: true });
    await last.fill("McDonald");
    await first.fill("mAriA");
    await expect(last).toHaveValue("MCDONALD");
    await expect(first).toHaveValue("MARIA");
    async function changeCase(field: string, option: string) {
      await page
        .getByRole("button", { name: `Change case for ${field}`, exact: true })
        .click();
      const panel = page.getByRole("dialog", {
        name: `Change case for ${field} options`,
        exact: true,
      });
      await expect(panel.getByRole("option")).toHaveCount(3);
      const bounds = await panel.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height + 1);
      await panel.getByRole("option", { name: option, exact: true }).click();
    }
    await changeCase("Last Name", "USER DEFINED");
    await last.fill("  McDonald  ");
    await changeCase("First Name", "PROPER CASE");
    await expect(first).toHaveValue("Maria");
    await changeCase("Middle Name", "PROPER CASE");
    await dialog.getByLabel("Middle Name", { exact: true }).fill("dE lA PEÑA");
    await changeCase("Suffix", "USER DEFINED");
    await dialog.getByLabel("Suffix", { exact: true }).fill("Ph.D.");
    await dialog
      .getByRole("tab", { name: "Employment Details", exact: true })
      .click();
    await dialog
      .getByRole("tab", { name: "Personal Information", exact: true })
      .click();
    await expect(last).toHaveValue("McDonald");
    await expect(
      dialog.getByRole("button", {
        name: "Change case for Last Name",
        exact: true,
      }),
    ).toHaveAttribute("title", "USER DEFINED");
    await last.press("End");
    await last.press("s");
    await expect(last).toHaveValue("McDonalds");
    await last.press("Backspace");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    const confirmation = page.getByRole("dialog", {
      name: "Create employee",
      exact: true,
    });
    await confirmation
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await expect(last).toHaveValue("McDonald");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await confirmation
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await page
      .getByRole("searchbox", { name: "Search employees" })
      .fill("McDonald");
    const row = page
      .getByRole("row")
      .filter({ hasText: "McDonald, Maria De La Peña Ph.D." });
    await expect(row).toBeVisible();
    await row.getByRole("button").first().click();
    const profile = page.getByRole("dialog", {
      name: "Employee profile",
      exact: true,
    });
    await profile
      .getByRole("button", { name: "Edit details", exact: true })
      .click();
    const editedFirst = profile.getByLabel("First Name", { exact: true });
    await editedFirst.fill("JoAnne");
    await expect(editedFirst).toHaveValue("JoAnne");
    await expect(profile.locator(".employee-identity-strip")).toHaveText(
      "McDonald, JoAnne De La Peña Ph.D.",
    );
    await changeCase("Last Name", "PROPER CASE");
    await expect(profile.locator(".employee-identity-strip")).toHaveText(
      "Mcdonald, JoAnne De La Peña Ph.D.",
    );
    await changeCase("Last Name", "UPPER CASE");
    await expect(profile.getByLabel("Last Name", { exact: true })).toHaveValue(
      "MCDONALD",
    );
    await expect(profile.locator(".employee-identity-strip")).toHaveText(
      "MCDONALD, JoAnne De La Peña Ph.D.",
    );
    await page.screenshot({
      path: `.test-db/reports/release/name-case-${width}x${height}.png`,
    });
    await profile.getByRole("button", { name: "Save", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Save employee changes", exact: true })
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(profile).toHaveCount(0);
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: "MCDONALD, JoAnne De La Peña Ph.D." }),
    ).toBeVisible();
  });
