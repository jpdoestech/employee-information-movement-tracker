import { employmentStatus } from "./profileFields";
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

// Calendar duration, using the current business date or the recorded non-active
// effective date. Missing/invalid dates never fall back to today's date.
export function lengthOfService(
  values: Record<string, unknown>,
  today: string,
) {
  const start = values.date_hired;
  const end =
    employmentStatus(values.status) === "Active"
      ? today
      : values.status_effective_date;
  if (
    fullYears(start, today) === null ||
    fullYears(end, today) === null ||
    String(end) < String(start)
  )
    return "—";
  const from = new Date(`${start}T00:00:00Z`),
    to = new Date(`${end}T00:00:00Z`);
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    to.getUTCMonth() -
    from.getUTCMonth();
  const anniversary = (count: number) => {
    const monthStart = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + count, 1),
    );
    const lastDay = new Date(
      Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
    ).getUTCDate();
    return new Date(
      Date.UTC(
        monthStart.getUTCFullYear(),
        monthStart.getUTCMonth(),
        Math.min(from.getUTCDate(), lastDay),
      ),
    );
  };
  if (anniversary(months) > to) months--;
  const days = Math.round(
    (to.getTime() - anniversary(months).getTime()) / 86400000,
  );
  const parts = [
    [Math.floor(months / 12), "year"],
    [months % 12, "month"],
    [days, "day"],
  ] as const;
  return (
    parts
      .filter(([count]) => count > 0)
      .map(([count, unit]) => `${count} ${unit}${count === 1 ? "" : "s"}`)
      .join(", ") || "0 days"
  );
}
