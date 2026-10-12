import { useEffect, useState } from "react";

// Re-measure when the browser has resolved the installed font fallback.
export function useFontMetrics() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    document.fonts.ready.then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);
  return ready;
}

// Size only the already-authorized display projection; never fetch hidden values.
export function contentWidths(
  labels: string[],
  rows: string[][],
  headerSpace = 44,
  roles: string[] = [],
): number[] {
  const canvas = document.createElement("canvas").getContext("2d");
  const tokens = getComputedStyle(document.documentElement);
  const family = tokens.fontFamily;
  const mono = tokens.getPropertyValue("--font-mono") || "monospace";
  const measure = (text: string) =>
    canvas?.measureText(text).width ?? text.length * 8;
  return labels.map((label, index) => {
    if (canvas) canvas.font = `600 10px ${family}`;
    const heading =
      measure(label.toUpperCase()) + headerSpace + label.length * 0.4;
    if (canvas)
      canvas.font = roles[index]
        ? `400 ${roles[index] === "text-id" ? 11 : 12}px ${mono}`
        : `600 12px ${family}`;
    const data = rows.reduce(
      (width, row) => Math.max(width, measure(row[index] || "—") + 24),
      0,
    );
    return Math.ceil(Math.min(360, Math.max(88, heading, data)));
  });
}
