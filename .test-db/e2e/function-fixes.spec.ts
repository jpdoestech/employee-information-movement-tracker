import { test, expect, type Page } from "@playwright/test";

async function connected(page: Page) {
  await page.goto("/");
  const context = await page.evaluate(async () => {
    const path = "/src/demo.ts";
    return (await import(path)).demoQuery("context");
  });
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "audit@example.test",
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: "2026-01-01T00:00:00Z",
  };
  context.profile.id = user.id;
  const state = {
    day: "2026-10-22",
    revision: 1,
    count: 1,
    recordReads: 0,
    reviews: [] as any[],
    failReview: false,
    changeCount: 1,
    writes: [] as any[],
  };
  const employee = () => ({
    id: user.id,
    row_version: 1,
    values: {
      name: `Employee ${state.day}`,
      employee_number: "EMP-00001",
      phone: "09123456789",
      status: "Active",
      branch: "Head Office",
    },
  });
  await page.route(/^https:\/\/[^/]+\.supabase\.co\//, async (route) => {
    const request = route.request();
    if (request.url().includes("/auth/v1/user"))
      return route.fulfill({ json: user });
    const body = request.method() === "POST" ? request.postDataJSON() : {};
    if (request.url().includes("/access_change_preview")) {
      state.reviews.push(body);
      if (state.failReview)
        return route.fulfill({
          status: 403,
          json: {
            code: "42501",
            message: "Only a Superadmin can review permission changes",
          },
        });
      return route.fulfill({
        json: {
          revision: state.revision,
          today: state.day,
          targets: [{ id: "branch-one", label: "North" }],
          changes: Array.from({ length: state.changeCount }, (_, i) => ({
            target_id: "branch-one",
            target: "North / Client One",
            key: `phone_${i}`,
            label: "Phone",
            action: "R",
            before: false,
            after: true,
            restricted: false,
            reason: "Group allow",
          })),
        },
      });
    }
    if (request.url().includes("/tracker_mutate")) {
      state.writes.push(body);
      state.revision++;
      return route.fulfill({ json: { updated: body.p.actions.length } });
    }
    if (request.url().includes("/register_settings"))
      return route.fulfill({ json: context.register_settings });
    if (request.url().includes("/record_page")) {
      state.recordReads++;
      return route.fulfill({ json: { items: [], total: 0 } });
    }
    const result =
      body.operation === "context"
        ? { ...context, today: state.day, revision: state.revision }
        : body.operation === "options"
          ? [
              { id: "branch-one", label: "North", kind: "branch" },
              {
                id: "client-one",
                label: "Client One",
                kind: "client",
                branch_id: "branch-one",
                context: "North",
              },
            ]
          : body.operation === "employees"
            ? { items: [employee()], total: 1 }
            : body.operation === "employee"
              ? {
                  employee: employee(),
                  fields: context.fields,
                  assignments: [],
                }
              : body.operation === "dashboard"
                ? {
                    total: state.count,
                    statuses: { Active: state.count },
                    placements: { "Head Office": state.count },
                  }
                : body.operation === "security"
                  ? {
                      users: [
                        {
                          id: user.id,
                          display_name: "Synthetic administrator",
                          role: "superadmin",
                          active: true,
                        },
                      ],
                      scopes: [],
                      policies: [
                        {
                          id: "user-policy",
                          user_id: user.id,
                          scope_type: "all",
                          group_id: context.groups[0].id,
                          action: "R",
                          effect: "deny",
                        },
                      ],
                      capabilities: [],
                    }
                  : [];
    return route.fulfill({ json: result });
  });
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic-signature`;
  await page.goto(
    `/#access_token=${token}&refresh_token=synthetic-refresh&expires_in=3600&token_type=bearer&type=signup`,
  );
  await page.reload();
  await expect(page.getByText("Workspace", { exact: true })).toBeAttached();
  await page.goto("/#dashboard");
  await expect(page.locator(".stats .stat strong").first()).toHaveText("1");
  return state;
}

