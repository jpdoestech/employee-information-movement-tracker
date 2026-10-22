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
          ? []
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
                      policies: [],
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
  await expect(page.getByText("Workspace", { exact: true })).toBeVisible();
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
  await page.getByRole("button", { name: "User", exact: true }).click();
  await page.getByRole("option", { name: /Synthetic administrator/ }).click();
  await page
    .getByRole("button", { name: "Organization scope", exact: true })
    .click();
  await page
    .getByRole("option", { name: "All organization scopes", exact: true })
    .click();
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await page.getByRole("option").first().click();
  await page.getByLabel("U — Update values", { exact: true }).check();
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
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(state.writes).toHaveLength(0);
  await save.click();
  await confirm.getByRole("button", { name: "Continue", exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0]).toMatchObject({
    operation: "policy_batch",
    p: { actions: ["R", "U"] },
  });
  await expect(confirm).toHaveCount(0);
});
