import { test, expect } from "@playwright/test";

for (const [width, height] of [
  [1440, 900],
  [390, 844],
  [768, 1024],
  [844, 390],
  [320, 740],
]) {
  test(`multiple PRF job requirements and employee assignment fit ${width}x${height}`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page
      .getByRole("button", { name: "Staffing / PRFs", exact: true })
      .click();
    const list = page.getByRole("dialog", {
      name: "Client staffing / PRFs",
      exact: true,
    });
    await list.getByRole("button", { name: "Add PRF", exact: true }).click();
    const prf = page.getByRole("dialog", {
      name: "Add staffing PRF",
      exact: true,
    });
    await prf.getByLabel("PRF No.", { exact: true }).fill("PRF-MULTI-UI");
    await prf.getByRole("button", { name: "PRF client", exact: true }).click();
    await page
      .getByRole("dialog", { name: "PRF client options", exact: true })
      .getByRole("option")
      .first()
      .click();
    await prf
      .getByRole("button", { name: "PRF Employment Type", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "PRF Employment Type options", exact: true })
      .getByRole("option", { name: "Regular", exact: true })
      .click();
    await prf.getByLabel("Department", { exact: true }).fill("Operations");
    await prf
      .getByLabel("Position required", { exact: true })
      .fill("Coordinator");
    await prf.getByLabel("Required headcount", { exact: true }).fill("2");
    await prf
      .getByRole("button", { name: "Add requirement", exact: true })
      .click();
    const second = prf.getByRole("group", {
      name: "Requirement 2",
      exact: true,
    });
    await second.getByLabel("Department", { exact: true }).fill("Finance");
    await second
      .getByLabel("Position required", { exact: true })
      .fill("Bookkeeper");
    await expect(prf).toContainText("Total required: 3");
    expect(
      await prf.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await prf.getByRole("button", { name: "Save PRF", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Save staffing PRF", exact: true })
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(prf).toHaveCount(0);
    await expect(list).toContainText("Operations / Coordinator");
    await expect(list).toContainText("Finance / Bookkeeper");
    await list
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    for (const [first, job, department] of [
      ["LANTERN", "Coordinator", "Operations"],
      ["CYPRESS", "Bookkeeper", "Finance"],
    ]) {
      await page.goto("/#employees");
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
        .getByRole("option", { name: /Example Client/ })
        .first()
        .click();
      await employee
        .getByRole("textbox", { name: /^Last Name(?: \*)?$/ })
        .fill("PRFTEST");
      await employee
        .getByRole("textbox", { name: /^First Name(?: \*)?$/ })
        .fill(first);
      await employee
        .getByRole("tab", { name: "Employment Details", exact: true })
        .click();
      await employee
        .getByRole("button", { name: "PRF No.", exact: true })
        .click();
      const picker = page.getByRole("dialog", {
        name: "PRF No. options",
        exact: true,
      });
      await picker.getByRole("option", { name: new RegExp(job) }).click();
      await expect(
        employee.getByLabel("Department", { exact: true }),
      ).toHaveValue(department);
      await expect(
        employee.getByLabel("Position", { exact: true }),
      ).toHaveValue(job);
      await page.screenshot({
        path: `.test-db/reports/screenshots/prf-employee-${width}x${height}.png`,
      });
      await employee.getByRole("button", { name: "Save", exact: true }).click();
      await page
        .getByRole("dialog", { name: "Create employee", exact: true })
        .getByRole("button", { name: "Continue", exact: true })
        .click();
      await expect(employee).toHaveCount(0);
    }
    await page.goto("/#dashboard");
    await expect(page.locator(".analytics-stats .stat").nth(1)).toContainText(
      "66.7%",
    );
    await expect(page.locator(".analytics-stats .stat").nth(1)).toContainText(
      "2 filled / 3 required today",
    );
  });
}
