import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
const source = readFileSync("public/appearance.js", "utf8");
function boot(
  saved: Record<string, string> = {},
  dark = false,
  blocked = false,
) {
  const listeners: Record<string, (event?: any) => void> = {};
  const root = {
    dataset: {} as Record<string, string>,
    style: {} as Record<string, string>,
  };
  const media = {
    matches: dark,
    addEventListener: (_: string, fn: () => void) => {
      listeners.os = fn;
    },
  };
  const window: any = {
    matchMedia: () => media,
    addEventListener: (key: string, fn: () => void) => {
      listeners[key] = fn;
    },
    dispatchEvent() {},
  };
  runInNewContext(source, {
    window,
    Event,
    document: { documentElement: root, querySelector: () => null },
    localStorage: {
      getItem: (key: string) => {
        if (blocked) throw Error();
        return saved[key];
      },
      setItem: (key: string, value: string) => {
        if (blocked) throw Error();
        saved[key] = value;
      },
    },
  });
  return { root, media, listeners, api: window.trackerAppearance, saved };
}
it("applies saved theme and sidebar before first paint", () => {
  const state = boot({ "eimt-theme": "dark", "eimt-sidebar": "expanded" });
  expect(state.root.dataset).toEqual({
    theme: "dark",
    themePreference: "dark",
    sidebar: "expanded",
  });
});
it("follows OS changes only in System mode", () => {
  const s = boot();
  s.media.matches = true;
  s.listeners.os();
  expect(s.root.dataset.theme).toBe("dark");
  s.api.setTheme("light");
  s.listeners.os();
  expect(s.root.dataset.theme).toBe("light");
  expect(s.saved["eimt-theme"]).toBe("light");
  s.api.setTheme("invalid");
  expect(s.api.theme()).toBe("light");
});
it("persists rail state and reacts to cross-tab preference removal", () => {
  const s = boot();
  s.api.toggleSidebar();
  expect(s.saved["eimt-sidebar"]).toBe("expanded");
  s.saved["eimt-theme"] = "dark";
  s.listeners.storage({ key: "eimt-theme" });
  expect(s.root.dataset.theme).toBe("dark");
  delete s.saved["eimt-theme"];
  delete s.saved["eimt-sidebar"];
  s.listeners.storage({ key: null });
  expect(s.api.theme()).toBe("system");
  expect(s.api.collapsed()).toBe(true);
});
it("keeps working when local storage is unavailable", () => {
  const s = boot({}, true, true);
  s.api.setTheme("light");
  s.api.toggleSidebar();
  expect(s.root.dataset.theme).toBe("light");
  expect(s.api.collapsed()).toBe(false);
});
