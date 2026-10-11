import { test, expect, type Page } from "@playwright/test";
async function editor(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#employees");
  await page.getByRole("button", { name: "Add employee", exact: true }).click();
  return page.getByRole("dialog", { name: "New employee", exact: true });
}
async function agdao(page: Page) {
  const home = page.getByRole("group", { name: "Home Address", exact: true });
  await home
    .getByRole("combobox", { name: "Barangay", exact: true })
    .fill("Agd");
  const list = page.getByRole("listbox", { name: "Barangay suggestions" });
  await expect(list).toBeVisible();
  await expect(
    list.getByRole("option", { name: /Agdao City of Davao/ }),
  ).toBeVisible();
  await list.getByRole("option", { name: /Agdao City of Davao/ }).click();
  return home;
}
test("nationwide barangay resolves parents, preserves manual values and resets dependencies", async ({
  page,
}) => {
  await editor(page);
  const home = page.getByRole("group", { name: "Home Address", exact: true });
  await home
    .getByLabel("Street / building", { exact: true })
    .fill("12 Test Street");
  await home.getByLabel("Postal code", { exact: true }).fill("9999");
  await home
    .getByRole("combobox", { name: "Barangay", exact: true })
    .fill("Agd");
  const list = page.getByRole("listbox", { name: "Barangay suggestions" });
  await expect(list.getByRole("option", { name: /Agdao/ })).toHaveCount(3);
  await list.getByRole("option", { name: /Agdao City of Davao/ }).click();
  await expect(
    home.getByRole("combobox", { name: "Province", exact: true }),
  ).toHaveValue("Davao del Sur");
  await expect(
    home.getByRole("combobox", { name: "City / municipality", exact: true }),
  ).toHaveValue("City of Davao");
  await expect(
    home.getByRole("combobox", { name: "Region", exact: true }),
  ).not.toHaveValue("");
  await home
    .getByRole("combobox", { name: "City / municipality", exact: true })
    .fill("Caloocan");
  await home
    .getByRole("combobox", { name: "City / municipality", exact: true })
    .press("Enter");
  await expect(
    home.getByRole("combobox", { name: "Province", exact: true }),
  ).toHaveValue("");
  await expect(
    home.getByRole("combobox", { name: "Barangay", exact: true }),
  ).toHaveValue("");
  await home
    .getByRole("combobox", { name: "Province", exact: true })
    .fill("Pangasinan");
  await home
    .getByRole("combobox", { name: "Province", exact: true })
    .press("Enter");
  await expect(
    home.getByRole("combobox", { name: "City / municipality", exact: true }),
  ).toHaveValue("");
  await home
    .getByRole("combobox", { name: "Region", exact: true })
    .fill("Davao");
  await home
    .getByRole("combobox", { name: "Region", exact: true })
    .press("Enter");
  await expect(
    home.getByRole("combobox", { name: "Province", exact: true }),
  ).toHaveValue("");
  await expect(
    home.getByLabel("Street / building", { exact: true }),
  ).toHaveValue("12 Test Street");
  await expect(home.getByLabel("Postal code", { exact: true })).toHaveValue(
    "9999",
  );
});
test("unconfirmed typed text blocks saving and Escape closes only suggestions", async ({
  page,
}) => {
  const dialog = await editor(page);
  await dialog
    .getByLabel("Employee Name", { exact: false })
    .fill("Address Test");
  const home = page.getByRole("group", { name: "Home Address", exact: true });
  const input = home.getByRole("combobox", { name: "Province", exact: true });
  await input.fill("Imaginary");
  await input.press("Tab");
  await expect(
    home.getByText("Choose a province from the official list."),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Save to Supabase" }),
  ).toBeDisabled();
  await input.focus();
  await input.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await input.fill("");
  await expect(
    dialog.getByRole("button", { name: "Save to Supabase" }),
  ).toBeEnabled();
});
test("load failure supports retry without retyping and stale searches cannot replace results", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/barangay-search-index.json*", async (route) => {
    requests++;
    if (requests === 1) await route.fulfill({ status: 503, body: "offline" });
    else await route.continue();
  });
  await editor(page);
  const home = page.getByRole("group", { name: "Home Address", exact: true });
  await home
    .getByRole("combobox", { name: "Barangay", exact: true })
    .fill("Agd");
  await page.getByRole("button", { name: "Retry loading locations" }).click();
  await expect(
    page.getByRole("option", { name: /Agdao City of Davao/ }),
  ).toBeVisible();
  expect(requests).toBe(2);
  await home
    .getByRole("combobox", { name: "Barangay", exact: true })
    .fill("DefinitelyAbsent");
  await expect(
    page.getByText("No matching locations.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(0);
});
test("addresses and emergency contact save through confirmation and edit existing names", async ({
  page,
}) => {
  const dialog = await editor(page);
  await dialog
    .getByLabel("Employee Name", { exact: false })
    .fill("Address Saved Test");
  await agdao(page);
  const current = page.getByRole("group", {
    name: "Current Address",
    exact: true,
  });
  await current
    .getByRole("combobox", { name: "City / municipality", exact: true })
    .fill("Caloocan");
  await current
    .getByRole("combobox", { name: "City / municipality", exact: true })
    .press("Enter");
  await current
    .getByLabel("Street / building", { exact: true })
    .fill("Current Test Street");
  await dialog
    .getByLabel("Emergency contact name", { exact: true })
    .fill("Sample Guardian");
  await dialog
    .getByRole("button", {
      name: "Emergency contact relationship",
      exact: true,
    })
    .click();
  await page.getByRole("option", { name: "Guardian", exact: true }).click();
  await dialog.getByRole("button", { name: "Save to Supabase" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("searchbox", { name: "Search employees" })
    .fill("Address Saved Test");
  await page
    .getByRole("row")
    .filter({ hasText: "Address Saved Test" })
    .getByRole("button")
    .first()
    .click();
  const profile = page.getByRole("dialog", {
    name: "Employee profile",
    exact: true,
  });
  await expect(
    profile
      .getByRole("group", { name: "Home Address", exact: true })
      .getByRole("combobox", { name: "Barangay", exact: true }),
  ).toHaveValue("Agdao");
  await expect(
    profile
      .getByRole("group", { name: "Current Address", exact: true })
      .getByRole("combobox", { name: "City / municipality", exact: true }),
  ).toHaveValue("City of Caloocan");
  await expect(
    profile
      .getByRole("group", { name: "Current Address", exact: true })
      .getByLabel("Street / building", { exact: true }),
  ).toHaveValue("Current Test Street");
});
for (const [width, height] of [
  [320, 740],
  [768, 1024],
  [1366, 768],
  [812, 375],
])
  test(`address suggestions fit ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const dialog = await editor(page);
    await agdao(page);
    const home = page.getByRole("group", { name: "Home Address", exact: true });
    await home
      .getByRole("combobox", { name: "Province", exact: true })
      .fill("Davao");
    const list = page.getByRole("listbox", { name: "Province suggestions" });
    await expect(list).toBeVisible();
    const bounds = await list.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height + 1);
    expect(
      await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({
      path: `.test-db/results/address-${width}x${height}.png`,
    });
  });

test("debounced concurrent searches share loading and ignore obsolete results", async ({
  page,
}) => {
  let requests = 0;
  let releaseIndex!: () => void;
  const indexResponse = new Promise<void>((resolve) => {
    releaseIndex = resolve;
  });
  await page.route("**/barangay-search-index.json*", async (route) => {
    requests++;
    // Keep loading observable until the assertion, regardless of runner speed.
    await indexResponse;
    await route.continue();
  });
  try {
    await editor(page);
    await page.clock.install();
    const home = page.getByRole("group", { name: "Home Address", exact: true }),
      current = page.getByRole("group", {
        name: "Current Address",
        exact: true,
      });
    await home
      .getByRole("combobox", { name: "Barangay", exact: true })
      .fill("Agd");
    await expect.poll(() => requests).toBe(1);
    await current
      .getByRole("combobox", { name: "Barangay", exact: true })
      .fill("San");
    // Let this search join the pending index load before making it obsolete.
    await page.clock.runFor(150);
    await current
      .getByRole("combobox", { name: "Barangay", exact: true })
      .fill("DefinitelyAbsent");
    await page.clock.runFor(150);
    await expect(
      page.getByText("Loading Philippine locations", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("Loading locations...", { exact: true }),
    ).toBeVisible();
    expect(requests).toBe(1);
    releaseIndex();
    await expect(
      page.getByText("No matching locations.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Loading Philippine locations", { exact: false }),
    ).toHaveCount(0);
    expect(requests).toBe(1);
    await expect(page.getByRole("option")).toHaveCount(0);
    await home.getByRole("combobox", { name: "Barangay", exact: true }).click();
    await expect(
      page.getByRole("option", { name: /Agdao City of Davao/ }),
    ).toBeVisible();
    expect(requests).toBe(1);
  } finally {
    releaseIndex();
  }
});
