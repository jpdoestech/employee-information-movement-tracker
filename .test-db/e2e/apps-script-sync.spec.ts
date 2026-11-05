import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function connectedWorkbook(page: Page, syncGate?: Promise<void>) {
  await page.goto("/");
  const context = await page.evaluate(async () => {
    const path = "/src/demo.ts";
    return (await import(path)).demoQuery("context");
  });
  const actor = {
    id: context.profile.id,
    aud: "authenticated",
    role: "authenticated",
    email: "owner@example.test",
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: "2026-01-01T00:00:00Z",
  };
  const book = {
    id: "11111111-1111-4111-8111-111111111111",
    branch_id: null,
    spreadsheet_id: null,
    allowed_fields: ["employee_number"],
    allowed_clients: [],
    include_branch: true,
    sharing_emails: [],
    approved: false,
    row_version: 1,
    status: "Suspended",
    last_error:
      "A person with Drive access is missing from this workbook's approved sharing emails.",
  };
  const writes: any[] = [];
  await page.route(/^https:\/\/[^/]+\.supabase\.co\//, async (route) => {
    if (route.request().url().includes("/auth/v1/user"))
      return route.fulfill({ json: actor });
    const body =
      route.request().method() === "POST" ? route.request().postDataJSON() : {};
    if (route.request().url().includes("/tracker_mutate")) {
      writes.push(body);
      return route.fulfill({ json: { id: book.id } });
    }
    if (body.operation === "sync") await syncGate;
    return route.fulfill({
      json: route.request().url().includes("/register_settings")
        ? context.register_settings
        : body.operation === "context"
          ? context
          : body.operation === "sync"
            ? { workbooks: [book], connected: true, pending: 0 }
            : body.operation === "employees"
              ? { items: [], total: 0 }
              : body.operation === "dashboard"
                ? { total: 0, statuses: {}, placements: {} }
                : [],
    });
  });
  const enc = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: actor.id, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic`;
  await page.goto(
    `/#access_token=${token}&refresh_token=synthetic&expires_in=3600&token_type=bearer&type=signup`,
  );
  await page.reload();
  await page.goto("/#sync");
  await expect(
    page.getByRole("status").filter({ hasText: "A person with Drive access" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review export policy" }).click();
  return {
    writes,
    dialog: page.getByRole("dialog", {
      name: "Workbook export policy",
      exact: true,
    }),
  };
}

test("loading status never reports a configured Google connection as disconnected", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const ready = connectedWorkbook(page, gate);
  await expect(page.getByText("Loading sync status…", { exact: true })).toBeVisible();
  await expect(page.getByText("Google account not connected", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Workbooks are provisioned/)).toHaveCount(0);
  release();
  const { writes } = await ready;
  await expect(page.getByText("Google connection configured", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(0);
});

for (const [width, height] of [
  [1440, 900],
  [390, 844],
  [768, 1024],
  [812, 375],
]) {
  test(`Apps Script setup instructions remain readable at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#sync");
    await expect(
      page.getByText(/the workbook owner runs setupTrackerSync once/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Connect personal Google account" }),
    ).toHaveCount(0);
    const reconcile = page.getByRole("button", {
      name: "Reconcile approved workbooks",
    });
    await expect(reconcile).toBeVisible();
    await reconcile.focus();
    await expect(reconcile).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.test-db/reports/apps-script-sync-${width}.png`,
      fullPage: true,
    });
  });
}

for (const [width, height] of [
  [1440, 900],
  [390, 844],
  [768, 1024],
  [812, 375],
]) {
  test(`owned spreadsheet mapping preserves confirmation and drafts at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { writes, dialog } = await connectedWorkbook(page);
    await expect(dialog).toBeVisible();
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height + 1);
    const input = dialog.getByRole("textbox", {
      name: "Google Sheets URL or spreadsheet ID",
    });
    await input.fill(
      "https://docs.google.com/spreadsheets/d/user_owned_sheet-123/edit",
    );
    await dialog
      .getByRole("textbox", { name: "Policy reason" })
      .fill("Synthetic workbook mapping");
    await dialog.getByRole("button", { name: "Save export policy" }).click();
    // The shared mutation confirmation must remain above the editor.
    const confirmation = page.locator(".transaction-confirmation");
    await expect(confirmation).toBeVisible();
    await expect(input).toBeDisabled();
    await expect(dialog.getByRole("textbox", { name: "Policy reason" })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Approved non-sensitive columns", exact: true })).toBeDisabled();
    expect(writes).toHaveLength(0);
    await confirmation
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await expect(input).toHaveValue(
      "https://docs.google.com/spreadsheets/d/user_owned_sheet-123/edit",
    );
    await expect(input).toBeEnabled();
    expect(writes).toHaveLength(0);
    await dialog.getByRole("button", { name: "Save export policy" }).click();
    await confirmation
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    expect(writes).toHaveLength(1);
    expect(writes[0].p.target_spreadsheet_id).toBe("user_owned_sheet-123");
  });
}
