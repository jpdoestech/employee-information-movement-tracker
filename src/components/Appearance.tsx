import { useSyncExternalStore } from "react";
import {
  Monitor,
  Moon,
  Sun,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Popover } from "./Popover";
declare global {
  interface Window {
    trackerAppearance: {
      theme: () => string;
      collapsed: () => boolean;
      setTheme: (value: string) => void;
      toggleSidebar: () => void;
    };
  }
}
const subscribe = (update: () => void) => {
  window.addEventListener("eimt:appearance", update);
  return () => window.removeEventListener("eimt:appearance", update);
};
export function Appearance() {
  const theme = useSyncExternalStore(subscribe, () =>
    window.trackerAppearance.theme(),
  );
  return (
    <Popover
      label="Appearance"
      icon={theme === "dark" ? Moon : theme === "light" ? Sun : Monitor}
    >
      <div className="appearance-choices" role="group" aria-label="Color theme">
        {[
          ["system", "System", Monitor],
          ["light", "Light", Sun],
          ["dark", "Dark", Moon],
        ].map(([value, label, Icon]) => {
          const ThemeIcon = Icon as typeof Sun;
          return (
            <button
              key={String(value)}
              aria-pressed={theme === value}
              onClick={() => window.trackerAppearance.setTheme(String(value))}
            >
              <ThemeIcon size={16} aria-hidden />
              {String(label)}
            </button>
          );
        })}
      </div>
    </Popover>
  );
}
export function SidebarToggle() {
  const collapsed = useSyncExternalStore(subscribe, () =>
    window.trackerAppearance.collapsed(),
  );
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <button
      className="rail-toggle"
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-expanded={!collapsed}
      aria-controls="workspace-navigation"
      onClick={() => window.trackerAppearance.toggleSidebar()}
    >
      <Icon size={18} aria-hidden />
    </button>
  );
}
