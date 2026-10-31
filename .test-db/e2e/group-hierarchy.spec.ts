import { test, expect } from "@playwright/test";
for (const [width, height] of [
  [320, 740],
  [768, 1024],
  [1366, 768],
  [812, 375],
]) {
  test(`parent groups, scoped pencils and all-details editing at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    await page
      .getByRole("button", { name: "EMP-0000002", exact: true })
      .click();
    const editor = page.getByRole("dialog", {
      name: "Employee profile",
      exact: true,
    });
    const tabs = editor.getByRole("tablist");
    await expect(tabs).toHaveAttribute("aria-orientation", "horizontal");
    await expect(tabs.getByRole("tab")).toHaveCount(2);
    await expect(
      editor.getByRole("region", { name: "Employment Details", exact: true }),
    ).toBeVisible();
    await expect(
      editor.getByRole("region", { name: "Personal Information", exact: true }),
    ).toBeVisible();
    await editor
      .getByRole("button", { name: "Edit Government IDs", exact: true })
      .click();
    await expect(
      editor.getByRole("tab", { name: "Edit Government IDs", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      editor.getByLabel("SSS Number", { exact: true }),
    ).toBeVisible();
    await expect(
      editor.getByLabel("Last Name", { exact: true }),
    ).not.toBeVisible();
    await expect(
      editor.getByLabel("Department", { exact: true }),
    ).not.toBeVisible();
    await editor.getByLabel("SSS Number", { exact: true }).fill("0912345678");
    await editor
      .getByRole("button", { name: "Back to overview", exact: true })
      .click();
    await expect(tabs.getByRole("tab")).toHaveCount(2);
    await editor
      .getByRole("button", { name: "Edit Emergency Information", exact: true })
      .click();
    const discard = page.getByRole("dialog", {
      name: "Discard unsaved changes?",
      exact: true,
    });
    await discard
      .getByRole("button", { name: "Continue editing", exact: true })
      .click();
    await expect(editor.getByLabel("SSS Number", { exact: true })).toHaveValue(
      "09-1234567-8",
    );
    await editor
      .getByRole("button", { name: "Back to overview", exact: true })
      .click();
    await editor
      .getByRole("button", { name: "Edit details", exact: true })
      .click();
    await expect(editor.getByLabel("SSS Number", { exact: true })).toHaveValue(
      "09-1234567-8",
    );
    await expect(editor.getByLabel("Last Name", { exact: true })).toBeVisible();
    await expect(
      editor.getByLabel("Department", { exact: true }),
    ).toBeVisible();
    await expect(
      editor.getByLabel("Emergency contact name", { exact: true }),
    ).toBeVisible();
    await expect(
      editor.getByRole("group", {
        name: "Personal Information / Government IDs",
        exact: true,
      }),
    ).toBeVisible();
    const footer = editor.locator(":scope > footer"),
      before = await footer.boundingBox();
    await editor
      .locator(".employee-tab-body")
      .evaluate((el) => (el.scrollTop = 10000));
    expect(await footer.boundingBox()).toEqual(before);
    expect(
      await editor.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await editor
      .getByRole("button", { name: "Back to overview", exact: true })
      .click();
    await page.screenshot({
      path: `.test-db/reports/verification/group-hierarchy-${width}x${height}.png`,
    });
    await editor
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await discard
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await page
      .getByRole("button", { name: "EMP-0000002", exact: true })
      .click();
    await editor
      .getByRole("button", { name: "Edit Government IDs", exact: true })
      .click();
    await expect(editor.getByLabel("SSS Number", { exact: true })).toHaveValue(
      "",
    );
  });
}
test("a configured sub-group follows its parent name in creation and editing", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#fields");
  await page
    .getByRole("button", { name: "Edit group Compensation", exact: true })
    .click();
  const group = page.getByRole("dialog", { name: "Field group", exact: true });
  await group.getByLabel("Name", { exact: true }).fill("Pay details");
  await group.getByRole("button", { name: "Save group", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Save field group", exact: true })
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await page.getByRole("button", { name: "New field", exact: true }).click();
  const definition = page.getByRole("dialog", {
    name: "Create field definition",
    exact: true,
  });
  await definition.getByLabel("Label", { exact: true }).fill("Daily rate");
  await definition.getByLabel("Immutable machine key").fill("daily_rate");
  await definition
    .getByRole("button", { name: "Permission group", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Permission group options", exact: true })
    .getByRole("option", { name: "Employment Details / Pay details", exact: true })
    .click();
  await definition
    .getByRole("button", { name: "Save definition", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Save field definition", exact: true })
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await page.goto("/#employees");
  await page.getByRole("button", { name: "Add employee", exact: true }).click();
  const form = page.getByRole("dialog", { name: "New employee", exact: true });
  await form
    .getByRole("tab", { name: "Employment Details", exact: true })
    .click();
  await expect(
    form.getByRole("group", {
      name: "Employment Details / Pay details",
      exact: true,
    }),
  ).toBeVisible();
  await expect(form.getByLabel("Daily rate", { exact: true })).toBeVisible();
  await form.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "EMP-0000002", exact: true }).click();
  const profile = page.getByRole("dialog", {
    name: "Employee profile",
    exact: true,
  });
  await profile
    .getByRole("button", { name: "Edit Pay details", exact: true })
    .click();
  await expect(profile.getByLabel("Daily rate", { exact: true })).toBeVisible();
  await expect(
    profile.getByLabel("Department", { exact: true }),
  ).not.toBeVisible();
});
test("unresolved address drafts survive Overview and expansion to all details without bypassing validation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#employees");
  await page.getByRole("button", { name: "EMP-0000002", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "Employee profile",
    exact: true,
  });
  await editor
    .getByRole("button", { name: "Edit Address", exact: true })
    .click();
  const home = editor.getByRole("group", { name: "Home Address", exact: true });
  await home
    .getByLabel("City / municipality", { exact: true })
    .fill("Unconfirmed place");
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
  await expect(
    home.getByLabel("City / municipality", { exact: true }),
  ).toHaveValue("Unconfirmed place");
  await editor
    .getByRole("button", { name: "Back to overview", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Edit Emergency Information", exact: true })
    .click();
  await discard
    .getByRole("button", { name: "Continue editing", exact: true })
    .click();
  await expect(
    home.getByLabel("City / municipality", { exact: true }),
  ).toHaveValue("Unconfirmed place");
  await home
    .getByLabel("Street / building", { exact: true })
    .fill("Manual draft street");
  await editor
    .getByRole("button", { name: "Back to overview", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Edit details", exact: true })
    .click();
  await expect(
    home.getByLabel("City / municipality", { exact: true }),
  ).toHaveValue("Unconfirmed place");
  await expect(
    home.getByLabel("Street / building", { exact: true }),
  ).toHaveValue("Manual draft street");
  await expect(
    editor.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await expect(
    home.getByLabel("City / municipality", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByRole("dialog", { name: "Save employee changes", exact: true }),
  ).toHaveCount(0);
  await home.getByLabel("City / municipality", { exact: true }).fill("");
  await editor
    .getByRole("button", { name: "Save", exact: true })
    .click();
  const confirm = page.getByRole("dialog", {
    name: "Save employee changes",
    exact: true,
  });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    home.getByLabel("Street / building", { exact: true }),
  ).toHaveValue("Manual draft street");
});
test("assigning a parent group controls creation and overview placement", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#fields");
  await page
    .getByRole("button", {
      name: "Edit group Additional information",
      exact: true,
    })
    .click();
  const group = page.getByRole("dialog", { name: "Field group", exact: true });
  await group
    .getByRole("button", { name: "Parent group", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Parent group options", exact: true })
    .getByRole("option", { name: "Employment Details", exact: true })
    .click();
  await group.getByRole("button", { name: "Save group", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Save field group", exact: true })
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await page.goto("/#employees");
  await page.getByRole("button", { name: "Add employee", exact: true }).click();
  const form = page.getByRole("dialog", { name: "New employee", exact: true });
  await expect(form.getByRole("tab")).toHaveText([
    "Personal Information",
    "Employment Details",
  ]);
  await form
    .getByRole("tab", { name: "Employment Details", exact: true })
    .click();
  await expect(
    form.getByRole("group", {
      name: "Employment Details / Additional information",
      exact: true,
    }),
  ).toBeVisible();
  await form.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "EMP-0000002", exact: true }).click();
  const profile = page.getByRole("dialog", {
    name: "Employee profile",
    exact: true,
  });
  const additional = profile.getByRole("region", {
    name: "Additional information",
    exact: true,
  });
  await expect(
    additional.getByRole("heading", {
      level: 4,
      name: "Additional information",
      exact: true,
    }),
  ).toBeVisible();
  await profile
    .getByRole("button", { name: "Edit Additional information", exact: true })
    .click();
  await expect(
    profile.getByLabel("Example Field 1", { exact: true }),
  ).toBeVisible();
  await expect(
    profile.getByLabel("Department", { exact: true }),
  ).not.toBeVisible();
});
