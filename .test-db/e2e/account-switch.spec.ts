import { test, expect } from "@playwright/test";
test("signing out clears the previous email and password before switching accounts", async ({
  page,
}) => {
  await page.goto("/");
  const context = await page.evaluate(async () => {
    const path = "/src/demo.ts";
    return (await import(path)).demoQuery("context");
  });
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "first@example.test",
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: "2026-01-01T00:00:00Z",
  };
  context.profile.id = user.id;
  const encode = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic`;
  const logins: any[] = [];
  await page.route(/^https:\/\/[^/]+\.supabase\.co\//, async (route) => {
    const req = route.request();
    if (req.url().includes("/token")) {
      logins.push(req.postDataJSON());
      return route.fulfill({
        json: {
          access_token: token,
          refresh_token: "synthetic-refresh",
          expires_in: 3600,
          token_type: "bearer",
          user,
        },
      });
    }
    if (req.url().includes("/auth/v1/user"))
      return route.fulfill({ json: user });
    if (req.url().includes("/logout")) return route.fulfill({ status: 204 });
    const body = req.method() === "POST" ? req.postDataJSON() : {};
    return route.fulfill({
      json: req.url().includes("/register_settings")
        ? context.register_settings
        : body.operation === "context"
          ? context
          : body.operation === "employees"
            ? { items: [], total: 0 }
            : body.operation === "dashboard"
              ? { total: 0, statuses: {}, placements: {} }
              : [],
    });
  });
  await page.getByLabel("Email address", { exact: true }).fill(user.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Synthetic-first-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("second@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Synthetic-second-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect.poll(() => logins.length).toBe(2);
  expect(logins[1]).toMatchObject({
    email: "second@example.test",
    password: "Synthetic-second-password-123",
  });
});
