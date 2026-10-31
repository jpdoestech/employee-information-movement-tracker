import { test, expect } from "@playwright/test";
import { fillGovernmentIds } from "./profile-fixtures";
for (const [width, height] of [
  [375, 740],
  [768, 1024],
  [1366, 768],
  [812, 375],
]) {
  test(`personal and emergency addresses save independently at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    await page
      .getByRole("button", { name: "Add employee", exact: true })
      .click();
    const editor = page.getByRole("dialog", {
      name: "New employee",
      exact: true,
    });
    await editor
      .getByRole("textbox", { name: /^First Name(?: \*)?$/ })
      .fill("Address");
    await editor
      .getByRole("textbox", { name: /^Last Name(?: \*)?$/ })
      .fill("Independent");
    await fillGovernmentIds(editor);
    await editor
      .getByRole("tab", { name: "Personal Information", exact: true })
      .click();
    const home = editor.getByRole("group", {
      name: "Home Address",
      exact: true,
    });
    const current = editor.getByRole("group", {
      name: "Current Address",
      exact: true,
    });
    const emergency = editor.getByRole("group", {
      name: "Emergency Address",
      exact: true,
    });
    await home
      .getByLabel("Street / building", { exact: true })
      .fill("11 Home Lane");
    await current
      .getByLabel("Street / building", { exact: true })
      .fill("22 Current Lane");
    await emergency
      .getByLabel("Street / building", { exact: true })
      .fill("33 Emergency Lane");
    await emergency
      .getByRole("combobox", { name: "Barangay", exact: true })
      .fill("Agd");
    await page.getByRole("option", { name: /Agdao City of Davao/ }).click();
    await expect(
      emergency.getByRole("combobox", {
        name: "City / municipality",
        exact: true,
      }),
    ).toHaveValue("City of Davao");
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    const confirm = page.getByRole("dialog", {
      name: "Create employee",
      exact: true,
    });
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      emergency.getByLabel("Street / building", { exact: true }),
    ).toHaveValue("33 Emergency Lane");
    await expect(
      home.getByLabel("Street / building", { exact: true }),
    ).toHaveValue("11 Home Lane");
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    await confirm
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    await page
      .getByRole("searchbox", { name: "Search employees" })
      .fill("Independent");
    await page
      .getByRole("row")
      .filter({ hasText: "Independent, Address" })
      .getByRole("button")
      .first()
      .click();
    const profile = page.getByRole("dialog", {
      name: "Employee profile",
      exact: true,
    });
    await expect(profile).toContainText("11 Home Lane");
    await expect(profile).toContainText("22 Current Lane");
    await expect(profile).toContainText("33 Emergency Lane");
  });
}
