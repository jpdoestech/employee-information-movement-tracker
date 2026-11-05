import { test, expect } from "@playwright/test";

for (const [width, height] of [
  [320, 740],
  [768, 1024],
  [1366, 600],
]) {
  test(`new field applicability resolves without saving at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#fields");
    await page.getByRole("button", { name: "New field", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "Create field definition",
      exact: true,
    });
    await expect(dialog.getByRole("status")).toContainText(
      "34 readable employees in scope",
    );
    await expect(
      dialog
        .getByRole("list", { name: "Authorized employee sample" })
        .locator("li"),
    ).toHaveCount(5);
    await dialog
      .getByLabel("Label", { exact: true })
      .fill("Unsaved applicability draft");
    await dialog
      .getByLabel("Immutable machine key")
      .fill("unsaved_applicability_draft");
    await dialog
      .getByRole("button", { name: "Applicability", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Applicability options" })
      .getByRole("option", {
        name: "Selected branches / clients / Head Office",
      })
      .click();
    await expect(dialog.getByRole("status")).toContainText(
      "0 readable employees in scope",
    );
    await expect(
      dialog.getByRole("button", { name: "Save definition" }),
    ).toBeDisabled();
    await dialog
      .getByRole("button", { name: "Applicable organizations", exact: true })
      .click();
    const picker = page.getByRole("dialog", {
      name: "Applicable organizations options",
    });
    await picker
      .getByRole("option", { name: /Example North Branch Branch/ })
      .click();
    await picker.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(dialog.getByRole("status")).toContainText(
      "1 resolved authorized targets. 0 readable employees",
    );
    await dialog.getByLabel("Include clients under selected branches").check();
    await expect(dialog.getByRole("status")).toContainText(
      "2 resolved authorized targets.",
    );
    await expect(dialog.getByRole("status")).not.toContainText(
      "0 readable employees",
    );
    await expect(dialog.getByLabel("Label", { exact: true })).toHaveValue(
      "Unsaved applicability draft",
    );
    expect(
      await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    ).toBe(true);
    const box = await dialog.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(width);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByText("Unsaved applicability draft", { exact: true }),
    ).toHaveCount(0);
  });
}
