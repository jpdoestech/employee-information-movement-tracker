import { test, expect } from "@playwright/test";
for (const [width, height] of [
  [1440, 900],
  [390, 844],
]) {
  test(`superadmin customizes the applicable managed columns directly at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() =>
      localStorage.setItem(
        "eimt-synthetic-managed-views",
        JSON.stringify([
          {
            id: "global",
            name: "Employee register",
            user_id: null,
            scope_type: "all",
            scope_id: null,
            config: {
              columns: ["name", "position"],
              pinned: ["name"],
              showRowNumbers: true,
            },
          },
        ]),
      ),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    const button = page.getByRole("button", {
      name: "Customize Columns",
      exact: true,
    });
    await expect(button).toBeEnabled();
    await button.click();
    const editor = page.getByRole("dialog", {
      name: "Managed column view",
      exact: true,
    });
    await expect(editor).toContainText(
      "Saving updates this shared managed view",
    );
    await expect(
      editor.getByRole("button", { name: "Accounts", exact: true }),
    ).toBeDisabled();
    await expect(
      editor.getByRole("button", { name: "Applies to", exact: true }),
    ).toBeDisabled();
    await expect(
      editor.getByRole("button", { name: "Clear Accounts", exact: true }),
    ).toBeDisabled();
    await expect(
      editor.getByRole("button", { name: "Clear Applies to", exact: true }),
    ).toBeDisabled();
    await editor
      .getByRole("button", { name: "Visible columns", exact: true })
      .click();
    const picker = page.getByRole("dialog", {
      name: "Visible columns options",
      exact: true,
    });
    await picker.getByRole("combobox").fill("Age");
    await picker.getByRole("option", { name: /^Age / }).click();
    await picker.getByRole("button", { name: "Apply", exact: true }).click();
    await editor
      .getByRole("button", { name: "Apply & Save", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Save managed column view", exact: true })
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    await expect(
      page
        .getByLabel("Scrollable employee table")
        .getByRole("columnheader", { name: "Age", exact: true }),
    ).toHaveCount(1);
    expect(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("eimt-synthetic-views") || "[]"),
      ),
    ).toEqual([]);
    await page.screenshot({
      path: `.test-db/reports/screenshots/direct-managed-columns-${width}.png`,
    });
  });
}
