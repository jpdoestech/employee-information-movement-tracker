import { test, expect } from "@playwright/test";

const routes = [
  ["dashboard", "Overview"],
  ["employees", "Employees"],
  ["movements", "Movements"],
  ["organization", "Organization"],
  ["fields", "Field Builder"],
  ["permissions", "Permissions"],
  ["sync", "Sheets sync"],
  ["audit", "Audit history"],
];

for (const width of [375, 1440]) {
  test(`short filter footer stays compact and cancellation retains selection at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    if (width < 760)
      await page
        .getByRole("button", { name: "More filters", exact: true })
        .click();
    await page.getByRole("button", { name: "Status", exact: true }).click();
    const picker = page.getByRole("dialog", {
      name: "Status options",
      exact: true,
    });
    await picker.getByRole("option", { name: "Inactive", exact: true }).click();
    await picker.getByRole("button", { name: "Apply", exact: true }).click();
    await page.getByRole("button", { name: "Status", exact: true }).click();
    await picker.getByRole("option", { name: "Inactive", exact: true }).click();
    await picker
      .getByRole("option", { name: "Terminated", exact: true })
      .click();
    await expect(
      picker.getByRole("button", { name: "Select visible", exact: true }),
    ).toHaveCount(0);
    expect(
      (await picker.locator(".picker-actions").boundingBox())!.height,
    ).toBeLessThanOrEqual(62);
    const cancel = (await picker
      .getByRole("button", { name: "Cancel", exact: true })
      .boundingBox())!;
    const apply = (await picker
      .getByRole("button", { name: "Apply", exact: true })
      .boundingBox())!;
    expect(cancel.y).toEqual(apply.y);
    await page.screenshot({
      path: `.test-db/reports/screenshots/status-filter-${width}.png`,
    });
    await picker.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Status", exact: true }),
    ).toContainText("Inactive");
  });
}

for (const [width, height] of [
  [375, 812],
  [1440, 900],
  [812, 375],
]) {
  test(`More Filters uses one bounded surface at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    const table = page.getByLabel("Scrollable employee table");
    await expect(table.locator("tbody tr").first()).toBeVisible();
    const before = await table.boundingBox();
    await page
      .getByRole("button", { name: "More filters", exact: true })
      .click();
    const editor = page.getByRole("dialog", {
      name: "More filters",
      exact: true,
    });
    await page.screenshot({
      path: `.test-db/reports/screenshots/more-filters-${width}-${height}.png`,
    });
    await editor.getByRole("button", { name: "Branches", exact: true }).click();
    const picker = editor.getByRole("dialog", { name: "Branches options" });
    await expect(picker.getByRole("combobox")).toBeFocused();
    await picker.getByRole("option", { name: /North/ }).click();
    await editor.getByRole("button", { name: "Back to filters" }).click();
    await expect(
      editor.getByRole("button", { name: "Clear Branches" }),
    ).toHaveCount(0);
    await expect(
      editor.getByRole("button", { name: "Branches", exact: true }),
    ).toBeFocused();
    await editor
      .getByRole("button", { name: "Filter column", exact: true })
      .click();
    const columns = editor.getByRole("dialog", {
      name: "Filter column options",
    });
    await expect(columns.getByRole("option").first()).toBeVisible();
    const outer = (await editor.boundingBox())!,
      inner = (await columns.boundingBox())!;
    expect(inner.x).toBeGreaterThanOrEqual(outer.x);
    expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
    expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
    expect(outer.y + outer.height).toBeLessThanOrEqual(height);
    await page.screenshot({
      path: `.test-db/reports/screenshots/filter-columns-${width}-${height}.png`,
    });
    await columns.getByRole("combobox").press("Shift+Tab");
    await expect(
      editor.getByRole("button", { name: "Close More filters" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(columns.getByRole("combobox")).toBeFocused();
    await columns.getByRole("combobox").fill("Employee Name");
    await columns.getByRole("combobox").press("Enter");
    await expect(
      editor.getByRole("button", { name: "Filter column", exact: true }),
    ).toContainText("Employee Name");
    expect(await table.boundingBox()).toEqual(before);
    await editor.press("Escape");
    await expect(editor).toHaveCount(0);
  });
}

for (const width of [375, 1440]) {
  test(`all workspace screens fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    for (const [route, title] of routes) {
      await page.goto(`/#${route}`);
      await expect(
        page.getByRole("heading", { name: title, exact: true }).first(),
      ).toBeVisible();
      await expect(page.locator(".loading-line")).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      if (width < 760)
        await page.getByRole("button", { name: "Open navigation" }).click();
      const active = page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: title, exact: true });
      await expect(active).toHaveAttribute("aria-current", "page");
      await expect(active).toBeVisible();
      if (width < 760)
        await page
          .getByRole("button", { name: "Close navigation" })
          .click({ position: { x: width - 12, y: 12 } });
      if (["dashboard", "employees", "permissions"].includes(route))
        await page.screenshot({
          path: `.test-db/reports/screenshots/${route}-${width}.png`,
          fullPage: true,
        });
    }
  });
}

