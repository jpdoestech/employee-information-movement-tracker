// Apply preferences before styles load; no application data belongs in these keys.
(function () {
  const themes = ["system", "light", "dark"];
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const read = (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Preferences still work for this session. */
    }
  };
  let theme = themes.includes(read("eimt-theme"))
    ? read("eimt-theme")
    : "system";
  let collapsed = read("eimt-sidebar") !== "expanded";
  function apply() {
    const root = document.documentElement;
    root.dataset.themePreference = theme;
    root.dataset.theme =
      theme === "system" ? (media.matches ? "dark" : "light") : theme;
    root.dataset.sidebar = collapsed ? "collapsed" : "expanded";
    root.style.colorScheme = root.dataset.theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        "content",
        root.dataset.theme === "dark" ? "#1b1c1e" : "#f3f5f8",
      );
    window.dispatchEvent(new Event("eimt:appearance"));
  }
  window.trackerAppearance = {
    theme: () => theme,
    collapsed: () => collapsed,
    setTheme(value) {
      if (!themes.includes(value)) return;
      theme = value;
      write("eimt-theme", value);
      apply();
    },
    toggleSidebar() {
      collapsed = !collapsed;
      write("eimt-sidebar", collapsed ? "collapsed" : "expanded");
      apply();
    },
  };
  media.addEventListener("change", () => {
    if (theme === "system") apply();
  });
  window.addEventListener("storage", (event) => {
    if (
      event.key === null ||
      ["eimt-theme", "eimt-sidebar"].includes(event.key)
    ) {
      theme = themes.includes(read("eimt-theme"))
        ? read("eimt-theme")
        : "system";
      collapsed = read("eimt-sidebar") !== "expanded";
      apply();
    }
  });
  apply();
})();
