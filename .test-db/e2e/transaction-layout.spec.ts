import { test, expect } from "@playwright/test";

for (const [width, height] of [
  [375, 740],
  [768, 1024],
  [1366, 600],
  [812, 375],
]) {
  test(`movement modal keeps its frame through preview and back at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#movements");
    await page
      .getByRole("button", { name: "New transaction", exact: true })
      .click();
    const editor = page.getByRole("dialog", {
      name: "New movement transaction",
      exact: true,
    });
    await editor.getByRole("button", { name: "Employee", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Employee options", exact: true })
      .getByRole("option", { name: /Synthetic Employee 01/ })
      .click();
    await editor
      .getByRole("button", { name: "Movement type", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Movement type options", exact: true })
      .getByRole("option", { name: /Position/ })
      .click();
    await editor
      .getByLabel("New position", { exact: true })
      .fill("Senior Analyst");
    await editor
      .getByLabel("Reason", { exact: true })
      .fill("Synthetic layout verification");
    const frame = await editor.boundingBox();
    const footer = editor.locator(":scope > footer");
    const actions = await footer.boundingBox();
    expect(frame!.x).toBeGreaterThanOrEqual(0);
    expect(frame!.y).toBeGreaterThanOrEqual(0);
    expect(frame!.x + frame!.width).toBeLessThanOrEqual(width);
    expect(frame!.y + frame!.height).toBeLessThanOrEqual(height);
    await editor.locator(".dialog-body").evaluate((el) => {
      el.scrollTop = 10000;
    });
    expect(await footer.boundingBox()).toEqual(actions);
    await editor
      .getByRole("button", { name: "Preview transaction", exact: true })
      .click();
    await expect(
      editor.getByRole("button", { name: "Confirm transaction", exact: true }),
    ).toBeVisible();
    expect(await editor.boundingBox()).toEqual(frame);
    expect(await footer.boundingBox()).toEqual(actions);
    await page.screenshot({
      path: `.test-db/reports/verification/transaction-ui-styling-${width}x${height}.png`,
    });
    await editor.getByRole("button", { name: "Back", exact: true }).click();
    expect(await editor.boundingBox()).toEqual(frame);
    await expect(
      editor.getByLabel("New position", { exact: true }),
    ).toHaveValue("Senior Analyst");
  });
}
