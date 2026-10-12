import { test, expect, type Page } from "@playwright/test";
async function start(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#employees");
  await page.getByRole("button", { name: "Add employee", exact: true }).click();
  return page.getByRole("dialog", { name: "New employee", exact: true });
}
test("separate name fields require first and last, preserve tab drafts, and save a combined identity", async ({
  page,
}) => {
  const editor = await start(page);
  await expect(editor.getByLabel("Employee Name", { exact: true })).toHaveCount(
    0,
  );
  await editor.getByLabel("First Name", { exact: false }).fill("Ana");
  await editor.getByRole("button", { name: "Save to Supabase" }).click();
  await expect(
    editor.getByText("Last Name is required.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Create employee", exact: true }),
  ).toHaveCount(0);
  await editor.getByLabel("Last Name", { exact: false }).fill("Cruz");
  await editor.getByLabel("Middle Name", { exact: true }).fill("Maria");
  await editor.getByLabel("Suffix", { exact: true }).fill("Jr.");
  await editor.getByRole("tab", { name: "Contact", exact: true }).click();
  await editor.getByLabel("Email", { exact: true }).fill("ana@example.invalid");
  await editor.getByRole("tab", { name: "Profile", exact: true }).click();
  await expect(editor.getByLabel("Last Name", { exact: false })).toHaveValue(
    "Cruz",
  );
  await editor.getByRole("button", { name: "Save to Supabase" }).click();
  const confirm = page.getByRole("dialog", {
    name: "Create employee",
    exact: true,
  });
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(editor.getByLabel("First Name", { exact: false })).toHaveValue(
    "Ana",
  );
  await editor.getByRole("button", { name: "Save to Supabase" }).click();
  await confirm.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page
    .getByRole("searchbox", { name: "Search employees" })
    .fill("Cruz, Ana Maria Jr.");
  const row = page.getByRole("row").filter({ hasText: "Cruz, Ana Maria Jr." });
  await expect(row).toHaveCount(1);
  await row.getByRole("button").first().click();
  const profile = page.getByRole("dialog", {
    name: "Employee profile",
    exact: true,
  });
  await expect(profile.getByLabel("First Name", { exact: false })).toHaveValue(
    "Ana",
  );
  await profile.getByRole("tab", { name: "Contact", exact: true }).click();
  await expect(profile.getByLabel("Email", { exact: true })).toHaveValue(
    "ana@example.invalid",
  );
});
test("unresolved address entries remain invalid across tab changes until confirmed", async ({
  page,
}) => {
  const editor = await start(page);
  await editor.getByLabel("Last Name", { exact: false }).fill("Sample");
  await editor.getByLabel("First Name", { exact: false }).fill("Test");
  await editor.getByRole("tab", { name: "Address", exact: true }).click();
  const province = editor
    .getByRole("group", { name: "Home Address", exact: true })
    .getByRole("combobox", { name: "Province", exact: true });
  await province.fill("Unconfirmed province");
  await province.press("Tab");
  await editor.getByRole("tab", { name: "Profile", exact: true }).click();
  await expect(
    editor.getByRole("button", { name: "Save to Supabase" }),
  ).toBeDisabled();
  await editor.getByRole("tab", { name: "Address", exact: true }).click();
  await expect(province).toHaveValue("Unconfirmed province");
  await province.fill("Davao del Sur");
  await province.press("Enter");
  await editor.getByRole("tab", { name: "Profile", exact: true }).click();
  await expect(
    editor.getByRole("button", { name: "Save to Supabase" }),
  ).toBeEnabled();
});

test("Superadmin merges field groups into an ordered tab after confirmation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#fields");
  await page.getByRole("button", { name: "Form tabs", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Employee form tabs",
    exact: true,
  });
  await dialog
    .getByLabel("Tab name for Core identity", { exact: true })
    .fill("Personal details");
  await dialog
    .getByLabel("Tab name for Contact information", { exact: true })
    .fill("Personal details");
  await dialog
    .getByLabel("Tab order for Core identity", { exact: true })
    .fill("1");
  await expect(
    dialog.getByLabel("Tab order for Contact information", { exact: true }),
  ).toHaveValue("1");
  await dialog.getByRole("button", { name: "Save tabs", exact: true }).click();
  const confirm = page.getByRole("dialog", {
    name: "Save employee form tabs",
    exact: true,
  });
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    dialog.getByLabel("Tab name for Core identity", { exact: true }),
  ).toHaveValue("Personal details");
  await dialog.getByRole("button", { name: "Save tabs", exact: true }).click();
  await confirm.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.goto("/#employees");
  await page.getByRole("button", { name: "Add employee", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "New employee",
    exact: true,
  });
  await expect(editor.getByRole("tab")).toHaveCount(2);
  await expect(
    editor.getByRole("tab", { name: "Personal details", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(editor.getByLabel("First Name", { exact: false })).toBeVisible();
  await expect(editor.getByLabel("Email", { exact: true })).toBeVisible();
});
for (const [width, height] of [
  [320, 740],
  [768, 1024],
  [1366, 600],
  [812, 375],
]) {
  test(`employee tabs retain drafts and keep navigation/actions stationary at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const editor = await start(page);
    const tabs = editor.getByRole("tablist"),
      footer = editor.locator(":scope > footer");
    const before = {
      tabs: await tabs.boundingBox(),
      footer: await footer.boundingBox(),
    };
    await editor.getByLabel("Last Name", { exact: false }).fill("Sample");
    await editor
      .getByRole("tab", { name: "Profile", exact: true })
      .press("ArrowRight");
    await expect(
      editor.getByRole("tab", { name: "Contact", exact: true }),
    ).toBeFocused();
    await editor.getByRole("tab", { name: "Address", exact: true }).click();
    await editor
      .getByRole("group", { name: "Home Address", exact: true })
      .getByLabel("Street / building")
      .fill("12 Sample St");
    await editor.locator(".employee-tab-body").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect((await tabs.boundingBox())!.y).toBe(before.tabs!.y);
    expect((await footer.boundingBox())!.y).toBe(before.footer!.y);
    expect(
      await editor.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await editor.getByRole("tab", { name: "Profile", exact: true }).click();
    await expect(editor.getByLabel("Last Name", { exact: false })).toHaveValue(
      "Sample",
    );
    await page.screenshot({
      path: `.test-db/reports/verification/employee-form-${width}x${height}.png`,
    });
    await editor
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Continue editing", exact: true })
      .click();
    await expect(editor.getByLabel("Last Name", { exact: false })).toHaveValue(
      "Sample",
    );
  });
}
