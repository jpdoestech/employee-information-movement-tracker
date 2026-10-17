import { expect, it } from "vitest";
import { moveColumnGroup } from "../../src/domain";
it("moves non-contiguous selected columns together in their original relative order", () => {
  const columns = ["a", "b", "c", "d", "e"];
  expect(moveColumnGroup(columns, ["d", "b"], "e", true)).toEqual([
    "a",
    "c",
    "e",
    "b",
    "d",
  ]);
  expect(moveColumnGroup(columns, ["d", "b"], "a")).toEqual([
    "b",
    "d",
    "a",
    "c",
    "e",
  ]);
  expect(columns).toEqual(["a", "b", "c", "d", "e"]);
});
it("ignores revoked/missing selection entries and does not duplicate or reorder self-drops", () => {
  const columns = ["a", "b", "c"];
  expect(moveColumnGroup(columns, ["a", "a", "denied"], "c", true)).toEqual([
    "b",
    "c",
    "a",
  ]);
  expect(moveColumnGroup(columns, ["a", "b"], "b")).toEqual(columns);
  expect(moveColumnGroup(columns, ["a"], "denied")).toEqual(columns);
  expect(moveColumnGroup(columns, [], "c")).toEqual(columns);
});
