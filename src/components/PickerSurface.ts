import { createContext } from "react";

/** Nested pickers share their toolbar's surface instead of stacking overlays. */
export const PickerSurface = createContext<{
  target: HTMLElement | null;
  activate: (title: string, back: () => void) => void;
  deactivate: () => void;
} | null>(null);
