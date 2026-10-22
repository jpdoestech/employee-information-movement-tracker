import { expect, test } from "@playwright/test";

for (const viewport of [
  { width: 375, height: 740 },
  { width: 768, height: 1024 },
  { width: 1366, height: 768 },
  { width: 812, height: 375 },
]) {
  test(`archive uses one shared confirmation and preserves cancelled drafts at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    const table = page.getByLabel("Scrollable employee table");
    await table.locator("tbody tr").first().getByRole("button").click();
    const editor = page.getByRole("dialog", {
      name: "Employee profile",
      exact: true,
    });
    await editor
      .getByRole("button", { name: "Edit details", exact: true })
      .click();
    const email = editor.getByLabel("Email", { exact: true });
    await email.fill("archive-draft@example.invalid");
    const archive = editor.getByRole("button", {
      name: "Archive employee",
      exact: true,
    });
    const confirmation = page.getByRole("dialog", {
      name: "Archive employee",
      exact: true,
    });
    const originalCount = await page.locator(".pagination").textContent();
    for (const cancel of ["Cancel", "Close confirmation", "Escape"]) {
      await archive.click();
      await expect(confirmation).toHaveClass("transaction-confirmation");
      await expect(confirmation).toContainText(
        "identity and authoritative history are retained",
      );
      await expect(confirmation.locator(":focus")).toHaveCount(1);
      const bounds = await confirmation.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
      if (cancel === "Escape") await confirmation.press("Escape");
      else
        await confirmation
          .getByRole("button", { name: cancel, exact: true })
          .click();
      await expect(confirmation).toHaveCount(0);
      await expect(email).toHaveValue("archive-draft@example.invalid");
      await expect(page.locator(".pagination")).toHaveText(originalCount!);
    }
    await archive.click();
    await confirmation
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(confirmation).toHaveCount(0);
    await expect(editor).toHaveCount(0);
    await expect(page.locator(".pagination")).toContainText("of 33");
  });
}
