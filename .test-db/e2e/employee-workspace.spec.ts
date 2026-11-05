import { test, expect } from "@playwright/test";

test("phone navigation cancellation returns to the draft without a drawer overlay", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#employees");
  await page.getByRole("button", { name: "Add employee", exact: true }).click();
  const editor = page.getByRole("region", {
    name: "New employee",
    exact: true,
  });
  await editor
    .getByRole("textbox", { name: "Last Name *", exact: true })
    .fill("PHONE DRAFT");
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  const discard = page.getByRole("dialog", {
    name: "Discard unsaved changes?",
    exact: true,
  });
  await expect(discard).toBeVisible();
  await discard
    .getByRole("button", { name: "Continue editing", exact: true })
    .click();
  await expect(page.locator(".sidebar.open")).toHaveCount(0);
  await expect(
    editor.getByRole("textbox", { name: "Last Name *", exact: true }),
  ).toHaveValue("PHONE DRAFT");
  await expect(editor).toBeVisible();
});

for (const size of [
  { width: 320, height: 640 },
  { width: 375, height: 740 },
  { width: 390, height: 420 },
  { width: 768, height: 1024 },
  { width: 667, height: 375 },
  { width: 812, height: 375 },
  { width: 1366, height: 768 },
  { width: 2560, height: 1440 },
]) {
  test(`employee workspace is bounded, scrollable and touch accessible at ${size.width}x${size.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    await page
      .getByRole("button", { name: "EMP-0000002", exact: true })
      .click();
    const editor = page.getByRole("region", {
      name: "Employee profile",
      exact: true,
    });
    await expect(editor).toBeVisible();
    await expect(page.locator("dialog.employee-edit-dialog")).toHaveCount(0);
    await expect(page.getByLabel("Scrollable employee table")).toBeHidden();
    await editor
      .getByRole("button", { name: "Edit details", exact: true })
      .click();
    const header = editor.locator(":scope > header"),
      footer = editor.locator(":scope > footer"),
      body = editor.locator(".employee-tab-body");
    const before = {
      header: await header.boundingBox(),
      footer: await footer.boundingBox(),
    };
    await body.evaluate((el) => (el.scrollTop = el.scrollHeight));
    expect(await header.boundingBox()).toEqual(before.header);
    expect(await footer.boundingBox()).toEqual(before.footer);
    const bounds = await editor.boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(1200);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(size.width + 1);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height + 1);
    expect((await body.boundingBox())!.height).toBeGreaterThan(65);
    if (size.width <= 760) {
      expect(before.footer!.y).toBeGreaterThan(before.header!.y);
      expect(
        (await editor
          .getByRole("button", { name: "Save", exact: true })
          .boundingBox())!.height,
      ).toBeGreaterThanOrEqual(44);
    }
    await body.evaluate((el) => (el.scrollTop = 0));
    await expect(editor.getByLabel("Last Name", { exact: true })).toBeVisible();
    const first = await editor
      .getByLabel("First Name", { exact: true })
      .boundingBox();
    const last = await editor
      .getByLabel("Last Name", { exact: true })
      .boundingBox();
    if (size.width <= 600) expect(first!.y).toBeGreaterThan(last!.y);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.test-db/reports/employee-workspace-${size.width}x${size.height}.png`,
    });
    await editor
      .getByRole("button", { name: "Back to Employees", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    await expect(page.getByLabel("Scrollable employee table")).toBeVisible();
  });
}

test("returning restores table filters, page, scroll and keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#employees");
  await page
    .getByRole("searchbox", { name: "Search employees" })
    .fill("Synthetic");
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  const table = page.getByLabel("Scrollable employee table");
  await expect(
    table.getByRole("button", { name: "EMP-0000026", exact: true }),
  ).toBeVisible();
  await table.evaluate((el) => {
    el.scrollTop = 100;
    el.scrollLeft = 70;
  });
  const before = await table.evaluate((el) => ({
    top: el.scrollTop,
    left: el.scrollLeft,
  }));
  const opener = table.getByRole("button", {
    name: "EMP-0000030",
    exact: true,
  });
  await opener.click();
  const editor = page.getByRole("region", {
    name: "Employee profile",
    exact: true,
  });
  await editor
    .getByRole("button", { name: "Back to Employees", exact: true })
    .click();
  await expect(
    page.getByRole("searchbox", { name: "Search employees" }),
  ).toHaveValue("Synthetic");
  await expect(page.locator(".pagination")).toContainText("26–34");
  await expect(opener).toBeFocused();
  await expect
    .poll(() =>
      table.evaluate((el) => ({ top: el.scrollTop, left: el.scrollLeft })),
    )
    .toEqual(before);
});

test("add/edit drafts survive back, sidebar, sign-out and browser-back cancellation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#employees");
  await page.getByRole("button", { name: "Add employee", exact: true }).click();
  const editor = page.getByRole("region", {
    name: "New employee",
    exact: true,
  });
  await editor
    .getByRole("textbox", { name: "Last Name *", exact: true })
    .fill("KEEP DRAFT");
  const discard = page.getByRole("dialog", {
    name: "Discard unsaved changes?",
    exact: true,
  });
  for (const action of [
    () =>
      editor
        .getByRole("button", { name: "Back to Employees", exact: true })
        .click(),
    () => page.getByRole("link", { name: "Overview", exact: true }).click(),
    () => page.getByRole("button", { name: "Sign out", exact: true }).click(),
    () => page.goBack(),
    () => page.goBack(),
  ]) {
    await action();
    await expect(discard).toBeVisible();
    await discard
      .getByRole("button", { name: "Continue editing", exact: true })
      .click();
    await expect(
      editor.getByRole("textbox", { name: "Last Name *", exact: true }),
    ).toHaveValue("KEEP DRAFT");
    await expect(page).toHaveURL(/#employees$/);
  }
  expect(
    await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(true);
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await discard
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  await expect(page.locator(".pagination")).toContainText("of 34");
  await page.getByRole("button", { name: "Add employee", exact: true }).click();
  await editor
    .getByRole("textbox", { name: "Last Name *", exact: true })
    .fill("LEAVE DRAFT");
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await discard
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page).toHaveURL(/#dashboard$/);
  await expect(editor).toHaveCount(0);
});