test("business-date refresh reloads employees, dashboard and movements without a revision change", async ({
  page,
}) => {
  await page.clock.install();
  const state = await connected(page);
  await page.goto("/#employees");
  await expect(page.getByLabel("Scrollable employee table")).toContainText(
    state.day,
  );
  state.day = "2026-10-23";
  await page.clock.fastForward(31000);
  await expect(page.getByLabel("Scrollable employee table")).toContainText(
    state.day,
  );
  await page.goto("/#dashboard");
  state.day = "2026-10-24";
  state.count = 2;
  await page.clock.fastForward(31000);
  await expect(page.locator(".stats .stat strong").first()).toHaveText("2");
  await page.goto("/#movements");
  await expect.poll(() => state.recordReads).toBeGreaterThan(0);
  const reads = state.recordReads;
  state.day = "2026-10-25";
  await page.clock.fastForward(31000);
  await expect.poll(() => state.recordReads).toBeGreaterThan(reads);
  expect(state.revision).toBe(1);
  expect(state.writes).toHaveLength(0);
});

test("movement search retains authorized matches found through phone values", async ({
  page,
}) => {
  await connected(page);
  await page.goto("/#movements");
  await page
    .getByRole("button", { name: "New transaction", exact: true })
    .click();
  await page.getByRole("button", { name: "Employee", exact: true }).click();
  const picker = page.getByRole("dialog", {
    name: "Employee options",
    exact: true,
  });
  await picker.getByRole("combobox").fill("09123456789");
  await expect(
    picker.getByRole("option", { name: /Employee 2026/ }),
  ).toBeVisible();
});

test("permission actions use one confirmed atomic request and cancellation sends nothing", async ({
  page,
}) => {
  const state = await connected(page);
  await page.goto("/#permissions");
  await page
    .getByRole("navigation", { name: "Access configuration" })
    .getByRole("button", { name: "Access rules", exact: true })
    .click();
  await page.getByRole("button", { name: "User", exact: true }).click();
  await page.getByRole("option", { name: /Synthetic administrator/ }).click();
  await page
    .getByRole("button", { name: "Organization scope", exact: true })
    .click();
  await page
    .getByRole("option", { name: "All organization scopes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Field permissions", exact: true })
    .click();
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await page.getByRole("option").first().click();
  await page.getByLabel("Update values", { exact: true }).check();
  await page
    .getByLabel("Reason for policy change", { exact: true })
    .fill("Synthetic atomic batch");
  const save = page.getByRole("button", {
    name: "Save field policy",
    exact: true,
  });
  const confirm = page.getByRole("dialog", {
    name: "Change access policy",
    exact: true,
  });
  await save.click();
  await expect(confirm).toContainText("1 permissions gained");
  await expect(confirm).toContainText("North / Client One");
  expect(state.reviews).toHaveLength(1);
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(state.writes).toHaveLength(0);
  await save.click();
  await confirm.getByRole("button", { name: "Continue", exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0]).toMatchObject({
    operation: "policy_batch",
    p: { actions: ["R", "U"], review_revision: 1 },
  });
  await expect(confirm).toHaveCount(0);
});

