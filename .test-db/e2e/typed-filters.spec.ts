import { test, expect, type Page } from "@playwright/test";
async function enter(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#fields");
}
async function createField(
  page: Page,
  label: string,
  key: string,
  type: string,
  choices?: string,
) {
  await page.getByRole("button", { name: "New field", exact: true }).click();
  const d = page.getByRole("dialog", {
    name: "Create field definition",
    exact: true,
  });
  await d.getByLabel("Label", { exact: true }).fill(label);
  await d.getByLabel("Immutable machine key").fill(key);
  await d.getByRole("button", { name: "Field type", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Field type options" })
    .getByRole("option", { name: type, exact: true })
    .click();
  if (choices)
    await d.getByLabel("Dropdown choices (one per line)").fill(choices);
  await d.getByRole("button", { name: "Save definition", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Save field definition", exact: true })
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await expect(d).toHaveCount(0);
}
for (const width of [320, 1366])
  test(`client defaults keep typed values and direct filters stay bounded at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 740 });
    await enter(page);
    await createField(page, "Workload score", "workload_score", "Number");
    await createField(
      page,
      "Work arrangement",
      "work_arrangement",
      "select",
      "Onsite\nRemote",
    );
    await page.goto("/#employees");
    await page
      .getByRole("button", { name: "Configure client filters and defaults" })
      .click();
    const editor = page.getByRole("dialog", {
      name: "Client entry settings",
      exact: true,
    });
    await editor
      .getByRole("button", { name: "Client settings scope", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Client settings scope options" })
      .getByRole("option")
      .first()
      .click();
    for (const label of ["Client default fields", "Direct filter columns"]) {
      await editor.getByRole("button", { name: label, exact: true }).click();
      const picker = page.getByRole("dialog", {
        name: `${label} options`,
        exact: true,
      });
      await picker.getByRole("combobox").fill("Work");
      await picker.getByRole("option", { name: /Workload score/ }).click();
      await picker.getByRole("option", { name: /Work arrangement/ }).click();
      const bounds = (await picker.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      await picker.getByRole("button", { name: "Apply", exact: true }).click();
    }
    await editor
      .getByRole("textbox", { name: "Workload score", exact: true })
      .fill("1234.5");
    await editor
      .getByRole("button", { name: "Work arrangement", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Work arrangement options", exact: true })
      .getByRole("option", { name: "Remote", exact: true })
      .click();
    await expect(
      editor.getByRole("textbox", { name: "Workload score", exact: true }),
    ).toHaveValue("1,234.50");
    await editor
      .getByRole("button", { name: "Save client settings", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Save client entry settings", exact: true })
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    await page
      .getByRole("button", { name: "Configure client filters and defaults" })
      .click();
    await editor
      .getByRole("button", { name: "Client settings scope", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Client settings scope options" })
      .getByRole("option")
      .first()
      .click();
    await expect(
      editor.getByRole("textbox", { name: "Workload score", exact: true }),
    ).toHaveValue("1,234.50");
    await expect(
      editor.getByRole("button", { name: "Work arrangement", exact: true }),
    ).toContainText("Remote");
  });

test("matching active definitions offer reuse without creating a duplicate or losing draft on cancellation", async ({
  page,
}) => {
  await enter(page);
  await page.getByRole("button", { name: "New field", exact: true }).click();
  const d = page.getByRole("dialog", {
    name: "Create field definition",
    exact: true,
  });
  await d.getByLabel("Label", { exact: true }).fill("  EMAIL  ");
  await d.getByLabel("Immutable machine key").fill("another_email");
  await expect(
    d.getByRole("status", { name: "Matching field definition" }),
  ).toContainText("already exists");
  await expect(
    d.getByRole("button", { name: "Save definition" }),
  ).toBeDisabled();
  await d.getByRole("button", { name: "Reuse / expand applicability" }).click();
  await page
    .getByRole("button", { name: "Continue editing", exact: true })
    .click();
  await expect(d.getByLabel("Immutable machine key")).toHaveValue(
    "another_email",
  );
  await d.getByRole("button", { name: "Reuse / expand applicability" }).click();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  const existing = page.getByRole("dialog", {
    name: "Edit field definition",
    exact: true,
  });
  await expect(existing.getByLabel("Immutable machine key")).toHaveValue(
    "email",
  );
  await expect(existing.getByLabel("Immutable machine key")).toBeDisabled();
});

test("an inactive matching field reactivates its existing identity through confirmed save", async ({
  page,
}) => {
  await enter(page);
  await createField(page, "Archived example", "archived_example", "short text");
  await page
    .getByRole("button", { name: "Edit field Archived example", exact: true })
    .click();
  let d = page.getByRole("dialog", {
    name: "Edit field definition",
    exact: true,
  });
  await d.getByLabel("Active", { exact: true }).uncheck();
  await d.getByRole("button", { name: "Save definition", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Save field definition", exact: true })
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await expect(d).toHaveCount(0);
  await page.getByRole("button", { name: "New field", exact: true }).click();
  d = page.getByRole("dialog", {
    name: "Create field definition",
    exact: true,
  });
  await d.getByLabel("Label", { exact: true }).fill(" archived   EXAMPLE ");
  await d.getByLabel("Immutable machine key").fill("replacement_example");
  await d.getByRole("button", { name: "Reactivate existing field" }).click();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  d = page.getByRole("dialog", { name: "Edit field definition", exact: true });
  await expect(d.getByLabel("Active", { exact: true })).toBeChecked();
  await expect(d.getByLabel("Immutable machine key")).toHaveValue(
    "archived_example",
  );
  await d.getByRole("button", { name: "Save definition", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Save field definition", exact: true })
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await expect(d).toHaveCount(0);
  const row = page.getByRole("row").filter({ hasText: "archived_example" });
  await expect(row.getByText("Active", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Edit field Archived example",
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(
    page.getByText("replacement_example", { exact: true }),
  ).toHaveCount(0);
});
