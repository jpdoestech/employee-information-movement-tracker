import { test, expect } from "@playwright/test";

for (const [width, height] of [
  [320, 740],
  [768, 1024],
  [1366, 768],
  [812, 375],
]) {
  test(`overview unmasks IDs in place and retains edit drafts at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    const open = () =>
      page.getByRole("button", { name: "EMP-0000002", exact: true }).click();
    await open();
    const editor = page.getByRole("dialog", {
      name: "Employee profile",
      exact: true,
    });
    await expect(
      editor.getByRole("tab", { name: "Overview", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      editor.getByRole("tab", { name: "Profile", exact: true }),
    ).toHaveCount(0);
    await editor
      .getByRole("button", { name: "Edit Government IDs", exact: true })
      .click();
    await editor.getByLabel("SSS Number", { exact: true }).fill("0912345678");
    await editor.getByRole("tab", { name: "Overview", exact: true }).click();
    const ids = editor.getByRole("region", {
      name: "Government IDs",
      exact: true,
    });
    await expect(
      ids.locator("dd").filter({ hasText: "**-****567-8" }),
    ).toHaveCount(1);
    await expect(
      ids.locator("dd").filter({ hasText: "09-1234567-8" }),
    ).toHaveCount(0);
    const count = await ids.locator("dd").count();
    await ids
      .getByRole("button", { name: "Unmask Government IDs", exact: true })
      .click();
    await expect(
      ids.locator("dd").filter({ hasText: "09-1234567-8" }),
    ).toHaveCount(1);
    await expect(ids.locator("dd")).toHaveCount(count);
    await ids
      .getByRole("button", { name: "Mask Government IDs", exact: true })
      .click();
    await expect(
      ids.locator("dd").filter({ hasText: "09-1234567-8" }),
    ).toHaveCount(0);
    await editor
      .getByRole("button", { name: "Edit details", exact: true })
      .click();
    await editor
      .getByLabel("Email", { exact: true })
      .fill("overview@example.invalid");
    await editor
      .getByRole("button", { name: "Back to overview", exact: true })
      .click();
    await expect(
      editor.getByRole("region", { name: "Personal Information", exact: true }),
    ).toContainText("overview@example.invalid");
    expect(
      await editor.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    const footer = editor.locator(":scope > footer");
    const before = await footer.boundingBox();
    await page.screenshot({
      path: `.test-db/reports/verification/overview-top-${width}x${height}.png`,
    });
    await editor
      .locator(".employee-tab-body")
      .evaluate((el) => (el.scrollTop = 10000));
    expect(await footer.boundingBox()).toEqual(before);
    await page.screenshot({
      path: `.test-db/reports/verification/overview-${width}x${height}.png`,
    });
    await editor
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    const discard = page.getByRole("dialog", {
      name: "Discard unsaved changes?",
      exact: true,
    });
    await discard
      .getByRole("button", { name: "Continue editing", exact: true })
      .click();
    await editor
      .getByRole("button", { name: "Edit details", exact: true })
      .click();
    await expect(editor.getByLabel("Email", { exact: true })).toHaveValue(
      "overview@example.invalid",
    );
    await editor
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await discard
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await open();
    await expect(
      editor.getByRole("button", {
        name: "Unmask Government IDs",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "false");
  });
}
