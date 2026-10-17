import { test, expect } from "@playwright/test";

test("renaming a standalone group updates its form tab and section", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#fields");
  await page
    .getByRole("button", {
      name: "Edit group Additional information",
      exact: true,
    })
    .click();
  const group = page.getByRole("dialog", { name: "Field group", exact: true });
  await group.getByLabel("Name", { exact: true }).fill("Client details");
  await group.getByRole("button", { name: "Save group", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Save field group", exact: true })
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await expect(group).toHaveCount(0);
  await page.goto("/#employees");
  await page.getByRole("button", { name: "Add employee", exact: true }).click();
  const employee = page.getByRole("dialog", {
    name: "New employee",
    exact: true,
  });
  await expect(
    employee.getByRole("tab", { name: "Additional information", exact: true }),
  ).toHaveCount(0);
  await employee
    .getByRole("tab", { name: "Client details", exact: true })
    .click();
  await expect(
    employee.getByRole("group", { name: "Client details", exact: true }),
  ).toBeVisible();
  await expect(
    employee.getByLabel("Example Field 1", { exact: true }),
  ).toBeVisible();
});
