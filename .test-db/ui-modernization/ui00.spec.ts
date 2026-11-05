import { test, expect, type Page } from "@playwright/test";
const preview = "/.test-db/ui-modernization/dashboard.html";
const screenshots = ".test-db/reports/ui-modernization";
test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => {
    const url = route.request().url();
    return url.startsWith("http") && !url.startsWith("http://127.0.0.1:5178/")
      ? route.abort("blockedbyclient") : route.continue();
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
});
async function ready(page: Page, query = "") {
  await page.goto(`${preview}${query}#dashboard`);
  await expect(page.locator(".analytics-stats strong").first()).toHaveText("29");
}
for (const [width, height] of [[320,740],[375,812],[390,844],[768,1024],[1024,768],[1280,800],[1440,1000],[1920,1080],[844,390]]) {
  test(`proposal stays bounded and retains dashboard interactions at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const external: string[] = [];
    page.on("request", request => { if (request.url().startsWith("https://")) external.push(request.url()); });
    await ready(page);
    await expect(page.locator(".analytics-stats .stat")).toHaveCount(6);
    await expect(page.locator(".analytics-grid .analytics-panel")).toHaveCount(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const toolbar = page.locator(".analytics-toolbar");
    const before = await toolbar.boundingBox();
    const nav = page.getByRole("navigation", { name: "Primary mobile navigation", exact: true });
    if (width <= 760) {
      await expect(nav).toBeVisible();
      for (const control of await nav.locator("a, button").all()) {
        const bounds = (await control.boundingBox())!;
        expect(bounds.width).toBeGreaterThanOrEqual(44);
        expect(bounds.height).toBeGreaterThanOrEqual(44);
      }
    } else await expect(nav).toBeHidden();
    const navigationBefore = width <= 760 ? await nav.boundingBox() : null;
    await page.screenshot({ path: `${screenshots}/proposed-dashboard-${width}x${height}.png` });
    await page.locator(".analytics-scroll").evaluate(el => { el.scrollTop = el.scrollHeight; });
    expect(await toolbar.boundingBox()).toEqual(before);
    if (navigationBefore) expect(await nav.boundingBox()).toEqual(navigationBefore);
    if (width === 390) await page.screenshot({ path: `${screenshots}/proposed-dashboard-mobile-details.png` });
    await page.getByRole("button", { name: "Date range", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "Date range options", exact: true });
    const bounds = (await picker.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height + 1);
    await picker.getByRole("option", { name: /^90D/ }).click();
    await expect(page.getByRole("button", { name: "Date range", exact: true })).toContainText("90D");
    expect(external).toEqual([]);
  });
}
test("mobile navigation retains active state, the existing drawer and PRF workflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const nav = page.getByRole("navigation", { name: "Primary mobile navigation", exact: true });
  await nav.getByRole("link", { name: "Employees", exact: true }).click();
  await expect(nav.getByRole("link", { name: "Employees", exact: true })).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "Staffing / PRFs", exact: true }).click();
  const prfs = page.getByRole("dialog", { name: "Client staffing / PRFs", exact: true });
  await expect(prfs).toBeVisible();
  await prfs.getByRole("button", { name: "Close dialog", exact: true }).click();
  await nav.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Navigation", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".sidebar.open")).toHaveCount(0);
});
for (const width of [390,1440]) {
  test(`baseline and proposal preserve identical existing metrics at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await ready(page, "?baseline");
    const baseline = await page.locator(".analytics-stats").innerText();
    await page.screenshot({ path: `${screenshots}/baseline-dashboard-${width}.png` });
    await ready(page);
    expect(await page.locator(".analytics-stats").innerText()).toBe(baseline);
    await expect(page.getByRole("link", { name: /Attendance|Payroll|Recruitment|Leave/ })).toHaveCount(0);
  });
}
for (const width of [390,1440]) {
  test(`baseline screen inventory capture at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await ready(page, "?baseline");
    for (const route of ["employees","movements","organization","fields","permissions","sync","audit"]) {
      await page.goto(`${preview}?baseline#${route}`);
      await expect(page.locator(".topbar h1")).toBeVisible();
      if (route === "employees") await expect(page.getByRole("button", { name: "EMP-0000002", exact: true })).toBeVisible();
      if (["movements","organization","audit"].includes(route)) await page.locator('.data-scroll-region[aria-busy="false"]').waitFor({ state: "visible" });
      if (route === "fields") await expect(page.getByRole("button", { name: "Edit group Personal Information", exact: true })).toBeVisible();
      if (route === "permissions") await expect(page.getByRole("button", { name: "Edit access for Demo Administrator", exact: true })).toBeVisible();
      if (route === "sync") await expect(page.getByText("Google account not connected", { exact: true })).toBeVisible();
      await page.screenshot({ path: `${screenshots}/baseline-${route}-${width}.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    await page.goto(`${preview}?baseline#employees`);
    await page.getByRole("button", { name: "EMP-0000002", exact: true }).click();
    const employee = page.getByRole("region", { name: "Employee profile", exact: true });
    await expect(employee.getByRole("button", { name: "Edit details", exact: true })).toBeVisible();
    await page.screenshot({ path: `${screenshots}/baseline-employee-overview-${width}.png` });
    await employee.getByRole("button", { name: "Edit details", exact: true }).click();
    await expect(employee.getByRole("textbox", { name: "Last Name", exact: true })).toBeVisible();
    await page.screenshot({ path: `${screenshots}/baseline-employee-editor-${width}.png` });
  });
}
for (const theme of ["light", "dark"]) {
test(`${theme} proposal retains readable card labels and visible keyboard focus`, async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await ready(page, `?theme=${theme}`);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  const button = page.getByRole("button", { name: "Date range", exact: true });
  await button.focus();
  await expect(button).toBeFocused();
  const contrast = await page.locator(".analytics-stats .stat").first().evaluate(card => {
    const lum = (color: string) => {
      const c = color.match(/[\d.]+/g)!.slice(0,3).map(Number).map(x => x/255).map(x => x <= .04045 ? x/12.92 : ((x+.055)/1.055)**2.4);
      return c[0]*.2126 + c[1]*.7152 + c[2]*.0722;
    };
    const bg = lum(getComputedStyle(card).backgroundColor);
    return Math.min(...[".stat-label","strong","small"].map(s => { const fg=lum(getComputedStyle(card.querySelector(s)!).color); return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05); }));
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({ path: `${screenshots}/proposed-dashboard-${theme}.png` });
});
}
