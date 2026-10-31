import { expect, test } from "@playwright/test";

test("archiving the last page returns to the last valid page with correct ordinals", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#employees");
  const table = page.getByLabel("Scrollable employee table");
  await expect(table.locator("tbody tr")).toHaveCount(25);
  await page
    .getByRole("combobox", { name: "Rows per page", exact: true })
    .selectOption("10");
  for (const first of ["11", "21", "31"]) {
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(
      table.locator("tbody tr").first().locator("td").first(),
    ).toHaveText(first);
  }
  for (let remaining = 34; remaining > 30; remaining--) {
    await table.locator("tbody tr").first().getByRole("button").click();
    const editor = page.getByRole("dialog", {
      name: "Employee profile",
      exact: true,
    });
    await editor
      .getByRole("button", { name: "Archive employee", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Archive employee", exact: true })
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    await expect(page.locator(".pagination")).toContainText(
      `of ${remaining - 1}`,
    );
  }
  await expect(page.locator(".pagination")).toContainText("21–30 of 30");
  await expect(table.locator("tbody tr")).toHaveCount(10);
  await expect(
    table.locator("tbody tr").first().locator("td").first(),
  ).toHaveText("21");
  await expect(
    page.getByRole("button", { name: "Next page", exact: true }),
  ).toBeDisabled();
});
