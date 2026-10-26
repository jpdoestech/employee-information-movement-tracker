import { expect, test, type Page } from "@playwright/test";

for (const [width, height] of [
  [375, 740],
  [768, 1024],
  [1366, 768],
  [812, 375],
])
  test(`permission groups show form paths and save independent group IDs at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { state } = await setup(page, false, true);
    await page
      .getByRole("button", { name: "Field permissions", exact: true })
      .click();
    const parent = page.getByRole("button", {
      name: "Employment Details",
      exact: true,
    });
    const child = page.getByRole("button", {
      name: "Employment Details / Compensation",
      exact: true,
    });
    await expect(child).toBeVisible();
    const labels = await page
      .locator(".permission-group-row button")
      .allTextContents();
    expect(labels.indexOf("Employment Details")).toBeLessThan(
      labels.indexOf("Employment Details / Compensation"),
    );
    await parent.click();
    await child.click();
    const bank = page
      .getByRole("row")
      .filter({ has: page.getByLabel("Bank Name View", { exact: true }) });
    await expect(bank).toContainText("Form: Employment Details / Compensation");
    await expect(
      page.getByLabel("Daily Rate View", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Account Number View", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Employment Details View", { exact: true })
      .selectOption("deny");
    await page
      .getByLabel("Employment Details / Compensation View", { exact: true })
      .selectOption("allow");
    await expect(
      page.getByLabel("Employment Details View", { exact: true }),
    ).toHaveValue("deny");
    await page
      .getByLabel("Reason", { exact: true })
      .fill("Review distinct compensation group");
    await page.screenshot({
      path: `.test-db/reports/release/permission-group-path-${width}x${height}.png`,
    });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const confirmation = page.getByRole("dialog", {
      name: "Save access changes",
      exact: true,
    });
    await expect(confirmation).toContainText(
      "Employment Details / Compensation",
    );
    await confirmation
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    expect(state.writes).toHaveLength(0);
    await expect(
      page.getByLabel("Employment Details / Compensation View", {
        exact: true,
      }),
    ).toHaveValue("allow");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await confirmation
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect.poll(() => state.writes.length).toBe(1);
    expect(state.writes[0].p.fields).toEqual(
      expect.arrayContaining([
        {
          group_id: "employment",
          action: "R",
          effect: "deny",
          inherit_new: true,
        },
        {
          group_id: "compensation",
          action: "R",
          effect: "allow",
          inherit_new: true,
        },
      ]),
    );
    expect(state.writes[0].p.fields).toHaveLength(2);
  });

async function setup(
  page: Page,
  largeMatrix = false,
  compensationFixture = false,
) {
  await page.goto("/");
  const fixture = await page.evaluate(async () => {
    const path = "/src/demo.ts";
    const demo = await import(path);
    return {
      context: await demo.demoQuery("context"),
      config: await demo.demoQuery("access_configuration"),
    };
  });
  if (compensationFixture) {
    const base = fixture.context.fields.find((f: any) => f.key === "email");
    fixture.context.fields.push(
      {
        ...base,
        id: "fixture-bank",
        key: "bank_name",
        label: "Bank Name",
        group_id: "employment",
        form_group_id: "compensation",
      },
      {
        ...base,
        id: "fixture-account",
        key: "account_number",
        label: "Account Number",
        group_id: "compensation",
        form_group_id: "compensation",
      },
      {
        ...base,
        id: "fixture-rate",
        key: "daily_rate",
        label: "Daily Rate",
        type: "decimal",
        group_id: "compensation",
        form_group_id: "compensation",
      },
    );
  }
  if (largeMatrix)
    fixture.config.modules.push(
      ...Array.from({ length: 20 }, (_, i) => ({
        code: `example_${i}`,
        name: `Example module ${i}`,
        actions: ["view"],
      })),
    );
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "matrix@example.test",
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: "2026-01-01T00:00:00Z",
  };
  const manager = {
    id: "22222222-2222-4222-8222-222222222222",
    display_name: "Sample manager",
    role: "admin",
    active: true,
  };
  fixture.context.profile.id = user.id;
  const state = {
    writes: [] as any[],
    reviews: [] as any[],
    fail: false,
    revision: 1,
  };
  await page.route(/^https:\/\/[^/]+\.supabase\.co\//, async (route) => {
    const request = route.request(),
      body = request.method() === "POST" ? request.postDataJSON() : {};
    const path = new URL(request.url()).pathname;
    let result: any = [];
    if (path.endsWith("/user")) result = user;
    else if (path.endsWith("/register_settings"))
      result = fixture.context.register_settings;
    else if (path.endsWith("/access_configuration"))
      result = {
        ...fixture.config,
        revision: state.revision,
        today: fixture.context.today,
      };
    else if (path.endsWith("/access_change_preview")) {
      state.reviews.push(body);
      if (state.fail)
        return route.fulfill({
          status: 403,
          json: { code: "42501", message: "Access review unavailable" },
        });
      result = {
        revision: state.revision,
        today: fixture.context.today,
        changes: [],
      };
    } else if (path.endsWith("/tracker_mutate")) {
      state.writes.push(body);
      state.revision++;
      result = { saved: true };
    } else if (path.endsWith("/effective_access"))
      result = {
        ...fixture.config,
        roles: ["admin", "manager"],
        record_allowed: false,
        modules: [
          {
            module: "employees",
            action: "export",
            decision: {
              allowed: false,
              reason: "Explicit DENY overrides grants",
              sources: [
                { source: "role", role: "manager", effect: "allow" },
                { source: "direct", effect: "deny" },
              ],
            },
          },
        ],
        fields: [],
      };
    else if (body.operation === "context")
      result = { ...fixture.context, revision: state.revision };
    else if (body.operation === "security")
      result = {
        users: [
          {
            id: user.id,
            display_name: "Existing administrator",
            role: "superadmin",
            active: true,
          },
          manager,
        ],
        scopes: [],
        policies: [],
        capabilities: [],
      };
    else if (body.operation === "options")
      result = [
        {
          id: "33333333-3333-4333-8333-333333333333",
          kind: "branch",
          label: "North",
        },
      ];
    else if (body.operation === "employees") result = { items: [], total: 0 };
    else if (body.operation === "dashboard")
      result = { total: 0, statuses: {}, placements: {} };
    if (largeMatrix && path.endsWith("/effective_access")) {
      result.modules.push(
        ...Array.from({ length: 24 }, (_, i) => ({
          ...result.modules[0],
          module: `example_${i}`,
        })),
      );
      result.fields = fixture.context.fields.map((f: any) => ({
        key: f.key,
        label: f.label,
        actions: Object.fromEntries(
          ["R", "C", "U", "D"].map((a) => [
            a,
            {
              allowed: false,
              reason: "Synthetic denied field",
            },
          ]),
        ),
      }));
    }
    return route.fulfill({ json: result });
  });
  const encode = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic-signature`;
  await page.goto(
    `/#access_token=${token}&refresh_token=synthetic-refresh&expires_in=3600&token_type=bearer&type=signup`,
  );
  await page.reload();
  await expect(page.getByText("Workspace", { exact: true })).toBeAttached();
  await page.goto("/#permissions");
  await page.getByRole("button", { name: "Access rules", exact: true }).click();
  await page.getByRole("button", { name: "User", exact: true }).click();
  await page.getByRole("option", { name: /Sample manager/ }).click();
  await expect(
    page.getByLabel("Employees Export", { exact: true }),
  ).toBeVisible();
  return { state, fixture };
}

