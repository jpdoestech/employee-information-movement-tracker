import { expect, test } from "@playwright/test";
for (const width of [375, 1366]) {
  test(`user table opens focused editors and preserves drafts at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#permissions");
    const users = page.getByRole("region", { name: "System users" });
    await expect(users.getByRole("row")).toHaveCount(2);
    await users
      .getByRole("button", {
        name: "Edit access for Demo Administrator",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Access preset", exact: true })
      .click();
    await page
      .getByRole("option", { name: "Head Office editor", exact: true })
      .click();
    await page
      .getByLabel("Reason for policy change", { exact: true })
      .fill("Keep this access draft");
    await page
      .getByRole("button", { name: "Field permissions", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Grant organization actions",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Save field policy", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Current access", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Access overview", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Scope & assignments", exact: true })
      .click();
    await expect(
      page.getByLabel("Reason for policy change", { exact: true }),
    ).toHaveValue("Keep this access draft");
    await expect(
      page.getByRole("button", { name: "Organization scope", exact: true }),
    ).toContainText("Head Office");
    await page
      .getByRole("navigation", { name: "Access configuration" })
      .getByRole("button", { name: "Users", exact: true })
      .click();
    await page.screenshot({
      path: `.test-db/reports/release/permissions-users-${width}.png`,
    });
    await page.getByRole("button", { name: "Add user", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add user", exact: true });
    await dialog
      .getByLabel("Display name", { exact: true })
      .fill("Unsaved colleague");
    await dialog
      .getByLabel("Initial password", { exact: true })
      .fill("Synthetic-draft-password-123");
    await dialog
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    const discard = page.getByRole("dialog", {
      name: "Discard unsaved changes?",
      exact: true,
    });
    await discard
      .getByRole("button", { name: "Continue editing", exact: true })
      .click();
    await expect(
      dialog.getByLabel("Display name", { exact: true }),
    ).toHaveValue("Unsaved colleague");
    await dialog
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await discard
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await page.getByRole("button", { name: "Add user", exact: true }).click();
    await expect(
      dialog.getByLabel("Display name", { exact: true }),
    ).toHaveValue("");
    await expect(
      dialog.getByLabel("Initial password", { exact: true }),
    ).toHaveValue("");
    await page.screenshot({
      path: `.test-db/reports/release/permissions-add-user-${width}.png`,
    });
    await dialog
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await expect(users.getByRole("row")).toHaveCount(2);
  });
}
