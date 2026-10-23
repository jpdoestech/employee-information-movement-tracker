import { fillGovernmentIds } from "./profile-fixtures";
import { test, expect, type Page } from "@playwright/test";

async function enter(page: Page, route: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto(`/#${route}`);
}

for (const [width, height] of [
  [320, 740],
  [768, 1024],
  [1440, 900],
  [812, 375],
]) {
  test(`shared record explorers remain bounded at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await enter(page, "organization");
    for (const [route, region] of [
      ["organization", "Organization records"],
      ["movements", "Movement records"],
      ["audit", "Audit records"],
    ]) {
      await page.goto(`/#${route}`);
      const table = page.getByRole("region", { name: region });
      await expect(table).toBeVisible();
      await expect(page.locator(".record-explorer .pagination")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      const bounds = (await page.locator(".record-explorer").boundingBox())!;
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(height + 1);
      const footer = (await page
        .locator(".record-explorer .pagination")
        .boundingBox())!;
      expect(footer.y + footer.height).toBeLessThanOrEqual(height + 1);
      const search = (await page
        .locator(".record-explorer .search-control")
        .boundingBox())!;
      expect(search.height).toBe(width > 760 ? 36 : 44);
      const reset = (await page
        .getByRole("button", { name: "Reset filters", exact: true })
        .boundingBox())!;
      if (width > 760) {
        expect(
          Math.abs(search.y + search.height / 2 - reset.y - reset.height / 2),
        ).toBeLessThanOrEqual(1);
      }
      await page
        .getByRole("button", { name: "More filters", exact: true })
        .click();
      const modal = page.getByRole("dialog", {
        name: "More filters",
        exact: true,
      });
      await expect(modal).toBeVisible();
      const box = (await modal.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
      await page.screenshot({
        path: `.test-db/reports/screenshots/${route}-${width}.png`,
      });
      await modal.getByRole("button", { name: "Close More filters" }).click();
    }
  });
}

test("movement employee search reaches records beyond the loaded employee page", async ({
  page,
}) => {
  await enter(page, "movements");
  await page
    .getByRole("button", { name: "New transaction", exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: "New movement transaction",
    exact: true,
  });
  await editor.getByRole("button", { name: "Employee", exact: true }).click();
  const employees = page.getByRole("dialog", {
    name: "Employee options",
    exact: true,
  });
  await employees.getByRole("combobox").fill("Synthetic Employee 34");
  await employees
    .getByRole("option", { name: /Synthetic Employee 34/ })
    .click();
  await expect(
    editor.getByRole("button", { name: "Employee", exact: true }),
  ).toContainText("Synthetic Employee 34");
  await editor
    .getByRole("button", { name: "Movement type", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Movement type options", exact: true })
    .getByRole("option", { name: /Position/ })
    .click();
  await editor
    .getByLabel("New position", { exact: true })
    .fill("Senior Analyst");
  await editor
    .getByLabel("Reason", { exact: true })
    .fill("Synthetic promotion verification");
  await editor
    .getByRole("button", { name: "Preview transaction", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Confirm transaction", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Record movement", exact: true })
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  await page
    .getByRole("searchbox", { name: "Search movements" })
    .fill("Synthetic Employee 34");
  await expect(
    page.getByRole("region", { name: "Movement records" }).locator("tbody tr"),
  ).toHaveCount(1);
  await expect(
    page.getByRole("region", { name: "Movement records" }),
  ).toContainText("Synthetic promotion verification");
  const movementRow = page
    .getByRole("region", { name: "Movement records" })
    .locator("tbody tr")
    .first();
  await expect(
    page.getByRole("columnheader", { name: "From", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "To", exact: true }),
  ).toBeVisible();
  await expect(movementRow.locator("td").nth(2)).toHaveText("Coordinator");
  await expect(movementRow.locator("td").nth(3)).toHaveText("Senior Analyst");
  expect((await movementRow.boundingBox())!.height).toBe(44);
  const correction = movementRow.getByRole("button", {
    name: "Void / correct",
    exact: true,
  });
  await expect(correction).toBeVisible();
  expect(
    await correction.evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: ".test-db/reports/verification/movement-list-desktop.png",
  });
  await page.setViewportSize({ width: 375, height: 740 });
  expect((await movementRow.boundingBox())!.height).toBe(52);
  await page.goto("/#audit");
  await expect(
    page.getByRole("region", { name: "Audit records" }),
  ).toContainText("movement");
});

test("client creation prefix produces separate System and Client-based IDs", async ({
  page,
}) => {
  await enter(page, "organization");
  await page
    .getByRole("button", { name: "Add organization", exact: true })
    .click();
  const org = page.getByRole("dialog", {
    name: "Add organization",
    exact: true,
  });
  await org
    .getByRole("button", { name: "Organization type", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Organization type options", exact: true })
    .getByRole("option", { name: "Client", exact: true })
    .click();
  await org.getByRole("button", { name: "Parent branch", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Parent branch options", exact: true })
    .getByRole("option", { name: /Example North Branch/ })
    .click();
  await org.getByLabel(/^Client code/).fill("com");
  await org.getByLabel("Name", { exact: true }).fill("COMPANY ABC");
  await org
    .getByRole("button", { name: "Save organization", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Save organization", exact: true })
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await expect(org).toHaveCount(0);
  await page.goto("/#employees");
  for (const n of [1, 2]) {
    await page
      .getByRole("button", { name: "Add employee", exact: true })
      .click();
    const employee = page.getByRole("dialog", {
      name: "New employee",
      exact: true,
    });
    await employee
      .getByRole("button", { name: "Initial organization", exact: true })
      .click();
    await page
      .getByRole("dialog", {
        name: "Initial organization options",
        exact: true,
      })
      .getByRole("option", { name: /COMPANY ABC/ })
      .click();
    await employee
      .getByLabel("First Name", { exact: false })
      .fill(`Client identity sample ${n}`);
    await employee.getByLabel("Last Name", { exact: false }).fill("Test");
    await fillGovernmentIds(employee);
    await employee
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Create employee", exact: true })
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(employee).toHaveCount(0);
    await page
      .getByRole("searchbox", { name: "Search employees" })
      .fill(`Client identity sample ${n}`);
    const table = page.getByLabel("Scrollable employee table");
    await expect(table).toContainText(`COM-0000${n}`);
    await expect(table).toContainText("EMP-");
  }
});
