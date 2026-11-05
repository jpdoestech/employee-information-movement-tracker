import type { HTMLAttributes } from "react";

// Keep the supplied combobox's options and event handling intact.
export function DropdownSurface({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`compat-dropdown-surface ${className}`} />;
}
