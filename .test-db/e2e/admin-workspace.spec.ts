import { test, expect, type Page } from "@playwright/test";
async function enter(page: Page, route = "employees") {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto(`/#${route}`);
}
test("row ordinals stay first, continue across pages and obey display policy", async ({
  page,
}) => {
  await enter(page);
  const table = page.getByLabel("Scrollable employee table");
  await expect(table.locator("thead th").first()).toHaveText("No.");
  await expect(
    table.locator("tbody tr").first().locator("td").first(),
  ).toHaveText("1");
  const before = await table.locator("th.row-ordinal").boundingBox();
  await table.evaluate((el) => (el.scrollLeft = 700));
  expect((await table.locator("th.row-ordinal").boundingBox())!.x).toBe(
    before!.x,
  );
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(
    table.locator("tbody tr").first().locator("td").first(),
  ).toHaveText("26");
  await page.goto("/#permissions");
  await page
    .getByRole("button", { name: "Register settings", exact: true })
    .click();
  await page.getByLabel("Allow users to display row numbers").click();
  const confirm = page.getByRole("dialog", {
    name: "Save register display policy",
    exact: true,
  });
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByLabel("Allow users to display row numbers"),
  ).toBeChecked();
  await page.getByLabel("Allow users to display row numbers").click();
  await confirm.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByLabel("Allow users to display row numbers"),
  ).not.toBeChecked();
  await page.goto("/#employees");
  await expect(table.locator(".row-ordinal")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Customize Columns", exact: true })
    .click();
  await expect(page.getByLabel("Show row numbers")).toBeDisabled();
});
test("personal row-number preference saves without changing identity columns", async ({
  page,
}) => {
  await enter(page);
  await page
    .getByRole("button", { name: "Customize Columns", exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: "Customize Columns",
    exact: true,
  });
  await editor.getByRole("tab", { name: "View settings", exact: true }).click();
  await editor.getByLabel("Show row numbers").uncheck();
  await editor
    .getByRole("button", { name: "Apply & Save", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Save personal view", exact: true })
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  await expect(
    page.getByLabel("Scrollable employee table").locator(".row-ordinal"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "System ID", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await expect(page.getByLabel("Scrollable employee table")).toBeVisible();
  await expect(
    page.getByLabel("Scrollable employee table").locator(".row-ordinal"),
  ).toHaveCount(0);
});
for (const [width, height] of [
  [375, 740],
  [768, 1024],
  [1366, 600],
  [812, 375],
]) {
  test(`administration pages and definition editor are bounded at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await enter(page, "fields");
    const region = page.getByRole("region", {
      name: "Field definitions",
      exact: true,
    });
    await expect(region.locator("tbody tr").first()).toBeVisible();
    const heading = await page
      .locator(".field-workspace .workspace-toolbar")
      .boundingBox();
    await region.evaluate((el) => (el.scrollTop = 500));
    expect(
      await page.locator(".field-workspace .workspace-toolbar").boundingBox(),
    ).toEqual(heading);
    await page
      .getByRole("searchbox", { name: "Search fields" })
      .fill("employee_number");
    await expect(region).toContainText("System ID");
    await expect(region).not.toContainText("Employment Status");
    await page.getByRole("button", { name: "New field", exact: true }).click();
    const editor = page.getByRole("dialog", {
      name: "Create field definition",
      exact: true,
    });
    const bounds = (await editor.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height + 1);
    await page.screenshot({
      path: `.test-db/reports/screenshots/definition-editor-${width}.png`,
    });
    await editor
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.goto("/#permissions");
    await page.getByRole("button", { name: "Add user", exact: true }).click();
    await expect(
      page.getByLabel("Email address", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Account source", exact: true })
      .click();
    await page
      .getByRole("option", { name: "Enroll existing account", exact: true })
      .click();
    await expect(page.getByLabel("Auth user UUID")).toBeVisible();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Discard unsaved changes?", exact: true })
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Access rules", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "User", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.test-db/reports/screenshots/access-rules-${width}.png`,
    });
  });
}
