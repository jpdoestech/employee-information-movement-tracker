import { useEffect, useState } from "react";

// Re-measure after the bundled font settles, including on a slow connection.
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
): number[] {
  const canvas = document.createElement("canvas").getContext("2d");
  const family = getComputedStyle(document.documentElement).fontFamily;
  const measure = (text: string) =>
    canvas?.measureText(text).width ?? text.length * 8;
  return labels.map((label, index) => {
    if (canvas) canvas.font = `600 12px ${family}`;
    const heading = measure(label) + headerSpace;
    if (canvas) canvas.font = `600 14px ${family}`;
    const data = rows.reduce(
      (width, row) => Math.max(width, measure(row[index] || "—") + 24),
      0,
    );
    return Math.ceil(Math.min(360, Math.max(88, heading, data)));
  });
}
