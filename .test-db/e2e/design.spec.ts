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
      .getByRole("option", { name: "Separated", exact: true })
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

for (const [width, height, font] of [
  [375, 812, ""],
  [1440, 900, ""],
  [812, 375, ""],
  [375, 812, "Verdana"],
] as const) {
  test(`direct branch picker is bounded, searchable and preserves draft cancellation at ${width}x${height}${font ? ` with ${font}` : ""}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    if (font)
      await page.addStyleTag({ content: `:root { --font-sans: ${font}; }` });
    const table = page.getByLabel("Scrollable employee table");
    await expect(table.locator("tbody tr").first()).toBeVisible();
    const before = await table.boundingBox();
    const trigger = page.getByRole("button", { name: "Branches", exact: true });
    await trigger.click();
    const picker = page.getByRole("dialog", {
      name: "Branches options",
      exact: true,
    });
    await expect(picker.getByRole("combobox")).toBeFocused();
    await picker.getByRole("combobox").fill("North");
    await picker.getByRole("option", { name: /North/ }).click();
    await picker.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Clear Branches", exact: true }),
    ).toHaveCount(0);
    await trigger.click();
    await picker.getByRole("combobox").fill("North");
    await picker.getByRole("option", { name: /North/ }).click();
    const bounds = (await picker.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
    await picker.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(trigger).toContainText("North");
    expect(await table.boundingBox()).toEqual(before);
    await trigger.click();
    await picker.press("Escape");
    await expect(trigger).toBeFocused();
    await page
      .getByRole("button", { name: "Clear Branches", exact: true })
      .click();
    await expect(trigger).toHaveText("Branches");
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
        await page.getByRole("button", { name: "Close navigation" }).click();
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
    const table = page.getByLabel("Scrollable employee table");
    await expect(table).toBeVisible();
    expect((await table.boundingBox())!.y).toBeLessThan(280);
    const row = (await page.locator(".filterbar").boundingBox())!;
    for (const name of [
      "Branches",
      "Clients",
      "Status",
      "Saved view",
      "Configure client filters and defaults",
      "Reset filters",
      "Customize Columns",
      "Export CSV",
      "Add employee",
    ]) {
      const bounds = (await page
        .getByRole("button", { name, exact: true })
        .boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(row.y);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(row.y + row.height);
      expect(
        Math.abs(bounds.y + bounds.height / 2 - row.y - row.height / 2),
      ).toBeLessThanOrEqual(5);
    }
    const before = await table.boundingBox();
    await page
      .getByRole("button", { name: "Configure client filters and defaults" })
      .click();
    const settings = page.getByRole("dialog", {
      name: "Client entry settings",
      exact: true,
    });
    await expect(settings).toBeVisible();
    expect(await table.boundingBox()).toEqual(before);
    await settings.getByRole("button", { name: "Close dialog" }).click();
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
  test(`employee validation errors float without moving data at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    const table = page.getByLabel("Scrollable employee table");
    const before = await table.boundingBox();
    const trigger = page.getByRole("button", {
      name: "EMP-0000002",
      exact: true,
    });
    await trigger.click();
    const editor = page.getByRole("dialog", {
      name: "Employee profile",
      exact: true,
    });
    await editor
      .getByRole("button", { name: "Edit details", exact: true })
      .click();
    await editor
      .getByRole("textbox", { name: "Mobile", exact: true })
      .fill("bad");
    await editor
      .getByRole("button", { name: "Save to Supabase", exact: true })
      .click();
    const error = editor.locator(".floating-notification.error");
    await expect(error).toContainText("09");
    expect(await error.evaluate((el) => getComputedStyle(el).position)).toBe(
      "fixed",
    );
    const errorBounds = (await error.boundingBox())!;
    expect(errorBounds.x).toBeGreaterThanOrEqual(0);
    expect(errorBounds.x + errorBounds.width).toBeLessThanOrEqual(width);
    expect(await table.boundingBox()).toEqual(before);
    await error.getByRole("button", { name: "Dismiss error" }).click();
    await editor.getByRole("button", { name: "Close dialog" }).click();
    await page
      .getByRole("dialog", { name: "Discard unsaved changes?" })
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
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
    await editor
      .getByRole("button", { name: "Edit details", exact: true })
      .click();
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
    await editor
      .getByRole("button", { name: "Edit details", exact: true })
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
    await dialog
      .getByRole("tab", { name: "View settings", exact: true })
      .click();
    await expect(
      dialog.getByLabel("Saved view name", { exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole("tab", { name: "Column order", exact: true })
      .click();
    await expect(
      dialog.getByRole("heading", { name: "Live preview", exact: true }),
    ).toHaveCount(0);
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    const order = (await dialog.locator(".column-order").boundingBox())!;
    expect(order.width).toBeGreaterThan(200);
    await dialog
      .getByRole("checkbox", { name: "Select System ID to move", exact: true })
      .check();
    await expect(
      dialog.getByRole("button", {
        name: "Move selected columns up",
        exact: true,
      }),
    ).toBeDisabled();
    await dialog
      .getByRole("button", { name: "Move selected columns down", exact: true })
      .click();
    await expect(dialog.locator(".column-list li").first()).toContainText(
      "Employee Name",
    );
    await expect(
      dialog.getByRole("button", { name: "Pin employee_number", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await dialog
      .getByRole("button", { name: "Pin employee_number", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Pin employee_number", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
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
