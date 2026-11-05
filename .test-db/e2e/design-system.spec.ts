import { test, expect, type Locator } from "@playwright/test";

function contrast(a: string, b: string) {
  const luminance = (color: string) => {
    const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
async function colors(control: Locator) {
  return control.evaluate(element => {
    const css = getComputedStyle(element);
    return { text: css.color, background: css.backgroundColor, border: css.borderTopColor };
  });
}

for (const theme of ["light", "dark"]) {
  for (const width of [390, 1440]) {
    test(`shared controls retain contrast, focus and draft cancellation in ${theme} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript(value => localStorage.setItem("eimt-theme", value), theme);
      const external: string[] = [];
      page.on("request", request => {
        if (request.url().startsWith("https://")) external.push(request.url());
      });
      await page.goto("/");
      await page.getByRole("button", { name: "Explore synthetic demo" }).click();
      await page.goto("/#employees");
      const toolbar = page.getByRole("region", { name: "Employee toolbar", exact: true });
      const search = toolbar.getByRole("searchbox", { name: "Search employees" });
      const shell = search.locator("..");
      const before = await shell.boundingBox();
      await search.focus();
      expect(await shell.boundingBox()).toEqual(before);
      const searchCss = await search.evaluate(element => {
        const css = getComputedStyle(element);
        return { outline: css.outlineStyle, shadow: css.boxShadow, border: css.borderTopWidth };
      });
      expect(searchCss).toEqual({ outline: "none", shadow: "none", border: "0px" });
      const add = toolbar.getByRole("button", { name: "Add employee", exact: true });
      await page.keyboard.press("Tab");
      await add.focus();
      expect(await add.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
      const primary = await colors(add);
      expect(contrast(primary.text, primary.background)).toBeGreaterThanOrEqual(4.5);
      if (width === 390) expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      else expect((await add.boundingBox())!.height).toBeLessThanOrEqual(36);
      await page.screenshot({ path: `.test-db/reports/ui-modernization/ui01-register-${theme}-${width}.png` });
      await add.click();
      const editor = page.getByRole("region", { name: "New employee", exact: true });
      const name = editor.getByRole("textbox", { name: /^Last Name(?: \*)?$/ });
      const defaultColors = await colors(name);
      expect(contrast(defaultColors.text, defaultColors.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(defaultColors.border, defaultColors.background)).toBeGreaterThanOrEqual(3);
      await name.focus();
      const focusedColors = await colors(name);
      expect(focusedColors.background).not.toBe(defaultColors.background);
      expect(focusedColors.border).toBe(defaultColors.border);
      expect(contrast(focusedColors.text, focusedColors.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(focusedColors.border, focusedColors.background)).toBeGreaterThanOrEqual(3);
      await name.fill("Review draft");
      await page.screenshot({ path: `.test-db/reports/ui-modernization/ui01-editor-${theme}-${width}.png` });
      await editor.getByRole("button", { name: "Back to Employees", exact: true }).click();
      const discard = page.getByRole("dialog", { name: "Discard unsaved changes?", exact: true });
      await discard.getByRole("button", { name: "Continue editing", exact: true }).click();
      await expect(name).toHaveValue("REVIEW DRAFT");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect(external).toEqual([]);
    });
  }
}

test("tablet touch controls retain 44px targets without enlarging text", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 1024, height: 768 }, hasTouch: true });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Explore synthetic demo" }).click();
  await page.goto("/#employees");
  await page.getByRole("button", { name: "Add employee", exact: true }).click();
  const editor = page.getByRole("region", { name: "New employee", exact: true });
  const name = editor.getByRole("textbox", { name: /^Last Name(?: \*)?$/ });
  expect((await name.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await name.evaluate(element => getComputedStyle(element).fontSize)).toBe("14px");
  await context.close();
});
