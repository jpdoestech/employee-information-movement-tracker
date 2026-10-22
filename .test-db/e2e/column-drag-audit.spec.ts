import { test, expect } from "@playwright/test";

for (const width of [375, 1366]) {
  test(`bulk column drag preserves order, cancellation and saved pins at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    await page
      .getByRole("button", { name: "Customize Columns", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Customize Columns",
      exact: true,
    });
    await expect(
      dialog.getByRole("tab", { name: "Column order", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(dialog.getByLabel("Live column preview")).toHaveCount(0);
    await dialog
      .getByRole("checkbox", {
        name: "Select Employee Name to move",
        exact: true,
      })
      .check();
    await dialog
      .getByRole("checkbox", {
        name: "Select ID to move",
        exact: true,
      })
      .check();
    const list = dialog.locator(".column-list");
    await list.evaluate((el) => {
      el.scrollTop = 0;
    });
    const handle = dialog.getByRole("button", {
      name: "Drag name",
      exact: true,
    });
    await handle.scrollIntoViewIfNeeded();
    const source = (await handle.boundingBox())!;
    const target = (await dialog
      .locator('[data-column-key="employee_number"]')
      .boundingBox())!;
    await page.mouse.move(
      source.x + source.width / 2,
      source.y + source.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + 5, {
      steps: 10,
    });
    await expect(
      dialog.locator('[data-column-key="employee_number"]'),
    ).toHaveClass(/column-drop-before/);
    await page.mouse.up();
    await expect(list.locator("li").nth(0)).toHaveAttribute(
      "data-column-key",
      "name",
    );
    await expect(list.locator("li").nth(1)).toHaveAttribute(
      "data-column-key",
      "client_employee_number",
    );
    await expect(
      dialog.getByRole("button", {
        name: "Move selected columns up",
        exact: true,
      }),
    ).toBeDisabled();
    const original = await list
      .locator("li")
      .evaluateAll((items) =>
        items.map((el) => (el as HTMLElement).dataset.columnKey),
      );
    const current = (await handle.boundingBox())!;
    await page.mouse.move(current.x + 10, current.y + 10);
    await page.mouse.down();
    await page.mouse.move(current.x + 20, current.y + 25, { steps: 4 });
    await expect(dialog.locator(".column-dragging")).toHaveCount(2);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(dialog).toBeVisible();
    expect(
      await list
        .locator("li")
        .evaluateAll((items) =>
          items.map((el) => (el as HTMLElement).dataset.columnKey),
        ),
    ).toEqual(original);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Discard unsaved changes?", exact: true })
      .getByRole("button", { name: "Continue editing", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Apply & Save", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Save personal view", exact: true })
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page
        .getByLabel("Scrollable employee table")
        .locator("thead th:not(.row-ordinal):not(.selection)")
        .first(),
    ).toContainText("Employee Name");
    await page
      .getByRole("button", { name: "Customize Columns", exact: true })
      .click();
    await expect(dialog.locator(".column-list li").first()).toHaveAttribute(
      "data-column-key",
      "name",
    );
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await dialog.screenshot({
      path: `.test-db/reports/verification/column-drag-${width}.png`,
    });
  });

  test(`audit shows actual name before/after values at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
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
    await editor
      .getByRole("button", { name: "Edit details", exact: true })
      .click();
    await editor.getByLabel("Last Name", { exact: true }).fill("TEST");
    await editor.getByLabel("First Name", { exact: true }).fill("JUAN");
    await editor
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Save employee changes", exact: true })
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    await page
      .getByRole("button", { name: "EMP-0000002", exact: true })
      .click();
    await editor
      .getByRole("button", { name: "Edit details", exact: true })
      .click();
    await editor.getByLabel("First Name", { exact: true }).fill("JUANA");
    await editor
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Save employee changes", exact: true })
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    await page.goto("/#audit");
    await page.getByRole("searchbox", { name: "Search audit" }).fill("JUANA");
    const records = page.getByRole("region", { name: "Audit records" });
    await expect(records.locator("tbody tr")).toHaveCount(1);
    await expect(
      records.getByRole("columnheader", { name: "From", exact: true }),
    ).toHaveCount(1);
    await expect(
      records.getByRole("columnheader", { name: "To", exact: true }),
    ).toHaveCount(1);
    await expect(records.locator("tbody td").nth(3)).toContainText(
      "First Name: JUAN",
    );
    await expect(records.locator("tbody td").nth(3)).not.toContainText("JUANA");
    await expect(records.locator("tbody td").nth(4)).toContainText(
      "First Name: JUANA",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.test-db/reports/verification/audit-values-${width}.png`,
    });
  });
}