for (const [width, height] of [
  [1366, 768],
  [320, 740],
  [768, 1024],
  [812, 375],
]) {
  test(`access presets remain drafts and review fits ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const state = await connected(page);
    await page.goto("/#permissions");
    await page
      .getByRole("navigation", { name: "Access configuration" })
      .getByRole("button", { name: "Access rules", exact: true })
      .click();
    await page.getByRole("button", { name: "User", exact: true }).click();
    await page.getByRole("option", { name: /Synthetic administrator/ }).click();
    await page
      .getByRole("button", { name: "Current access", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Access overview" }),
    ).toBeVisible();
    await expect(page.getByText(/Trusted Superadmin override/)).toBeVisible();
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
      page.getByRole("button", { name: "Organization scope", exact: true }),
    ).toContainText("Head Office");
    await expect(
      page.getByLabel("Include branch clients explicitly"),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Access preset", exact: true })
      .click();
    await page
      .getByRole("option", { name: "Branch and clients editor", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Organization scope", exact: true })
      .click();
    await page.getByRole("option", { name: "North", exact: true }).click();
    await expect(
      page.getByLabel("Include branch clients explicitly"),
    ).toBeChecked();
    await expect(
      page.getByLabel("Clear values", { exact: true }),
    ).not.toBeChecked();
    expect(state.writes).toHaveLength(0);
    expect(state.reviews).toHaveLength(0);
    await page
      .getByLabel("Reason for policy change", { exact: true })
      .fill("Synthetic branch review");
    await page
      .getByRole("button", { name: "Grant organization actions", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Change access scope",
      exact: true,
    });
    await expect(dialog).toContainText("including branch clients");
    await expect(dialog).toContainText("North / Client One");
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height + 1);
    await page.screenshot({
      path: `.test-db/reports/screenshots/access-review-${width}.png`,
    });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(state.writes).toHaveLength(0);
    await expect(
      page.getByLabel("Reason for policy change", { exact: true }),
    ).toHaveValue("Synthetic branch review");
    await page
      .getByRole("button", { name: "Grant organization actions", exact: true })
      .click();
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await expect.poll(() => state.writes.length).toBe(1);
    expect(state.writes[0]).toMatchObject({
      operation: "scope",
      p: {
        scope_type: "branch",
        scope_id: "branch-one",
        include_descendants: true,
        actions: ["C", "R", "U"],
        review_revision: 1,
      },
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  });
}

test("failed access review never opens confirmation or sends a mutation", async ({
  page,
}) => {
  const state = await connected(page);
  state.failReview = true;
  await page.goto("/#permissions");
  await page
    .getByRole("navigation", { name: "Access configuration" })
    .getByRole("button", { name: "Access rules", exact: true })
    .click();
  await page.getByRole("button", { name: "User", exact: true }).click();
  await page.getByRole("option", { name: /Synthetic administrator/ }).click();
  await page
    .getByRole("button", { name: "Organization scope", exact: true })
    .click();
  await page.getByRole("option", { name: "Head Office", exact: true }).click();
  await page
    .getByLabel("Reason for policy change", { exact: true })
    .fill("Synthetic denial");
  await page
    .getByRole("button", { name: "Grant organization actions", exact: true })
    .click();
  await expect(
    page.getByText("Only a Superadmin can review permission changes", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Change access scope", exact: true }),
  ).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});

test("large access reviews scroll internally while keeping Cancel and Continue visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 812, height: 375 });
  const state = await connected(page);
  state.changeCount = 80;
  await page.goto("/#permissions");
  await page
    .getByRole("navigation", { name: "Access configuration" })
    .getByRole("button", { name: "Access rules", exact: true })
    .click();
  await page.getByRole("button", { name: "User", exact: true }).click();
  await page.getByRole("option", { name: /Synthetic administrator/ }).click();
  await page
    .getByRole("button", { name: "Organization scope", exact: true })
    .click();
  await page.getByRole("option", { name: "Head Office", exact: true }).click();
  await page
    .getByLabel("Reason for policy change", { exact: true })
    .fill("Synthetic long review");
  await page
    .getByRole("button", { name: "Grant organization actions", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Change access scope",
    exact: true,
  });
  await expect(dialog).toContainText("80 permissions gained");
  const body = dialog.locator(".dialog-body");
  expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  const continueButton = dialog.getByRole("button", {
    name: "Continue",
    exact: true,
  });
  await expect(continueButton).toBeInViewport();
  const before = await continueButton.boundingBox();
  await body.evaluate((el) => (el.scrollTop = el.scrollHeight));
  expect(await continueButton.boundingBox()).toEqual(before);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(state.writes).toHaveLength(0);
});
