import { expect, it } from "vitest";
import { assertNoDrift } from "../scripts/assert-no-drift.mjs";

it.each([
  "",
  " \r\n\t",
  "-- No schema changes found",
  "\ufeff-- status\r\n/* outer /* nested */ comment */\n",
])("accepts empty or comment-only SQL reports (%j)", (sql) =>
  expect(() => assertNoDrift(sql)).not.toThrow(),
);

it.each([
  "alter table public.employees disable row level security;",
  "-- no changes\n/* explanation */ grant all on public.employees to anon;",
  "/* comment */ select '-- not a comment';",
  "-- no changes\nUnexpected CLI output",
])("rejects SQL and unrecognized output (%j)", (sql) => {
  expect(() => assertNoDrift(sql)).toThrow("Unexplained schema drift");
});

it("rejects incomplete comments instead of hiding a malformed diff", () => {
  expect(() => assertNoDrift("/* unfinished")).toThrow(
    "Unterminated SQL comment",
  );
});
