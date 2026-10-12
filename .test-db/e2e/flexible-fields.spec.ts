import { test, expect } from "@playwright/test";
for (const [width, height] of [
  [320, 740],
  [768, 1024],
  [1366, 768],
  [812, 375],
]) {
  test(`profile fields fit selected values and dates at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore synthetic demo" }).click();
    await page.goto("/#employees");
    await page
      .getByRole("button", { name: "EMP-0000002", exact: true })
      .click();
    const profile = page.getByRole("dialog", {
      name: "Employee profile",
      exact: true,
    });
    const suffix = profile.getByLabel("Suffix", { exact: true });
    for (const value of ["VIII", "Ph.D."]) {
      await suffix.fill(value);
      await expect(suffix).toHaveValue(value);
      const room = await suffix.evaluate((e) => {
        const input = e as HTMLInputElement;
        const css = getComputedStyle(input);
        const canvas = document.createElement("canvas").getContext("2d")!;
        canvas.font = `${css.fontSize} ${css.fontFamily}`;
        return (
          input.clientWidth -
          parseFloat(css.paddingLeft) -
          parseFloat(css.paddingRight) -
          canvas.measureText(input.value).width
        );
      });
      expect(room).toBeGreaterThanOrEqual(8);
      await profile
        .getByRole("button", { name: "Clear Suffix", exact: true })
        .click();
      await expect(suffix).toHaveValue("");
    }
    for (const [label, selected] of [
      ["Separation Category", "VOLUNTARY"],
      ["Reason for Separation", "Better Job Opportunity"],
      ["Employment Type", "Project-based"],
      ["Status Reason", "Personal reasons"],
    ]) {
      const trigger = profile.getByRole("button", { name: label, exact: true });
      await trigger.click();
      await page
        .getByRole("dialog", { name: `${label} options`, exact: true })
        .getByRole("option", { name: selected, exact: true })
        .click();
      await expect(trigger).toContainText(selected);
      const text = trigger.locator(".picker-label");
      expect((await text.boundingBox())!.height).toBeLessThanOrEqual(22);
      const box = (await trigger.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    for (const label of ["Date Hired", "Status Effective Date"]) {
      const date = profile.getByLabel(label, { exact: true });
      await date.fill("2026-10-06");
      await expect(date).toHaveValue("2026-10-06");
      const room = await date.evaluate((e) => {
        const css = getComputedStyle(e),
          canvas = document.createElement("canvas").getContext("2d")!;
        canvas.font = `${css.fontSize} ${css.fontFamily}`;
        return (
          e.getBoundingClientRect().width -
          parseFloat(css.paddingLeft) -
          parseFloat(css.paddingRight) -
          canvas.measureText("10/06/2026").width
        );
      });
      expect(room).toBeGreaterThanOrEqual(22); // Native calendar icon plus its spacing.
      await expect(
        profile.getByRole("button", { name: `Clear ${label}`, exact: true }),
      ).toBeVisible();
    }
    expect(
      await profile.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({
      path: `.test-db/reports/verification/flexible-fields-${width}x${height}.png`,
    });
    await profile.getByRole("button", { name: "Cancel", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Discard unsaved changes?", exact: true })
      .getByRole("button", { name: "Continue editing", exact: true })
      .click();
    await expect(profile.getByLabel("Date Hired", { exact: true })).toHaveValue(
      "2026-10-06",
    );
  });
}
