import { expect, test } from "@playwright/test";

for (const size of [
  { width: 1366, height: 768 },
  { width: 375, height: 740 },
  { width: 768, height: 1024 },
  { width: 812, height: 375 },
]) {
  test(`hard delete requires preview, typed phrase and confirmation; cancellation preserves data at ${size.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#permissions");
    await page
      .getByRole("button", { name: "Data management", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Review data deletion", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Permanently delete employee data",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    const remove = dialog.getByRole("button", {
      name: "Permanently delete",
      exact: true,
    });
    await expect(remove).toBeDisabled();
    await dialog
      .getByRole("button", { name: "Deletion scope", exact: true })
      .click();
    await page
      .getByRole("option", { name: "Example North Branch Branch", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Preview affected data", exact: true })
      .click();
    const review = dialog.getByRole("region", {
      name: "Deletion preview",
      exact: true,
    });
    await expect(
      review.getByRole("heading", {
        name: "Example North Branch",
        exact: true,
      }),
    ).toBeVisible();
    const phrase = dialog.getByLabel(/^Type DELETE/);
    await expect(phrase).toHaveCount(1);
    const label = await phrase.evaluate(
      (e) => e.closest("label")?.textContent || "",
    );
    const confirmation = label.replace(/^Type /, "").trim();
    await dialog
      .getByLabel("Deletion reason", { exact: true })
      .fill("Synthetic reviewed hard deletion");
    await phrase.fill("wrong");
    await expect(remove).toBeDisabled();
    await phrase.fill(confirmation);
    await expect(remove).toBeEnabled();
    await remove.click();
    const confirm = page
      .getByRole("dialog", {
        name: "Permanently delete employee data",
        exact: true,
      })
      .filter({
        has: page.getByRole("button", { name: "Continue", exact: true }),
      });
    await expect(confirm).toContainText("cannot be undone");
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(phrase).toHaveValue(confirmation);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Discard unsaved changes?", exact: true })
      .getByRole("button", { name: "Continue editing", exact: true })
      .click();
    await expect(phrase).toHaveValue(confirmation);
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(size.width + 1);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height + 1);
    await page.screenshot({
      path: `.test-db/reports/release/employee-purge-${size.width}.png`,
    });
    await remove.click();
    await confirm
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await page.goto("/#employees");
    await expect(page.locator(".table-region tbody")).not.toContainText(
      "Example North Branch",
    );
    await expect(page.locator(".table-region tbody")).toContainText(
      "Example South Branch",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  });
}
