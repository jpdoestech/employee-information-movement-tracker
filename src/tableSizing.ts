// Size only the already-authorized display projection; never fetch hidden values.
export function contentWidths(
  labels: string[],
  rows: string[][],
  headerSpace = 44,
): number[] {
  const canvas = document.createElement("canvas").getContext("2d");
  const measure = (text: string) =>
    canvas?.measureText(text).width ?? text.length * 8;
  return labels.map((label, index) => {
    if (canvas) canvas.font = '600 12px "Segoe UI", sans-serif';
    const heading = measure(label) + headerSpace;
    if (canvas) canvas.font = '600 14px "Segoe UI", sans-serif';
    const data = rows.reduce(
      (width, row) => Math.max(width, measure(row[index] || "—") + 24),
      0,
    );
    return Math.ceil(Math.min(360, Math.max(88, heading, data)));
  });
}
