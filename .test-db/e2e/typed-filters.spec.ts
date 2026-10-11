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
  test(`typed column filters use bounded native values at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 740 });
    await enter(page);
    await createField(page, "Workload score", "workload_score", "decimal");
    await createField(
      page,
      "Work arrangement",
      "work_arrangement",
      "select",
      "Onsite\nRemote",
    );
    await page.goto("/#employees");
    await page
      .getByRole("button", { name: "More filters", exact: true })
      .click();
    const editor = page.getByRole("dialog", {
      name: "More filters",
      exact: true,
    });
    async function chooseColumn(label: string) {
      await editor
        .getByRole("button", { name: "Filter column", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Filter column options" })
        .getByRole("option", { name: new RegExp(label) })
        .click();
    }
    await chooseColumn("Workload score");
    await editor.getByRole("button", { name: "Operator", exact: true }).click();
    const operators = page.getByRole("dialog", { name: "Operator options" });
    await expect(
      operators.getByRole("option", { name: "Contains", exact: true }),
    ).toHaveCount(0);
    await operators
      .getByRole("option", { name: "Between", exact: true })
      .click();
    await editor.getByLabel("Range start").fill("20");
    await editor.getByLabel("Range end").fill("10");
    await editor
      .getByRole("button", { name: "Add filter", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "range start must not exceed",
    );
    await page
      .getByRole("button", { name: "Dismiss error", exact: true })
      .click();
    await editor.getByLabel("Range end").fill("30");
    await editor
      .getByRole("button", { name: "Add filter", exact: true })
      .click();
    await expect(
      editor.getByRole("button", { name: "Remove Workload score filter" }),
    ).toBeVisible();
    await chooseColumn("Work arrangement");
    await editor.getByRole("button", { name: "Operator", exact: true }).click();
    await operators
      .getByRole("option", { name: "Is any of", exact: true })
      .click();
    await editor
      .getByRole("button", { name: "Column filter value", exact: true })
      .click();
    const values = page.getByRole("dialog", {
      name: "Column filter value options",
    });
    await values.getByRole("option", { name: "Onsite", exact: true }).click();
    await values.getByRole("option", { name: "Remote", exact: true }).click();
    await values.getByRole("button", { name: "Apply", exact: true }).click();
    await editor
      .getByRole("button", { name: "Add filter", exact: true })
      .click();
    await expect(
      editor.getByRole("button", { name: "Remove Work arrangement filter" }),
    ).toBeVisible();
    expect(
      await editor.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    ).toBe(true);
    await expect(
      page.getByRole("status", { name: "Loading authorized data…" }),
    ).toHaveCount(0);
    const saved = page.getByRole("button", {
      name: "Dismiss notice",
      exact: true,
    });
    if (await saved.isVisible()) await saved.click();
    const columnTrigger = editor.getByRole("button", {
      name: "Filter column",
      exact: true,
    });
    expect((await columnTrigger.boundingBox())!.height).toBeLessThanOrEqual(
      width === 320 ? 48 : 40,
    );
    await page.screenshot({
      path: `.test-db/results/typed-filters-${width}.png`,
    });
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
