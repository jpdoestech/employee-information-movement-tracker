import { expect, test } from "@playwright/test";

test("register changes managed columns with branch/client filters", async ({
  page,
}) => {
  const config = (columns: string[]) => ({
    columns,
    pinned: [],
    showRowNumbers: true,
  });
  await page.addInitScript(
    (rules) =>
      localStorage.setItem(
        "eimt-synthetic-managed-views",
        JSON.stringify(rules),
      ),
    [
      {
        id: "global",
        name: "Everyone",
        user_id: null,
        scope_type: "all",
        scope_id: null,
        config: config(["employee_number", "name"]),
      },
      {
        id: "branch",
        name: "North register",
        user_id: null,
        scope_type: "branch",
        scope_id: "north",
        config: config(["name"]),
      },
      {
        id: "client",
        name: "Client register",
        user_id: null,
        scope_type: "client",
        scope_id: "client-n",
        config: config(["position"]),
      },
    ],
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#employees");
  await expect(
    page.locator(".managed-view-source[title^='Managed: Everyone.']"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Branches", exact: true }).click();
  await page
    .getByRole("option", { name: "Example North Branch Branch", exact: true })
    .click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(
    page.locator(".managed-view-source[title^='Managed: North register.']"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clients", exact: true }).click();
  await page.getByRole("option", { name: /^Example Client / }).click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(
    page.locator(".managed-view-source[title^='Managed: Client register.']"),
  ).toBeVisible();
  await expect(
    page
      .locator(".table-region")
      .getByRole("columnheader", { name: "Position", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".table-region")
      .getByRole("columnheader", { name: "Employee Name", exact: true }),
  ).toHaveCount(0);
});

for (const size of [
  { width: 1366, height: 768 },
  { width: 375, height: 740 },
  { width: 768, height: 1024 },
  { width: 812, height: 375 },
]) {
  test(`managed column views override personal settings and preserve cancellation at ${size.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#permissions");
    await page
      .getByRole("button", { name: "Register settings", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Add column view", exact: true })
      .click();
    const editor = page.getByRole("dialog", {
      name: "Managed column view",
      exact: true,
    });
    await expect(editor).toBeVisible();
    await expect(editor.locator(".column-list li")).toHaveCount(10);
    await editor.getByRole("button", { name: "Accounts", exact: true }).click();
    await page
      .getByRole("option", { name: "Demo Administrator", exact: true })
      .click();
    await editor.getByRole("button", { name: "Cancel", exact: true }).click();
    const discard = page.getByRole("dialog", {
      name: "Discard unsaved changes?",
      exact: true,
    });
    await expect(discard).toBeVisible();
    await discard
      .getByRole("button", { name: "Continue editing", exact: true })
      .click();
    await expect(
      editor.getByRole("button", { name: "Accounts", exact: true }),
    ).toContainText("Demo Administrator");
    await editor.getByRole("button", { name: "Accounts", exact: true }).click();
    await page
      .getByRole("option", { name: "All accounts", exact: true })
      .click();
    await editor
      .getByRole("tab", { name: "View settings", exact: true })
      .click();
    await editor
      .getByLabel("Saved view name", { exact: true })
      .fill("Standard employee view");
    await editor
      .getByRole("button", { name: "Apply & Save", exact: true })
      .click();
    const confirm = page.getByRole("dialog", {
      name: "Save managed column view",
      exact: true,
    });
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(editor).toBeVisible();
    await editor
      .getByRole("button", { name: "Apply & Save", exact: true })
      .click();
    await confirm
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    await expect(
      page
        .getByRole("region", { name: "Managed column view rules" })
        .getByRole("rowheader", {
          name: "Standard employee view",
          exact: true,
        }),
    ).toBeVisible();
    await page.screenshot({
      path: `.test-db/reports/release/managed-views-${size.width}.png`,
    });
    await page.goto("/#employees");
    await expect(
      page.locator(
        ".managed-view-source[title^='Managed: Standard employee view.']",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Customize Columns", exact: true }),
    ).toBeEnabled();
    const keys = await page.locator(".table-region thead th").allTextContents();
    expect(keys.join(" ")).toContain("Date Hired");
    expect(keys.join(" ")).toContain("Gender");
    await page.reload();
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    await expect(
      page.getByRole("button", { name: "Customize Columns", exact: true }),
    ).toBeEnabled();
    await page.goto("/#permissions");
    await page
      .getByRole("button", { name: "Register settings", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Remove column view Standard employee view",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog", { name: "Save managed column view", exact: true })
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await page.goto("/#employees");
    await expect(
      page.getByRole("button", { name: "Customize Columns", exact: true }),
    ).toBeEnabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  });
}
