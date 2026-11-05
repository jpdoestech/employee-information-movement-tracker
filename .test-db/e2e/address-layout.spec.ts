import { test, expect } from "@playwright/test";

for (const width of [375, 768, 1366]) {
  test(`all employee addresses stay compact at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    await page.getByRole("button", { name: "Add employee", exact: true }).click();
    const addresses = page.locator(".employee-workspace .address-grid");
    await expect(addresses).toHaveCount(3);
    for (const address of await addresses.all()) {
      const street = await address.getByRole("textbox", { name: "Street / building", exact: true }).boundingBox();
      const region = await address.getByRole("combobox", { name: "Region", exact: true }).boundingBox();
      const province = await address.getByRole("combobox", { name: "Province", exact: true }).boundingBox();
      const city = await address.getByRole("combobox", { name: "City / municipality", exact: true }).boundingBox();
      const barangay = await address.getByRole("combobox", { name: "Barangay", exact: true }).boundingBox();
      const postal = await address.getByRole("textbox", { name: "Postal code", exact: true }).boundingBox();
      expect(postal!.width).toBeLessThan(140);
      if (width >= 1000) {
        expect(street!.y).toBe(region!.y);
        expect(province!.y).toBe(city!.y);
        expect(city!.y).toBe(barangay!.y);
        expect(barangay!.y).toBe(postal!.y);
        expect(province!.y).toBeGreaterThan(street!.y);
        expect(postal!.width).toBeLessThan(province!.width * 0.4);
      } else if (width <= 600) {
        expect(region!.y).toBeGreaterThan(street!.y);
        expect(city!.y).toBeGreaterThan(province!.y);
        expect(postal!.height).toBeGreaterThanOrEqual(44);
      }
      expect(postal!.x + postal!.width).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