test("matrix shows applicable actions and saves multiple groups atomically after Continue", async ({
  page,
}) => {
  const { state, fixture } = await setup(page);
  await expect(
    page.getByLabel("Employees Approve", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Employees Export", { exact: true })
    .selectOption("deny");
  await page
    .getByLabel("Employees View", { exact: true })
    .selectOption("allow");
  await page.getByLabel("Employees Import", { exact: true }).selectOption("allow");
  await page
    .getByRole("button", { name: "Field permissions", exact: true })
    .click();
  const groups = fixture.context.groups
    .filter((g: any) => g.active)
    .slice(0, 2);
  for (const group of groups)
    await page
      .getByLabel(
        `${group.parent_group_id ? fixture.context.groups.find((g: any) => g.id === group.parent_group_id)?.name + " / " : ""}${group.name} View`,
        { exact: true },
      )
      .selectOption("allow");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Two groups and independent export denial");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const confirmation = page.getByRole("dialog", {
    name: "Save access changes",
    exact: true,
  });
  await expect(confirmation).toContainText("3 module changes");
  await expect(confirmation).toContainText("2 field changes");
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(state.writes).toHaveLength(0);
  await expect(page.getByLabel("Reason", { exact: true })).toHaveValue(
    "Two groups and independent export denial",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await confirmation
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0].operation).toBe("access_matrix");
  expect(state.writes[0].p.fields).toHaveLength(2);
  expect(state.writes[0].p.modules).toContainEqual({
    module: "employees",
    action: "export",
    effect: "deny",
  });
  expect(state.writes[0].p.modules).toContainEqual({module:"employees",action:"import",effect:"allow"});
});

test("failed matrix review sends no mutation and keeps the draft", async ({
  page,
}) => {
  const { state } = await setup(page);
  state.fail = true;
  await page
    .getByLabel("Employees Export", { exact: true })
    .selectOption("deny");
  await page.getByLabel("Reason", { exact: true }).fill("Keep failure draft");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Access review unavailable",
  );
  expect(state.writes).toHaveLength(0);
  await expect(
    page.getByLabel("Employees Export", { exact: true }),
  ).toHaveValue("deny");
});

