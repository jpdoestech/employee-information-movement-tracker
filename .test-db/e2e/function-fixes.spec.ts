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
    employeeReads: [] as any[],
    historyReads: 0,
    historyGate: null as Promise<void> | null,
    failHistory: false,
    targetReads: [] as any[],
    targetGates: {} as Record<string, Promise<void>>,
    failTarget: false,
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
    if (request.url().includes("/target_fields")) {
      const target = body.q.client_id || body.q.branch_id || "unassigned";
      state.targetReads.push(target);
      await state.targetGates[target];
      if (state.failTarget)
        return route.fulfill({
          status: 403,
          json: { message: "Field access unavailable" },
        });
      return route.fulfill({
        json: target === "unassigned" ? [] : context.fields,
      });
    }
    if (body.operation === "employee") state.employeeReads.push(body.q);
    if (body.operation === "employee_history") {
      state.historyReads++;
      await state.historyGate;
      if (state.failHistory)
        return route.fulfill({
          status: 403,
          json: { message: "History access revoked" },
        });
      return route.fulfill({
        json: {
          assignments: [],
          movements: [
            {
              id: "history-one",
              type: "position",
              effective_on: state.day,
              state: "Effective",
            },
          ],
        },
      });
    }
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
              {
                id: "branch-one",
                label: "North",
                kind: "branch",
                active: true,
              },
              {
                id: "client-one",
                label: "Client One",
                kind: "client",
                branch_id: "branch-one",
                context: "North",
                active: true,
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

for (const editing of [false, true])
  test(`employee ${editing ? "update" : "create"} locks the draft through validation and save, and preserves it after cancellation and failure`, async ({
    page,
  }) => {
    await connected(page);
    let release!: () => void;
    let pending = false;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sent: any[] = [];
    await page.route("**/rest/v1/rpc/employee_duplicates", async (route) => {
      pending = true;
      await gate;
      await route.fulfill({ json: { total: 0, items: [] } });
    });
    await page.route("**/rest/v1/rpc/tracker_mutate", async (route) => {
      sent.push(route.request().postDataJSON());
      await route.fulfill(
        sent.length === 1
          ? { status: 503, json: { message: "Save temporarily unavailable" } }
          : { json: { id: "synthetic-created" } },
      );
    });
    await page.goto("/#employees");
    await page
      .getByRole("button", {
        name: editing ? "EMP-00001" : "Add employee",
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog", {
      name: editing ? "Employee profile" : "New employee",
      exact: true,
    });
    if (editing)
      await dialog
        .getByRole("button", { name: "Edit details", exact: true })
        .click();
    else {
      await dialog
        .getByRole("button", { name: "Initial organization", exact: true })
        .click();
      await page
        .getByRole("dialog", {
          name: "Initial organization options",
          exact: true,
        })
        .getByRole("option", { name: "North", exact: true })
        .click();
    }
    await dialog
      .getByRole("textbox", { name: /^Last Name(?: \*)?$/ })
      .fill("Audit");
    await dialog
      .getByRole("textbox", { name: /^First Name(?: \*)?$/ })
      .fill("Draft");
    const phone = dialog.getByLabel("Mobile", { exact: true });
    await phone.fill("09123456789");
    await expect(
      dialog.getByRole("group", {
        name: "Personal Information / Emergency Information",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("group", { name: "Emergency Address", exact: true }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => pending).toBe(true);
    await expect(phone).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Clear Mobile", exact: true }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Close dialog", exact: true }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(
      page.getByRole("dialog", {
        name: "Discard unsaved changes?",
        exact: true,
      }),
    ).toHaveCount(0);
    if (!editing)
      await expect(
        dialog.getByRole("button", {
          name: "Initial organization",
          exact: true,
        }),
      ).toBeDisabled();
    release();
    const confirmation = page.getByRole("dialog", {
      name: editing ? "Save employee changes" : "Create employee",
      exact: true,
    });
    await confirmation
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await expect(phone).toBeEnabled();
    await expect(phone).toHaveValue("0912-345-6789");
    expect(sent).toHaveLength(0);
    await phone.fill("09987654321");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await confirmation
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(
      dialog.getByText("Save temporarily unavailable", { exact: true }),
    ).toBeVisible();
    await expect(phone).toBeEnabled();
    await expect(phone).toHaveValue("0998-765-4321");
    expect(sent).toHaveLength(1);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await confirmation
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    expect(sent).toHaveLength(2);
    expect(sent.every((s) => s.p.values.phone === "09987654321")).toBe(true);
  });

test("new employee waits for current organization permissions without flashing general or stale inputs", async ({
  page,
}) => {
  const state = await connected(page);
  let releaseInitial!: () => void;
  state.targetGates.unassigned = new Promise<void>((resolve) => {
    releaseInitial = resolve;
  });
  await page.goto("/#employees");
  await page.getByRole("button", { name: "Add employee", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "New employee",
    exact: true,
  });
  const lastName = dialog.getByLabel("Last Name *", { exact: true });
  await expect.poll(() => state.targetReads.length).toBeGreaterThan(0);
  await expect(lastName).toHaveCount(0);
  await expect(dialog.getByRole("status")).toContainText("Checking fields");
  releaseInitial();
  await expect(
    dialog.getByText(
      "Choose an authorized branch or client to enter employee details.",
    ),
  ).toBeVisible();
  await expect(lastName).toHaveCount(0);
  async function choose(name: string) {
    await dialog
      .getByRole("button", { name: "Initial organization", exact: true })
      .click();
    await page
      .getByRole("dialog", {
        name: "Initial organization options",
        exact: true,
      })
      .getByRole("option", { name: new RegExp(`^${name}(?:\\s|$)`) })
      .click();
  }
  let releaseBranch!: () => void;
  state.targetGates["branch-one"] = new Promise<void>((resolve) => {
    releaseBranch = resolve;
  });
  await choose("North");
  await expect(lastName).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  releaseBranch();
  await expect(lastName).toBeVisible();
  await lastName.fill("Preserved draft");
  state.failTarget = true;
  await choose("Client One");
  await expect(lastName).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Retry field access", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  state.failTarget = false;
  await dialog
    .getByRole("button", { name: "Retry field access", exact: true })
    .click();
  await expect(lastName).toHaveValue("PRESERVED DRAFT");
  expect(state.writes).toHaveLength(0);
  await page.screenshot({
    path: ".test-db/reports/release/organization-fields-ready.png",
  });
});

test("a late organization response cannot replace the current selection's fields", async ({
  page,
}) => {
  const state = await connected(page);
  let releaseInitial!: () => void;
  state.targetGates.unassigned = new Promise<void>((resolve) => {
    releaseInitial = resolve;
  });
  await page.goto("/#employees");
  await page.getByRole("button", { name: "Add employee", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "New employee",
    exact: true,
  });
  await expect.poll(() => state.targetReads.length).toBeGreaterThan(0);
  await dialog
    .getByRole("button", { name: "Initial organization", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Initial organization options", exact: true })
    .getByRole("option", { name: "North", exact: true })
    .click();
  const lastName = dialog.getByLabel("Last Name *", { exact: true });
  await expect(lastName).toBeVisible();
  await lastName.fill("Current target");
  releaseInitial();
  await expect(
    dialog.getByText("Checking fields for the selected organization…"),
  ).toHaveCount(0);
  await expect(lastName).toHaveValue("CURRENT TARGET");
  expect(state.writes).toHaveLength(0);
});

test("employee overview does not wait for history and history is reused only inside the dialog", async ({
  page,
}) => {
  const state = await connected(page);
  await page.goto("/#employees");
  await page.getByRole("button", { name: "EMP-00001", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Employee profile",
    exact: true,
  });
  await expect(dialog.locator(".employee-identity-strip")).toContainText(
    "Employee 2026",
  );
  expect(state.employeeReads.length).toBeGreaterThan(0);
  expect(
    state.employeeReads.every(
      (q) =>
        q.id === "11111111-1111-4111-8111-111111111111" &&
        q.include_history === false,
    ),
  ).toBe(true);
  expect(state.historyReads).toBe(0);
  let release!: () => void;
  state.historyGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await dialog
      .getByRole("tab", { name: "Record history", exact: true })
      .click();
    await expect.poll(() => state.historyReads).toBe(1);
    await expect(
      dialog.getByText("Loading employee history…", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: ".test-db/reports/release/employee-history-on-demand.png",
    });
    await expect(
      dialog.getByText("No accessible movement history.", { exact: true }),
    ).toHaveCount(0);
    release();
    await expect(dialog.locator(".timeline-item")).toContainText("position");
    await dialog.getByRole("tab", { name: "Overview", exact: true }).click();
    await dialog
      .getByRole("tab", { name: "Record history", exact: true })
      .click();
    await expect(dialog.locator(".timeline-item")).toBeVisible();
    expect(state.historyReads).toBe(1);
    expect(state.writes).toHaveLength(0);
  } finally {
    release();
  }
});

test("employee history invalidates on permission revision and retries reads without losing the overview", async ({
  page,
}) => {
  await page.clock.install();
  const state = await connected(page);
  await page.goto("/#employees");
  await page.getByRole("button", { name: "EMP-00001", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Employee profile",
    exact: true,
  });
  await dialog
    .getByRole("tab", { name: "Record history", exact: true })
    .click();
  await expect(dialog.locator(".timeline-item")).toBeVisible();
  await dialog.getByRole("tab", { name: "Overview", exact: true }).click();
  state.revision++;
  state.failHistory = true;
  await page.clock.fastForward(31000);
  await expect.poll(() => state.employeeReads.length).toBe(2);
  await dialog
    .getByRole("tab", { name: "Record history", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "History access revoked",
  );
  await expect(dialog.locator(".timeline-item")).toHaveCount(0);
  state.failHistory = false;
  await dialog
    .getByRole("button", { name: "Retry history", exact: true })
    .click();
  await expect(dialog.locator(".timeline-item")).toBeVisible();
  expect(state.historyReads).toBe(3);
  await dialog.getByRole("tab", { name: "Overview", exact: true }).click();
  await expect(dialog.locator(".employee-identity-strip")).toContainText(
    "Employee 2026",
  );
  const reads = state.employeeReads.length;
  state.day = "2026-10-23";
  await page.clock.fastForward(31000);
  await expect.poll(() => state.employeeReads.length).toBe(reads + 1);
  await dialog
    .getByRole("tab", { name: "Record history", exact: true })
    .click();
  await expect(dialog.locator(".timeline-item")).toContainText("2026-10-23");
  expect(state.historyReads).toBe(4);
  expect(state.writes).toHaveLength(0);
});

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
