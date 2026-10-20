import { test, expect, type Page } from "@playwright/test";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "recovery@example.test",
  app_metadata: {},
  user_metadata: {},
  identities: [],
  created_at: "2026-01-01T00:00:00Z",
};
async function authMock(page: Page, fail = false) {
  const writes: unknown[] = [];
  await page.route(/^https:\/\/[^/]+\.supabase\.co\//, async (route) => {
    const request = route.request();
    if (request.method() === "PUT" && request.url().includes("/auth/v1/user")) {
      writes.push(request.postDataJSON());
      await route.fulfill({
        status: fail ? 422 : 200,
        json: fail
          ? { msg: "Choose a different password.", code: "same_password" }
          : user,
      });
    } else if (request.url().includes("/auth/v1/recover")) {
      writes.push({ body: request.postDataJSON(), url: request.url() });
      await route.fulfill({ json: {} });
    } else if (request.url().includes("/auth/v1/user"))
      await route.fulfill({ json: user });
    else
      await route.fulfill({
        status: 401,
        json: { message: "Synthetic test has no employee access" },
      });
  });
  return writes;
}
function recoveryUrl() {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic-signature`;
  return `/#access_token=${token}&refresh_token=synthetic-refresh-token&expires_in=3600&token_type=bearer&type=recovery`;
}

for (const [width, height] of [
  [1366, 768],
  [375, 740],
  [768, 1024],
  [812, 375],
]) {
  test(`recovery link shows a bounded password form and survives reload at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await authMock(page);
    await page.goto(recoveryUrl());
    await expect(
      page.getByRole("heading", { name: "Set a new password" }),
    ).toBeVisible();
    await expect(
      page.getByLabel("New password", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `.test-db/reports/release/password-recovery-${width}x${height}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Set a new password" }),
    ).toBeVisible();
  });
}

test("recovery validates matching passwords, cancellation preserves draft, and Continue sends exactly one update", async ({
  page,
}) => {
  const writes = await authMock(page);
  await page.goto(recoveryUrl());
  await page
    .getByLabel("New password", { exact: true })
    .fill("Synthetic-password-123!");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("Different-password-123!");
  await page
    .getByRole("button", { name: "Save password", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Passwords do not match");
  expect(writes).toHaveLength(0);
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("Synthetic-password-123!");
  await page
    .getByRole("button", { name: "Save password", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Change password?" })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(writes).toHaveLength(0);
  await expect(page.getByLabel("New password", { exact: true })).toHaveValue(
    "Synthetic-password-123!",
  );
  await page
    .getByRole("button", { name: "Save password", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Change password?" })
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Password updated");
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ password: "Synthetic-password-123!" });
  expect(
    await page.evaluate(() => sessionStorage.getItem("eimt-password-recovery")),
  ).toBeNull();
});

test("rejected password update preserves the form and is never retried automatically", async ({
  page,
}) => {
  const writes = await authMock(page, true);
  await page.goto(recoveryUrl());
  await page
    .getByLabel("New password", { exact: true })
    .fill("Synthetic-password-123!");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("Synthetic-password-123!");
  await page
    .getByRole("button", { name: "Save password", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Change password?" })
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Choose a different password",
  );
  await expect(page.getByLabel("New password", { exact: true })).toHaveValue(
    "Synthetic-password-123!",
  );
  expect(writes).toHaveLength(1);
});

test("reset request uses the current app URL and requires confirmation", async ({
  page,
}) => {
  const writes = await authMock(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByLabel("Email address", { exact: true }).fill(user.email);
  await page
    .getByRole("button", { name: "Send reset email", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Send reset email?" })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(writes).toHaveLength(0);
  await page
    .getByRole("button", { name: "Send reset email", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Send reset email?" })
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "a reset link has been sent",
  );
  expect(writes).toHaveLength(1);
  const request = writes[0] as { body: { email: string }; url: string };
  expect(request.body.email).toBe(user.email);
  expect(new URL(request.url).searchParams.get("redirect_to")).toBe(
    "http://127.0.0.1:5173/?auth=recovery",
  );
});

test("expired recovery link exposes the error and a way to request another", async ({
  page,
}) => {
  await authMock(page);
  await page.goto(
    "/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
  );
  await expect(page.getByRole("alert")).toContainText(
    "Email link is invalid or has expired",
  );
  await expect(
    page.getByRole("heading", { name: "Reset password", exact: true }),
  ).toBeVisible();
});

test("explicit recovery redirect works after the token fragment was consumed", async ({
  page,
}) => {
  await authMock(page);
  await page.goto(recoveryUrl());
  await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
  await page.evaluate(() =>
    sessionStorage.removeItem("eimt-password-recovery"),
  );
  await page.goto("/?auth=recovery");
  await expect(
    page.getByRole("heading", { name: "Set a new password" }),
  ).toBeVisible();
  await page
    .getByLabel("New password", { exact: true })
    .fill("Synthetic-password-123!");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("Synthetic-password-123!");
  await page
    .getByRole("button", { name: "Save password", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Change password?" })
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Password updated");
  expect(new URL(page.url()).searchParams.has("auth")).toBe(false);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Set a new password" }),
  ).toHaveCount(0);
});

test("leaving an edited recovery form requires discard and never changes the password", async ({
  page,
}) => {
  const writes = await authMock(page);
  await page.goto(recoveryUrl());
  await page
    .getByLabel("New password", { exact: true })
    .fill("Synthetic-password-123!");
  await page
    .getByRole("button", { name: "Back to sign in", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Discard changes?" })
    .getByRole("button", { name: "Continue editing", exact: true })
    .click();
  await expect(page.getByLabel("New password", { exact: true })).toHaveValue(
    "Synthetic-password-123!",
  );
  await page
    .getByRole("button", { name: "Back to sign in", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Discard changes?" })
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Forgot password?" }),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
});
