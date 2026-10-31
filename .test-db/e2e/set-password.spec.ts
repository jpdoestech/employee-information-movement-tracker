import { test, expect, type Page } from "@playwright/test";
async function connected(page: Page) {
  await page.goto("/");
  const context = await page.evaluate(async () => {
    const path = "/src/demo.ts";
    return (await import(path)).demoQuery("context");
  });
  const actor = {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "admin@example.test",
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: "2026-01-01T00:00:00Z",
  };
  const target = {
    id: "22222222-2222-4222-8222-222222222222",
    display_name: "New colleague",
    role: "admin",
    active: true,
  };
  context.profile.id = actor.id;
  const writes: any[] = [];
  const state = { fail: false, mutations: 0 };
  await page.route(/^https:\/\/[^/]+\.supabase\.co\//, async (route) => {
    const req = route.request();
    if (req.url().includes("/auth/v1/user"))
      return route.fulfill({ json: actor });
    const body = req.method() === "POST" ? req.postDataJSON() : {};
    if (req.url().includes("/functions/v1/manage-users")) {
      writes.push(body);
      return state.fail
        ? route.fulfill({
            status: 503,
            json: {
              error: "Password service unavailable. Retry this unchanged form.",
            },
          })
        : route.fulfill({ json: { id: target.id } });
    }
    if (req.url().includes("/tracker_mutate")) state.mutations++;
    return route.fulfill({
      json: req.url().includes("/register_settings")
        ? context.register_settings
        : body.operation === "context"
          ? context
          : body.operation === "security"
            ? {
                users: [{ ...context.profile, active: true }, target],
                scopes: [],
                policies: [],
                capabilities: [],
              }
            : body.operation === "employees"
              ? { items: [], total: 0 }
              : body.operation === "dashboard"
                ? { total: 0, statuses: {}, placements: {} }
                : [],
    });
  });
  const enc = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const token = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: actor.id, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic`;
  await page.goto(
    `/#access_token=${token}&refresh_token=synthetic-refresh&expires_in=3600&token_type=bearer&type=signup`,
  );
  await page.reload();
  await page.goto("/#permissions");
  await page
    .getByRole("button", {
      name: "Manage account for New colleague",
      exact: true,
    })
    .click();
  const account = page.getByRole("dialog", {
    name: "Manage account",
    exact: true,
  });
  await account
    .getByRole("button", { name: "Set password", exact: true })
    .click();
  return {
    writes,
    state,
    target,
    account,
    dialog: page.getByRole("dialog", { name: "Set password", exact: true }),
  };
}
for (const [width, height] of [
  [375, 740],
  [768, 1024],
  [1366, 768],
  [812, 375],
]) {
  test(`Superadmin sets a matching password only after Continue at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { dialog, account, writes, target, state } = await connected(page);
    const save = dialog.getByRole("button", {
      name: "Set password",
      exact: true,
    });
    await expect(save).toBeDisabled();
    await dialog
      .getByLabel("New password", { exact: true })
      .fill("Synthetic-replacement-123!");
    await dialog
      .getByLabel("Confirm password", { exact: true })
      .fill("different");
    await dialog
      .getByLabel("Reason for password change", { exact: true })
      .fill("Restore colleague access");
    await expect(save).toBeDisabled();
    await expect(dialog.getByRole("alert")).toContainText(
      "Passwords must match",
    );
    await dialog
      .getByLabel("Confirm password", { exact: true })
      .fill("Synthetic-replacement-123!");
    await dialog.getByLabel("Show password", { exact: true }).check();
    await expect(
      dialog.getByLabel("New password", { exact: true }),
    ).toHaveAttribute("type", "text");
    await dialog
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Discard unsaved changes?", exact: true })
      .getByRole("button", { name: "Continue editing", exact: true })
      .click();
    await save.click();
    const confirm = page.getByRole("dialog", {
      name: "Set account password",
      exact: true,
    });
    await expect(confirm).toContainText("New colleague");
    await expect(confirm).not.toContainText("Synthetic-replacement-123!");
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(writes).toHaveLength(0);
    await expect(
      dialog.getByLabel("New password", { exact: true }),
    ).toHaveValue("Synthetic-replacement-123!");
    await save.click();
    await confirm
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(account.getByRole("status")).toContainText(
      "Password updated for New colleague",
    );
    expect(writes).toHaveLength(1);
    expect(state.mutations).toBe(0);
    expect(writes[0]).toMatchObject({
      action: "set_password",
      user_id: target.id,
      password: "Synthetic-replacement-123!",
      reason: "Restore colleague access",
    });
    expect(writes[0]).not.toHaveProperty("role");
    expect(writes[0]).not.toHaveProperty("active");
    await account
      .getByRole("button", { name: "Set password", exact: true })
      .click();
    await expect(
      dialog.getByLabel("New password", { exact: true }),
    ).toHaveValue("");
    await expect(
      dialog.getByLabel("Confirm password", { exact: true }),
    ).toHaveValue("");
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
    await expect(save).toBeInViewport();
    await page.screenshot({
      path: `.test-db/reports/release/set-password-${width}x${height}.png`,
    });
  });
}
test("failed password changes preserve the draft and retry only after another confirmation", async ({
  page,
}) => {
  const { dialog, writes, state } = await connected(page);
  state.fail = true;
  await dialog
    .getByLabel("New password", { exact: true })
    .fill("Synthetic-retry-123!");
  await dialog
    .getByLabel("Confirm password", { exact: true })
    .fill("Synthetic-retry-123!");
  await dialog
    .getByLabel("Reason for password change", { exact: true })
    .fill("Synthetic explicit retry");
  const confirm = page.getByRole("dialog", {
    name: "Set account password",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Set password", exact: true })
    .click();
  await confirm.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Password service unavailable",
  );
  await expect(dialog.getByLabel("New password", { exact: true })).toHaveValue(
    "Synthetic-retry-123!",
  );
  expect(writes).toHaveLength(1);
  state.fail = false;
  await dialog
    .getByRole("button", { name: "Set password", exact: true })
    .click();
  expect(writes).toHaveLength(1);
  await confirm.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toHaveLength(2);
  expect(writes[0].request_id).toBe(writes[1].request_id);
});
