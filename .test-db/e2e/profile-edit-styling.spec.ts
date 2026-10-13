import { test, expect } from "@playwright/test";

for (const [width, height] of [
  [375, 740],
  [768, 1024],
  [1366, 600],
  [812, 375],
]) {
  test(`profile edit styling and atomic department/position save at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    const row = page
      .getByLabel("Scrollable employee table")
      .locator("tbody tr")
      .nth(1);
    await row.locator("td.employee-name").click();
    const editor = page.getByRole("dialog", {
      name: "Employee profile",
      exact: true,
    });
    await editor
      .getByRole("button", { name: "Edit details", exact: true })
      .click();
    const tabs = editor.getByRole("tablist");
    await expect(tabs).toHaveAttribute("aria-orientation", "horizontal");
    const department = editor.getByLabel("Department", { exact: true });
    const position = editor.getByLabel("Position", { exact: true });
    const birth = editor.getByLabel("Birth Date", { exact: true });
    const gender = editor.getByRole("button", { name: "Gender", exact: true });
    const civil = editor.getByRole("button", {
      name: "Civil Status",
      exact: true,
    });
    const name = editor.getByRole("textbox", {
      name: "Last Name",
      exact: true,
    });
    expect((await birth.boundingBox())!.width).toBeGreaterThan(140);
    expect((await birth.boundingBox())!.width).toBeLessThan(230);
    expect((await civil.boundingBox())!.width).toBeLessThan(
      (await gender.boundingBox())!.width,
    );
    if (width === 1366)
      expect((await birth.boundingBox())!.width).toBeLessThan(
        (await name.boundingBox())!.width,
      );
    expect(
      (await editor.getByLabel("Suffix", { exact: true }).boundingBox())!.width,
    ).toBeLessThan((await name.boundingBox())!.width);
    await gender.click();
    await page
      .getByRole("dialog", { name: "Gender options", exact: true })
      .getByRole("option", { name: "Prefer not to say", exact: true })
      .click();
    await expect(gender).toContainText("Prefer not to say");
    expect(
      await gender.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await department.fill("Operations");
    await position.fill("Senior Analyst");
    if (width > 480) {
      const d = await department.boundingBox(),
        p = await position.boundingBox();
      expect(Math.abs(d!.y - p!.y)).toBeLessThan(2);
      expect(p!.x).toBeGreaterThan(d!.x);
    }
    const footer = editor.locator(":scope > footer");
    const before = await footer.boundingBox();
    await editor.locator(".employee-tab-body").evaluate((el) => {
      el.scrollTop = 10000;
    });
    expect(await footer.boundingBox()).toEqual(before);
    expect(
      await editor.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await editor.locator(".employee-tab-body").evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.screenshot({
      path: `.test-db/reports/verification/profile-edit-ui-styling-${width}x${height}.png`,
    });
    const save = editor.getByRole("button", {
      name: "Save to Supabase",
      exact: true,
    });
    await save.click();
    await page
      .getByRole("dialog", { name: "Classify employment changes", exact: true })
      .getByRole("button", { name: "Official change", exact: true })
      .click();
    const confirm = page.getByRole("dialog", {
      name: "Save employee changes",
      exact: true,
    });
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(position).toHaveValue("Senior Analyst");
    await save.click();
    await page
      .getByRole("dialog", { name: "Classify employment changes", exact: true })
      .getByRole("button", { name: "Official change", exact: true })
      .click();
    await confirm
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    await row.locator("td.employee-name").click();
    await editor
      .getByRole("button", { name: "Edit details", exact: true })
      .click();
    await expect(editor.getByLabel("Department", { exact: true })).toHaveValue(
      "Operations",
    );
    await expect(editor.getByLabel("Position", { exact: true })).toHaveValue(
      "Senior Analyst",
    );
    await editor
      .getByRole("tab", { name: "Record history", exact: true })
      .click();
    await expect(
      editor.locator(".timeline-item").filter({ hasText: "position" }),
    ).toHaveCount(1);
  });
}
