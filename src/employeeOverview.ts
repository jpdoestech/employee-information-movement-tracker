export function fullYears(date: unknown, today: string) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date ||
    date > today
  )
    return null;
  const [year, month, day] = date.split("-").map(Number);
  const [currentYear, currentMonth, currentDay] = today.split("-").map(Number);
  return (
    currentYear -
    year -
    Number(currentMonth < month || (currentMonth === month && currentDay < day))
  );
}
export function overviewDate(value: unknown) {
  if (typeof value !== "string" || fullYears(value, "9999-12-31") === null)
    return String(value ?? "—");
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
export function maskedIdentifier(formatted: string) {
  if (!formatted || formatted === "—") return "—";
  const count = formatted.replace(/\D/g, "").length;
  if (count < 5) return "••••";
  let index = 0;
  return formatted.replace(/\d/g, (digit) =>
    ++index <= count - 4 ? "*" : digit,
  );
}
