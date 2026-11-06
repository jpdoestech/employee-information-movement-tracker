import { expect, test, type Page } from "@playwright/test";

async function start(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#employees");
  await page
    .getByRole("button", { name: "Import employees", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Import employees", exact: true });
}
for (const [width, height] of [
  [375, 740],
  [768, 1024],
  [1366, 768],
  [812, 375],
]) {
  test(`CSV import preview, fixed headers, cancellation and confirmed save at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const dialog = await start(page);
    const before = await page.evaluate(async () =>
      (await import("/src/demo.ts" as string)).demoQuery("dashboard"),
    );
    await dialog
      .getByLabel("Excel or CSV file")
      .setInputFiles({
        name: "employees.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          "last_name,first_name,remarks\r\n" +
            Array.from(
              { length: 20 },
              (_, i) =>
                `  Test Import  ,  User ${i}  ,\"${"notes ".repeat(45)}\"`,
            ).join("\r\n"),
        ),
      });
    const region = dialog.getByRole("region", {
      name: "Employee import preview",
    });
    await expect(
      region.getByRole("cell", { name: "TEST IMPORT", exact: true }),
    ).toHaveCount(20);
    await dialog
      .getByRole("button", { name: "Validate import", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Import 20 employees", exact: true }),
    ).toBeEnabled();
    expect(
      await page.evaluate(async () =>
        (await import("/src/demo.ts" as string)).demoQuery("dashboard"),
      ),
    ).toEqual(before);
    const initial = await region.locator("thead").boundingBox();
    await region.evaluate((el) => {
      el.scrollTop = 150;
      el.scrollLeft = 100;
    });
    const after = await region.locator("thead").boundingBox();
    // Individual header cells are sticky; the semantic thead may retain its flow position.
    const head = await region.getByRole("columnheader").first().boundingBox();
    const bounds = await region.boundingBox();
    expect(head!.y).toBeGreaterThanOrEqual(bounds!.y - 1);
    expect(initial).toBeTruthy();
    expect(after).toBeTruthy();
    await page.screenshot({
      path: `.test-db/reports/release/employee-import-${width}x${height}.png`,
    });
    const modalBounds = await dialog.boundingBox();
    expect(modalBounds!.x).toBeGreaterThanOrEqual(0);
    expect(modalBounds!.y).toBeGreaterThanOrEqual(0);
    expect(modalBounds!.y + modalBounds!.height).toBeLessThanOrEqual(
      height + 1,
    );
    await dialog
      .getByRole("button", { name: "Import 20 employees", exact: true })
      .click();
    const confirmation = page
      .getByRole("dialog", { name: "Import employees", exact: true })
      .filter({
        has: page.getByRole("button", { name: "Continue", exact: true }),
      });
    await confirmation
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    expect(
      await page.evaluate(async () =>
        (await import("/src/demo.ts" as string)).demoQuery("dashboard"),
      ),
    ).toEqual(before);
    await expect(
      region.getByRole("cell", { name: "TEST IMPORT", exact: true }),
    ).toHaveCount(20);
    await dialog
      .getByRole("button", { name: "Import 20 employees", exact: true })
      .click();
    await confirmation
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    const total = await page.evaluate(async () =>
      (await import("/src/demo.ts" as string)).demoQuery("dashboard"),
    );
    expect(total.total).toBe(before.total + 20);
  });
}
test("real XLSX file preserves text IDs and supports dates and name case", async ({
  page,
}) => {
  const dialog = await start(page);
  await dialog
    .getByLabel("Excel or CSV file")
    .setInputFiles(".test-db/fixtures/employee-import.xlsx");
  const region = dialog.getByRole("region", {
    name: "Employee import preview",
  });
  await expect(
    region.getByRole("cell", { name: "MCDONALD", exact: true }),
  ).toBeVisible();
  await expect(
    region.getByRole("cell", { name: "2000-01-02", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Name case", exact: true }).click();
  await page.getByRole("option", { name: "USER DEFINED", exact: true }).click();
  await expect(
    region.getByRole("cell", { name: "McDonald", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Validate import", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Import 1 employee", exact: true }),
  ).toBeEnabled();
});
test("invalid columns block validation; closing preserves a file draft until discard", async ({
  page,
}) => {
  const dialog = await start(page);
  await dialog
    .getByLabel("Excel or CSV file")
    .setInputFiles({
      name: "bad.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "last_name,first_name,secret_not_authorized\nSantos,Maria,value",
      ),
    });
  await expect(dialog.getByRole("alert")).toContainText("unavailable");
  await expect(
    dialog.getByRole("button", { name: "Validate import", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  const discard = page.getByRole("dialog", {
    name: "Discard unsaved changes?",
    exact: true,
  });
  await discard
    .getByRole("button", { name: "Continue editing", exact: true })
    .click();
  await expect(dialog).toContainText("bad.csv");
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await discard
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
});