test("switching role templates reloads the matrix and saves to the selected role", async ({
  page,
}) => {
  const { state } = await setup(page);
  await page
    .getByRole("button", { name: "Scope & assignments", exact: true })
    .click();
  await expect(page.getByText(/Account role: Administrator/)).toBeVisible();
  await expect(page.getByText(/Admin is below Superadmin/)).toBeVisible();
  await page
    .getByRole("button", { name: "Additional roles", exact: true })
    .click();
  await expect(page.getByRole("option", { name: /Administrator/ })).toHaveCount(
    0,
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Permission matrix", exact: true })
    .click();
  for (const role of ["Administrator", "Viewer"]) {
    await page
      .getByRole("button", { name: "Role template", exact: true })
      .click();
    await page.getByRole("option", { name: new RegExp(`^${role}`) }).click();
    await expect(
      page.getByLabel("Employees Export", { exact: true }),
    ).toBeVisible();
  }
  await page
    .getByLabel("Employees Export", { exact: true })
    .selectOption("deny");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Selected Viewer template");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Save access changes", exact: true })
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0].p.role_id).toBe("viewer");
  expect(state.writes[0].p.user_id).toBeUndefined();
});

test("changing the selected account requires discard and cancellation preserves every cell", async ({
  page,
}) => {
  const { state } = await setup(page);
  await page
    .getByLabel("Employees Export", { exact: true })
    .selectOption("deny");
  await page.getByRole("button", { name: "User", exact: true }).click();
  await page.getByRole("option", { name: /Existing administrator/ }).click();
  const discard = page.getByRole("dialog", {
    name: "Discard unsaved changes?",
    exact: true,
  });
  await discard
    .getByRole("button", { name: "Continue editing", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "User", exact: true }),
  ).toContainText("Sample manager");
  await expect(
    page.getByLabel("Employees Export", { exact: true }),
  ).toHaveValue("deny");
  expect(state.writes).toHaveLength(0);
});

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 375, height: 740 },
  { width: 768, height: 1024 },
  { width: 812, height: 375 },
]) {
  test(`matrix, presets and effective access fit ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { state } = await setup(page, true);
    for (const section of ["Permission matrix", "Field permissions"]) {
      await page.getByRole("button", { name: section, exact: true }).click();
      if (section === "Field permissions") {
        await page.screenshot({
          path: `.test-db/reports/release/header-fields-before-${viewport.width}.png`,
        });
        for (const button of await page
          .locator(".permission-group-row button")
          .all())
          await button.click();
      }
      const scroller = page.locator(
        ".permission-body > .permission-table-scroll",
      );
      await scroller.evaluate((el) => {
        el.scrollTop = 0;
        el.scrollLeft = 0;
      });
      await page.screenshot({
        path: `.test-db/reports/release/header-${section}-${viewport.width}.png`,
      });
      const header = scroller.locator("thead th").first();
      const row = scroller.locator("tbody tr").first();
      const beforeHeader = await header.boundingBox();
      const beforeRow = await row.boundingBox();
      await scroller.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
        el.scrollLeft = el.scrollWidth;
      });
      await expect
        .poll(async () => (await header.boundingBox())?.y)
        .toBeCloseTo(beforeHeader!.y, 0);
      expect((await header.boundingBox())!.x).toBeCloseTo(beforeHeader!.x, 0);
      expect((await row.boundingBox())!.y).toBeLessThan(beforeRow!.y);
      await expect(header).toBeInViewport();
      await expect(page.locator(".permission-save-bar")).toBeInViewport();
    }
    await page.screenshot({
      path: `.test-db/reports/release/matrix-modules-${viewport.width}.png`,
    });
    await page
      .getByRole("button", { name: "Scope & assignments", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Access preset", exact: true })
      .click();
    await page
      .getByRole("option", { name: "Head Office editor", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Access preset", exact: true }),
    ).toContainText("Head Office editor");
    const body = page.locator(".permission-body"),
      footer = page.locator(".permission-save-bar"),
      before = await footer.boundingBox();
    await body.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(await footer.boundingBox()).toEqual(before);
    await expect(
      footer.getByRole("button", { name: "Save", exact: true }),
    ).toBeInViewport();
    await page
      .getByRole("button", { name: "View Effective Access", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "View Effective Access",
      exact: true,
    });
    await expect(dialog).toContainText("Explicit DENY overrides grants");
    await expect(dialog).toContainText("Role manager: allow");
    await expect(dialog).toContainText("Direct override: deny");
    for (const name of ["Effective module access", "Effective field access"]) {
      const region = dialog.getByRole("region", { name, exact: true });
      await region.scrollIntoViewIfNeeded();
      const header = region.locator("thead th").first();
      const row = region.locator("tbody tr").first();
      const headerY = (await header.boundingBox())!.y;
      const rowY = (await row.boundingBox())!.y;
      await region.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      expect((await header.boundingBox())!.y).toBeCloseTo(headerY, 0);
      expect((await row.boundingBox())!.y).toBeLessThan(rowY);
    }
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
    await page.screenshot({
      path: `.test-db/reports/release/matrix-effective-${viewport.width}.png`,
    });
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    expect(state.writes).toHaveLength(0);
  });
}
