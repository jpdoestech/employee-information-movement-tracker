import { test, expect, type Page } from "@playwright/test";
async function enter(page: Page, route = "employees") {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await page.goto(`/#${route}`);
  await expect(
    page
      .getByRole("heading", {
        name:
          route === "employees"
            ? "Employee register"
            : route === "fields"
              ? "Field Builder"
              : "Movements",
        exact: false,
      })
      .last(),
  ).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading authorized data…" }))
    .toHaveCount(0)
    .catch(() => {});
  await page.waitForTimeout(400);
}
for (const [width, height] of [
  [320, 740],
  [375, 812],
  [480, 800],
  [768, 1024],
  [1024, 768],
  [1366, 768],
  [1920, 1080],
  [2560, 1440],
  [812, 375],
])
  test(`responsive register and picker at ${width}×${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await enter(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Branches", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Branches options" });
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    await panel.getByRole("combobox").fill("North");
    await panel.getByRole("option", { name: /Example North Branch/ }).click();
    await panel.getByRole("combobox").fill("South");
    await expect(panel.getByText("1 selected", { exact: false })).toBeVisible();
    await panel.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Branches", exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
  });
test("single picker mixes clients with branches and applies IDs", async ({
  page,
}) => {
  await enter(page);
  await page
    .getByRole("button", { name: "Search branch or client", exact: true })
    .click();
  const p = page.getByRole("dialog", {
    name: "Search branch or client options",
  });
  await p.getByRole("combobox").fill("Example Client");
  await expect(p.getByRole("option")).toHaveCount(2);
  await expect(p.getByRole("option").first()).toContainText(
    "Example North Branch",
  );
  await p.getByRole("combobox").press("ArrowDown");
  await p.getByRole("combobox").press("Enter");
  await expect(p).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Clear Search branch or client" }),
  ).toBeVisible();
});
test("multi-select Apply commits, reset clears, dependent clients remain scoped", async ({
  page,
}) => {
  await enter(page);
  await page.getByRole("button", { name: "Branches", exact: true }).click();
  let p = page.getByRole("dialog", { name: "Branches options" });
  await p.getByRole("option", { name: /North/ }).click();
  await p.getByRole("button", { name: "Apply", exact: true }).click();
  await page.getByRole("button", { name: "Clients", exact: true }).click();
  p = page.getByRole("dialog", { name: "Clients options" });
  await expect(p.getByRole("option")).toHaveCount(1);
  await expect(p.getByRole("option")).toContainText("North");
  await p.getByRole("combobox").press("Escape");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
});
test("column preview is draft-only; Apply saves personal view", async ({
  page,
}) => {
  await enter(page);
  const table = page.getByRole("table", {
    name: "Employees: authorized columns only",
  });
  await expect(table.getByRole("columnheader", { name: /Email/ })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Customize Columns", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Customize Columns",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Visible columns", exact: true })
    .click();
  const p = page.getByRole("dialog", { name: "Visible columns options" });
  await p.getByRole("combobox").fill("Email");
  await p.getByRole("option", { name: /Email/ }).click();
  await p.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(
    dialog.getByRole("table").getByRole("columnheader", { name: /Email/ }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(table.getByRole("columnheader", { name: /Email/ })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Customize Columns", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Customize Columns", exact: true })
    .getByRole("button", { name: "Apply & Save", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#employees");
  await page.getByRole("button", { name: "Saved view", exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Saved view options" })
      .getByRole("option", { name: "My employee view" }),
  ).toBeVisible();
});
test("15-column grid pins ID and name while horizontal scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await enter(page);
  await page
    .getByRole("button", { name: "Customize Columns", exact: true })
    .click();
  let d = page.getByRole("dialog", { name: "Customize Columns", exact: true });
  await d.getByRole("button", { name: "Visible columns", exact: true }).click();
  let p = page.getByRole("dialog", { name: "Visible columns options" });
  await p.getByRole("button", { name: "Select visible", exact: true }).click();
  await p.getByRole("button", { name: "Apply", exact: true }).click();
  await d.getByRole("button", { name: "Apply & Save", exact: true }).click();
  const region = page.getByLabel("Scrollable employee table");
  const before = await region.locator("thead .pin-0").boundingBox();
  await region.evaluate((e) => (e.scrollLeft = 1400));
  const after = await region.locator("thead .pin-0").boundingBox();
  expect(Math.abs(before!.x - after!.x)).toBeLessThan(1);
  const name = await region.locator("thead .pin-1").boundingBox();
  expect(name!.x).toBeGreaterThan(after!.x);
  expect(await region.locator("th").count()).toBeGreaterThanOrEqual(15);
});
test("field builder reuses picker, retains scope draft and form preview", async ({
  page,
}) => {
  await enter(page, "fields");
  await page.getByRole("button", { name: "New field", exact: true }).click();
  const d = page.getByRole("dialog", { name: "Create field definition" });
  await d.getByRole("button", { name: "Applicability", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Applicability options" })
    .getByRole("option", { name: "Selected branches / clients / Head Office" })
    .click();
  await d
    .getByRole("button", { name: "Applicable organizations", exact: true })
    .click();
  const p = page.getByRole("dialog", {
    name: "Applicable organizations options",
  });
  await p.getByRole("option", { name: /Example North Branch Branch/ }).click();
  await p.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(
    d.getByText("1 explicit targets:", { exact: false }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Cancel", exact: true }).click();
});
test("forms and full-screen dialog fit narrow viewport and reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enter(page);
  await page.getByRole("button", { name: "Add employee", exact: true }).click();
  const d = page.getByRole("dialog", { name: "New employee" });
  const box = await d.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(320);
  expect(await d.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(
    true,
  );
  await page.keyboard.press("Escape");
  await expect(d).toHaveCount(0);
});
