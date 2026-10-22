import { test, expect } from "@playwright/test";
import { fillGovernmentIds } from "./profile-fixtures";
for (const [width, height] of [
  [375, 740],
  [768, 1024],
  [1366, 768],
  [812, 375],
]) {
  test(`manual client ID configuration and entry at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    await page
      .getByRole("button", { name: "Configure client filters and defaults" })
      .click();
    const settings = page.getByRole("dialog", {
      name: "Client entry settings",
      exact: true,
    });
    await expect(settings).toBeVisible();
    const frame = (await settings.boundingBox())!;
    expect(frame.width).toBeLessThanOrEqual(680);
    expect(frame.x).toBeGreaterThanOrEqual(12);
    expect(frame.x + frame.width).toBeLessThanOrEqual(width - 12);
    expect(frame.y).toBeGreaterThanOrEqual(16);
    expect(frame.y + frame.height).toBeLessThanOrEqual(height - 16);
    await settings
      .getByRole("button", { name: "Client settings scope", exact: true })
      .click();
    await page
      .getByRole("dialog", {
        name: "Client settings scope options",
        exact: true,
      })
      .getByRole("option")
      .first()
      .click();
    await expect(
      settings.getByRole("button", { name: "ID allocation", exact: true }),
    ).toBeVisible();
    expect(await settings.boundingBox()).toEqual(frame);
    const header = settings.locator(":scope > header");
    const footer = settings.locator(":scope > footer");
    const headerBounds = await header.boundingBox();
    const footerBounds = await footer.boundingBox();
    await settings.locator(".client-settings-body").evaluate((body) => {
      body.scrollTop = body.scrollHeight;
    });
    expect(await header.boundingBox()).toEqual(headerBounds);
    expect(await footer.boundingBox()).toEqual(footerBounds);
    await expect(
      footer.getByRole("button", { name: "Save client settings", exact: true }),
    ).toBeInViewport();
    await page.screenshot({
      path: `.test-db/reports/verification/client-settings-${width}.png`,
    });
    await settings
      .getByRole("button", { name: "ID allocation", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "ID allocation options", exact: true })
      .getByRole("option", { name: "Manual", exact: true })
      .click();
    await settings
      .getByRole("button", { name: "Save client settings", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Save client entry settings", exact: true })
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(settings).toHaveCount(0);
    await page
      .getByRole("button", { name: "Add employee", exact: true })
      .click();
    const editor = page.getByRole("dialog", {
      name: "New employee",
      exact: true,
    });
    await editor
      .getByRole("button", { name: "Initial organization", exact: true })
      .click();
    await page
      .getByRole("dialog", {
        name: "Initial organization options",
        exact: true,
      })
      .getByRole("option", { name: /Example Client/ })
      .first()
      .click();
    await editor.getByLabel("Last Name", { exact: false }).fill("Manual");
    await editor.getByLabel("First Name", { exact: false }).fill("Identity");
    await editor
      .getByRole("tab", { name: "Employment Details", exact: true })
      .click();
    const id = editor.getByLabel("ID *", { exact: true });
    await expect(id).toBeVisible();
    await id.fill("ab-00023");
    await fillGovernmentIds(editor);
    const bounds = await id.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `.test-db/reports/verification/manual-id-${width}.png`,
    });
    await editor
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Create employee", exact: true })
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    await page
      .getByRole("searchbox", { name: "Search employees" })
      .fill("Identity");
    await expect(page.getByLabel("Scrollable employee table")).toContainText(
      "AB-00023",
    );
  });
}