test("navy and gray theme maintains readable text and keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/");
  await page.screenshot({
    path: ".test-db/reports/screenshots/login-1440.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await expect(page.locator(".stat strong").first()).not.toHaveText("—");
  const ratios = await page.evaluate(() => {
    const rgb = (value: string) =>
      value
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number);
    const lum = (value: string) =>
      rgb(value)
        .map((v) => {
          const n = v / 255;
          return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
        })
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    return [
      ".sidebar nav a.active",
      ".sidebar nav a:not(.active)",
      ".brand small",
      ".environment-badge",
      ".stat small",
      ".breadcrumb",
    ].map((selector) => {
      const el = document.querySelector(selector)!;
      let ancestor: Element | null = el;
      while (
        ancestor &&
        getComputedStyle(ancestor).backgroundColor === "rgba(0, 0, 0, 0)"
      )
        ancestor = ancestor.parentElement;
      const fg = lum(getComputedStyle(el).color),
        bg = lum(getComputedStyle(ancestor!).backgroundColor);
      return {
        selector,
        ratio: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
      };
    });
  });
  for (const { selector, ratio } of ratios)
    expect(ratio, selector).toBeGreaterThanOrEqual(4.5);
  const active = page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Overview", exact: true });
  await active.focus();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(
      () => getComputedStyle(document.activeElement!).outlineStyle,
    ),
  ).toBe("solid");
});

