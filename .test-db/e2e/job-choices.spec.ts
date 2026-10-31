import { test, expect } from "@playwright/test";

for (const [width, height] of [
  [1440, 900],
  [390, 844],
  [768, 1024],
  [844, 390],
  [320, 740],
]) {
  test(`shared job choices allow temporary entry and import linking at ${width}x${height}`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#fields");
    for (const [field, choices] of [
      ["Department", "PRODUCTION\nWAREHOUSE"],
      ["Position", "FINISHER\nWAREHOUSEMAN"],
    ]) {
      await page
        .getByRole("button", { name: `Manage ${field} choices`, exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: `Official ${field} choices`,
        exact: true,
      });
      await dialog
        .getByLabel("Official choices (one per line)", { exact: true })
        .fill(choices);
      await dialog
        .getByRole("button", { name: "Save choices", exact: true })
        .click();
      const confirm = page.getByRole("dialog", {
        name: "Save official job choices",
        exact: true,
      });
      if (field === "Department") {
        await confirm
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
        await expect(
          dialog.getByLabel("Official choices (one per line)"),
        ).toHaveValue(choices);
        await dialog
          .getByRole("button", { name: "Save choices", exact: true })
          .click();
      }
      await confirm
        .getByRole("button", { name: "Continue", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
    }
    await page.goto("/#employees");
    await page
      .getByRole("button", { name: "Add employee", exact: true })
      .click();
    const employee = page.getByRole("dialog", {
      name: "New employee",
      exact: true,
    });
    await employee
      .getByRole("textbox", { name: /^Last Name(?: \*)?$/ })
      .fill("JOBCATALOG");
    await employee
      .getByRole("textbox", { name: /^First Name(?: \*)?$/ })
      .fill("QUARTZ");
    await employee
      .getByRole("tab", { name: "Employment Details", exact: true })
      .click();
    await expect(employee).toContainText(
      "Select the client in Initial organization",
    );
    await expect(
      employee.getByRole("button", { name: "PRF No.", exact: true }),
    ).toBeDisabled();
    await employee
      .getByRole("textbox", { name: "Department", exact: true })
      .fill("production");
    await expect(employee).toContainText("Temporary entry.");
    await employee
      .getByRole("button", {
        name: "Use official spelling PRODUCTION",
        exact: true,
      })
      .click();
    await expect(
      employee.getByRole("textbox", { name: "Department", exact: true }),
    ).toHaveValue("PRODUCTION");
    await employee
      .getByRole("textbox", { name: "Position", exact: true })
      .fill("Temporary specialist");
    await expect(employee).toContainText("Saving is allowed.");
    for (const name of ["Department", "Position"]) {
      const input = employee.getByRole("textbox", { name, exact: true });
      const chooser = employee.getByRole("button", {
        name: `Choose existing ${name}`,
        exact: true,
      });
      const inputBox = (await input.boundingBox())!;
      const chooserBox = (await chooser.boundingBox())!;
      expect(inputBox.width).toBeGreaterThan(150);
      expect(chooserBox.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height);
      expect(chooserBox.x + chooserBox.width).toBeLessThanOrEqual(
        inputBox.x + inputBox.width + 1,
      );
    }
    expect(
      await employee.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.test-db/reports/screenshots/job-choices-${width}x${height}.png`,
    });
    await employee.getByRole("button", { name: "Save", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Create employee", exact: true })
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(employee).toHaveCount(0);
    await page
      .getByRole("button", { name: "Import employees", exact: true })
      .click();
    const importer = page.getByRole("dialog", {
      name: "Import employees",
      exact: true,
    });
    await importer.locator('input[type="file"]').setInputFiles({
      name: "temporary-jobs.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "last_name,first_name,department,position\nJOBCATALOG,LANTERN,production,Incoming specialist\n",
      ),
    });
    await importer.getByText(/Review Department \/ Position names/).click();
    await expect(importer).toContainText("can be imported without blocking");
    await importer
      .getByRole("button", { name: "Link Department: production", exact: true })
      .click();
    const picker = page.getByRole("dialog", {
      name: "Link Department: production options",
      exact: true,
    });
    const bounds = (await picker.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
    await picker
      .getByRole("option", { name: "PRODUCTION", exact: true })
      .click();
    await expect(importer.getByRole("table")).toContainText("PRODUCTION");
    await expect(importer).toContainText("1 temporary job name");
    await page.screenshot({
      path: `.test-db/reports/screenshots/job-import-${width}x${height}.png`,
    });
    await importer
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Discard unsaved changes?", exact: true })
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
  });
}
