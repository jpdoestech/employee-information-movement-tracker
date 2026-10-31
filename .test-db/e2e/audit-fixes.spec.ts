import { test, expect, type Page } from "@playwright/test";

async function enter(page: Page, destination = "employees") {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto(`/#${destination}`);
}

test("background refresh preserves the draft revision until explicit conflict reload", async ({
  page,
}) => {
  await enter(page);
  await page.getByRole("button", { name: "EMP-0000002", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "Employee profile",
    exact: true,
  });
  await editor
    .getByRole("button", { name: "Edit details", exact: true })
    .click();
  await editor
    .getByLabel("Email", { exact: true })
    .fill("draft-a@example.invalid");
  await page.evaluate(async () => {
    const path = "/src/demo.ts",
      d = await import(path);
    const e = (await d.demoQuery("employee", { id: "demo-2" })).employee;
    await d.demoMutate("employee_update", {
      id: e.id,
      expected_version: e.row_version,
      values: { email: "saved-b@example.invalid", phone: "09987654321" },
    });
    // The same context refresh also runs on focus and the polling interval.
    (
      document.querySelector(
        '[aria-label="Refresh authorized data"]',
      ) as HTMLButtonElement
    ).click();
  });
  await expect(editor.getByLabel("Mobile", { exact: true })).toHaveValue(
    "0998-765-4321",
  );
  const save = async () => {
    await editor
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Save employee changes", exact: true })
      .getByRole("button", { name: "Continue", exact: true })
      .click();
  };
  await save();
  await expect(
    editor.getByText("Revision conflict: reload before reapplying your draft", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(editor.getByLabel("Email", { exact: true })).toHaveValue(
    "draft-a@example.invalid",
  );
  expect(
    await page.evaluate(async () => {
      const path = "/src/demo.ts",
        d = await import(path);
      return (await d.demoQuery("employee", { id: "demo-2" })).employee.values
        .email;
    }),
  ).toBe("saved-b@example.invalid");
  await editor
    .getByRole("button", {
      name: "Reload authorized server values; retain draft",
    })
    .click();
  await save();
  await expect(editor).toHaveCount(0);
});

test("all matching selections keep pagination and survive page navigation", async ({
  page,
}) => {
  await enter(page);
  const table = page.getByLabel("Scrollable employee table");
  await expect(table.locator("tbody tr")).toHaveCount(25);
  await table.locator('tbody input[type="checkbox"]').first().check();
  await page
    .getByRole("button", { name: "Select all 34 matching", exact: true })
    .click();
  await expect(page.locator(".selection-count")).toHaveText("34 selected");
  await expect(table.locator("tbody tr")).toHaveCount(25);
  await expect(page.locator(".pagination")).toContainText("1–25 of 34");
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(table.locator("tbody tr")).toHaveCount(9);
  await expect(page.locator(".selection-count")).toHaveText("34 selected");
  await page
    .getByRole("checkbox", { name: "Select visible employees", exact: true })
    .uncheck();
  await expect(page.locator(".selection-count")).toHaveText("25 selected");
  await page.getByRole("button", { name: "Bulk update", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Bulk update employees" }),
  ).toContainText("25 selected employees");
});

test("organization matches beyond the first page remain selectable with bounded results", async ({
  page,
}) => {
  await enter(page);
  await page.evaluate(async () => {
    const path = "/src/demo.ts",
      d = await import(path);
    for (let i = 0; i < 105; i++)
      await d.demoMutate("organization", {
        kind: "branch",
        code: `AUD${i}`,
        name: `ZZ Audit Branch ${String(i).padStart(3, "0")}`,
        active: true,
      });
  });
  await page.getByRole("button", { name: "Refresh authorized data" }).click();
  await page.getByRole("button", { name: "Branches", exact: true }).click();
  const picker = page.getByRole("dialog", {
    name: "Branches options",
    exact: true,
  });
  await expect(picker.getByRole("option")).toHaveCount(100);
  await picker.getByRole("combobox").fill("ZZ Audit Branch 104");
  await picker.getByRole("option", { name: "ZZ Audit Branch 104" }).click();
  await picker.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Branches", exact: true }),
  ).toContainText("ZZ Audit Branch 104");
  await page.getByRole("button", { name: "Add employee", exact: true }).click();
  await page
    .getByRole("button", { name: "Initial organization", exact: true })
    .click();
  const initial = page.getByRole("dialog", {
    name: "Initial organization options",
    exact: true,
  });
  await initial.getByRole("combobox").fill("ZZ Audit Branch 104");
  await expect(
    initial.getByRole("option", { name: "ZZ Audit Branch 104" }),
  ).toBeVisible();
});

test("sync status refreshes after manual refresh and polling without a data revision", async ({
  page,
}) => {
  await page.clock.install();
  await page.route("**/src/demo.ts", async (route) => {
    const response = await route.fetch(),
      source = await response.text();
    const modified = source.replace(
      'if (op === "sync") return { workbooks: [], pending: 0, connected: false };',
      'if (op === "sync") return globalThis.__auditSync || { workbooks: [], pending: 0, connected: false };',
    );
    expect(modified).not.toBe(source);
    await route.fulfill({ response, body: modified });
  });
  await enter(page, "sync");
  await expect(
    page.getByText("Google account not connected", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    (window as any).__auditSync = {
      connected: true,
      pending: 0,
      workbooks: [
        { id: "test", branch_id: "north", status: "Synced", approved: true },
      ],
    };
  });
  await page.getByRole("button", { name: "Refresh authorized data" }).click();
  await expect(
    page.getByText("Google connection configured", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Synced", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    (window as any).__auditSync.workbooks[0].status = "Failed";
  });
  await page.clock.fastForward(31000);
  await expect(page.getByText("Failed", { exact: true })).toBeVisible();
});

for (const [width, height] of [
  [1366, 768],
  [375, 812],
  [768, 1024],
  [812, 375],
]) {
  test(`dashboard summaries and Head Office picker remain usable at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await enter(page, "dashboard");
    await expect(
      page.getByLabel("Scrollable employee table").locator("tbody tr"),
    ).toHaveCount(0);
    await page.goto("/#employees");
    await page
      .getByRole("button", { name: "Add employee", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Initial organization", exact: true })
      .click();
    const picker = page.getByRole("dialog", {
      name: "Initial organization options",
      exact: true,
    });
    await expect(
      picker.getByRole("option", { name: "Head Office" }),
    ).toBeVisible();
    const bounds = await picker.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height + 1);
    await picker.getByRole("combobox").fill("Head Office");
    await picker.getByRole("combobox").press("Enter");
    await expect(
      page.getByRole("button", { name: "Initial organization", exact: true }),
    ).toContainText("Head Office");
  });
}