for (const width of [375, 1440]) {
  test(`compact toolbars preserve filters and bound movement picker at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    await expect(
      page.getByRole("button", { name: "More filters" }),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(
      page.getByRole("button", { name: "Filter column", exact: true }),
    ).toHaveCount(0);
    const table = page.getByLabel("Scrollable employee table");
    await expect(table).toBeVisible();
    expect((await table.boundingBox())!.y).toBeLessThan(280);
    await expect(page.locator(".register-tools")).toHaveCount(0);
    const row = await page.locator(".filterbar").boundingBox();
    for (const name of [
      "Search employees",
      "Saved view",
      "More filters",
      "Reset filters",
    ]) {
      const bounds = (await page
        .getByLabel(name, { exact: true })
        .boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(row!.y);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(
        row!.y + row!.height,
      );
    }
    const tableBeforeFilters = await page
      .getByLabel("Scrollable employee table")
      .boundingBox();
    await page.getByRole("button", { name: "More filters" }).click();
    await expect(
      page.getByRole("button", { name: "Filter column", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Clear Operator", exact: true }),
    ).toHaveCount(0);
    expect(
      await page.getByLabel("Scrollable employee table").boundingBox(),
    ).toEqual(tableBeforeFilters);
    await page
      .getByRole("button", { name: "Close More filters", exact: true })
      .click();
    await page.goto("/#movements");
    const picker = page.getByRole("button", {
      name: "Movement types",
      exact: true,
    });
    await expect(picker).toBeVisible();
    expect((await picker.boundingBox())!.width).toBeLessThanOrEqual(280);
    await page.screenshot({
      path: `.test-db/reports/screenshots/movements-${width}.png`,
      fullPage: true,
    });
  });
}

test("row selection exposes bulk controls and partial selection state", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#employees");
  await expect(page.getByRole("button", { name: "Bulk update" })).toHaveCount(
    0,
  );
  await page
    .getByRole("checkbox", { name: /^Select EMP-/ })
    .first()
    .check();
  await expect(page.getByRole("button", { name: "Bulk update" })).toBeEnabled();
  await expect(
    page.getByRole("checkbox", {
      name: "Select visible employees",
      exact: true,
    }),
  ).toHaveJSProperty("indeterminate", true);
  await expect(page.locator("tbody tr[aria-selected='true']")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await expect(page.locator("tbody tr[aria-selected='true']")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bulk update" })).toHaveCount(
    0,
  );
});

for (const [width, height] of [
  [375, 812],
  [1440, 900],
  [812, 375],
]) {
  test(`only table rows scroll; pagination stays below at ${width}×${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    const table = page.getByLabel("Scrollable employee table");
    await expect(table.locator("tbody tr").first()).toBeVisible();
    const fixed = [
      page.locator(".topbar"),
      page.locator(".filterbar"),
      page.locator(".toolbar-views"),
      page.locator(".pagination"),
      page.locator(".workspace-footer"),
    ];
    const before = await Promise.all(fixed.map((el) => el.boundingBox()));
    const tableBefore = (await table.boundingBox())!;
    const nameHeader = table.getByRole("columnheader", {
      name: "Employee Name",
      exact: true,
    });
    const nameBefore = await nameHeader.boundingBox();
    expect(tableBefore.height).toBeGreaterThan(40);
    await table.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect
      .poll(() => table.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    const after = await Promise.all(fixed.map((el) => el.boundingBox()));
    for (let i = 0; i < before.length; i++)
      expect(after[i]!.y).toBeCloseTo(before[i]!.y, 1);
    expect((await nameHeader.boundingBox())!.y).toBeCloseTo(nameBefore!.y, 1);
    const pagination = after[3]!;
    expect(pagination.y).toBeCloseTo(tableBefore.y + tableBefore.height, 1);
    expect(pagination.y + pagination.height).toBeLessThanOrEqual(height);
    expect(after[4]!.y).toBeGreaterThanOrEqual(
      pagination.y + pagination.height,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight + 1,
      ),
    ).toBe(true);
    expect(await page.locator("main").evaluate((el) => el.scrollTop)).toBe(0);
    const rowsPicker = (await page
      .getByRole("combobox", { name: "Rows per page", exact: true })
      .boundingBox())!;
    expect(rowsPicker.width).toBeLessThan(110);
    await page.screenshot({
      path: `.test-db/reports/screenshots/table-scrolled-${width}-${height}.png`,
    });
  });
}

for (const width of [375, 1440]) {
  test(`column filter overlays and floating errors preserve layout at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    const table = page.getByLabel("Scrollable employee table");
    await expect(table.locator("tbody tr").first()).toBeVisible();
    const before = await table.boundingBox();
    const trigger = page.getByRole("button", {
      name: "More filters",
      exact: true,
    });
    await trigger.click();
    const editor = page.getByRole("dialog", {
      name: "More filters",
      exact: true,
    });
    const bounds = (await editor.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await editor
      .getByRole("button", { name: "Filter column", exact: true })
      .click();
    const columns = page.getByRole("dialog", {
      name: "Filter column options",
      exact: true,
    });
    await columns.getByRole("option", { name: /System ID/ }).click();
    await expect(editor).toBeVisible();
    await editor.getByRole("button", { name: "Operator", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Operator options", exact: true })
      .getByRole("option", { name: "Equals", exact: true })
      .click();
    await editor.getByLabel("Column filter value").fill("");
    await editor
      .getByRole("button", { name: "Add filter", exact: true })
      .click();
    const error = page.getByRole("alert");
    await expect(error).toContainText("Enter a filter value.");
    expect(await error.evaluate((el) => getComputedStyle(el).position)).toBe(
      "relative",
    );
    expect(
      await error.locator("..").evaluate((el) => getComputedStyle(el).position),
    ).toBe("fixed");
    expect(await table.boundingBox()).toEqual(before);
    await page
      .getByRole("button", { name: "Dismiss error", exact: true })
      .click();
    await editor.press("Escape");
    await expect(editor).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await table.boundingBox()).toEqual(before);
  });
}

for (const width of [375, 1440]) {
  test(`save and discard confirmations retain or commit drafts at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    await page
      .getByRole("button", { name: "EMP-0000001", exact: true })
      .click();
    const editor = page.getByRole("dialog", {
      name: "Employee profile",
      exact: true,
    });
    const name = editor.getByRole("textbox", { name: /^First Name$/ });
    const last = editor.getByRole("textbox", { name: /^Last Name$/ });
    await expect(name).toHaveValue("");
    await expect(
      editor.getByRole("textbox", { name: "Employee Name", exact: true }),
    ).toHaveCount(0);
    await last.fill("Reviewed");
    await name.fill("employee");
    await editor
      .getByRole("button", { name: "Save to Supabase", exact: true })
      .click();
    const confirmation = page.getByRole("dialog", {
      name: "Save employee changes",
      exact: true,
    });
    await expect(confirmation).toBeVisible();
    const box = (await confirmation.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(width - 24);
    expect(box.height).toBeLessThan(360);
    expect(box.x).toBeGreaterThanOrEqual(0);
    await confirmation
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await expect(name).toHaveValue("employee");
    await expect(
      page
        .getByLabel("Scrollable employee table")
        .getByText("Synthetic Employee 01", { exact: true }),
    ).toHaveCount(1);
    await editor.getByRole("button", { name: "Cancel", exact: true }).click();
    const discard = page.getByRole("dialog", {
      name: "Discard unsaved changes?",
      exact: true,
    });
    await expect(discard).toBeVisible();
    expect((await discard.boundingBox())!.height).toBeLessThan(360);
    await discard
      .getByRole("button", { name: "Continue editing", exact: true })
      .click();
    await expect(name).toHaveValue("employee");
    await editor
      .getByRole("button", { name: "Save to Supabase", exact: true })
      .click();
    await confirmation
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    await expect(
      page
        .getByLabel("Scrollable employee table")
        .getByText("Reviewed, employee", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "EMP-0000001", exact: true })
      .click();
    await name.fill("Discard this draft");
    await editor.getByRole("button", { name: "Cancel", exact: true }).click();
    await discard
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    await expect(
      page
        .getByLabel("Scrollable employee table")
        .getByText("Reviewed, employee", { exact: true }),
    ).toBeVisible();
  });
}

for (const width of [375, 1440]) {
  test(`column designer organizes drafts and fits at ${width}px`, async ({
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
      dialog.getByLabel("Saved view name", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Live preview", exact: true }),
    ).toBeVisible();
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    const order = (await dialog.locator(".column-order").boundingBox())!;
    const preview = (await dialog.locator(".column-preview").boundingBox())!;
    if (width > 900) expect(preview.x).toBeGreaterThan(order.x + order.width);
    else expect(preview.y).toBeGreaterThan(order.y + order.height);
    await expect(
      dialog.getByRole("button", {
        name: "Move employee_number up",
        exact: true,
      }),
    ).toBeDisabled();
    await dialog
      .getByRole("button", { name: "Move employee_number down", exact: true })
      .click();
    await expect(dialog.locator(".column-list li").first()).toContainText(
      "Employee Name",
    );
    await expect(
      dialog.getByRole("table").locator("thead th:not(.row-ordinal)").first(),
    ).toContainText("System ID");
    await dialog
      .getByRole("button", { name: "Pin employee_number", exact: true })
      .click();
    await expect(
      dialog.getByRole("table").locator("thead th:not(.row-ordinal)").first(),
    ).toContainText("Employee Name");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Discard unsaved changes?", exact: true })
      .getByRole("button", { name: "Continue editing", exact: true })
      .click();
    await expect(dialog.locator(".column-list li").first()).toContainText(
      "Employee Name",
    );
    await dialog.screenshot({
      path: `.test-db/reports/screenshots/columns-${width}.png`,
    });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Discard unsaved changes?", exact: true })
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await expect(
      page
        .getByLabel("Scrollable employee table")
        .locator("thead th:not(.row-ordinal):not(.selection)")
        .first(),
    ).toContainText("System ID");
  });
}
