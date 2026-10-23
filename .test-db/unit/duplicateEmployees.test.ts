import { describe, expect, it } from "vitest";
import {
  nameSimilarity,
  duplicateEmployees,
  bulkDuplicateEmployees,
} from "../../src/duplicateEmployees";
import { DuplicateEmployees } from "../../src/components/DuplicateEmployees";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import type { Employee } from "../../src/domain";
const employee = {
  id: "a",
  row_version: 1,
  values: {
    name: "Sample, Alexandria",
    birth_date: "1990-01-01",
    branch: "North",
    client: "Example",
    department: "Operations",
    position: "Analyst",
  },
} as Employee;
describe("Possible duplicate employee review", () => {
  it("previews names and birthdays across a whole batch without mutating source rows", () => {
    const other = {
      ...employee,
      id: "b",
      values: {
        ...employee.values,
        name: "Other, Person",
        birth_date: "1992-01-01",
      },
    };
    const patch = {
      last_name: "Batch",
      first_name: "Person",
      birth_date: "1995-01-01",
    };
    const review = bulkDuplicateEmployees(
      [employee, other],
      [{ id: "a" }, { id: "b" }],
      patch,
      90,
    );
    expect(review.total).toBe(2);
    expect(review.items[0].candidate_name).toBe("BATCH, PERSON");
    expect(employee.values.name).toBe("Sample, Alexandria");
    expect(employee.row_version).toBe(1);
  });
  it("normalizes punctuation and case and measures edit-distance percentage", () => {
    expect(nameSimilarity("SAMPLE, Alexandria", "sample alexandria")).toBe(100);
    expect(nameSimilarity("abcdefghij", "abcdefghik")).toBeCloseTo(90);
    expect(nameSimilarity("", "A")).toBe(0);
    expect(nameSimilarity("完全相同", "完全相同")).toBe(100);
  });
  it("matches exact birthdays globally, excludes self and honors the threshold", () => {
    expect(
      duplicateEmployees(
        [employee],
        undefined,
        "Sample, Alexandrie",
        "1990-01-01",
        90,
      ).total,
    ).toBe(1);
    expect(
      duplicateEmployees(
        [employee],
        undefined,
        "Sample, Alexandrie",
        "1990-01-01",
        100,
      ).total,
    ).toBe(0);
    expect(
      duplicateEmployees(
        [employee],
        undefined,
        "Sample, Alexandria",
        "1990-01-02",
        90,
      ).total,
    ).toBe(0);
    expect(
      duplicateEmployees(
        [employee],
        "a",
        "Sample, Alexandria",
        "1990-01-01",
        90,
      ).total,
    ).toBe(0);
    expect(
      duplicateEmployees(
        [employee],
        undefined,
        "Sample, Alexandria",
        undefined,
        90,
      ).total,
    ).toBe(0);
  });
  it("bounds displayed matches and invalidates review when records or assignments change", () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      ...employee,
      id: String(i),
    }));
    const review = duplicateEmployees(
      rows,
      undefined,
      "Sample, Alexandria",
      "1990-01-01",
      90,
    );
    expect(review.total).toBe(25);
    expect(review.items).toHaveLength(20);
    expect(
      duplicateEmployees(
        [{ ...employee, row_version: 2 }],
        undefined,
        "Sample, Alexandria",
        "1990-01-01",
        90,
      ).token,
    ).not.toBe(
      duplicateEmployees(
        [employee],
        undefined,
        "Sample, Alexandria",
        "1990-01-01",
        90,
      ).token,
    );
  });
  it("renders required assignment context and never invents restricted values", () => {
    const review = duplicateEmployees(
      [employee],
      undefined,
      "Sample, Alexandria",
      "1990-01-01",
      90,
    );
    const html = renderToStaticMarkup(
      createElement(DuplicateEmployees, { review }),
    );
    for (const label of [
      "Branch",
      "Client",
      "Department",
      "Position",
      "North",
      "Operations",
      "Analyst",
    ])
      expect(html).toContain(label);
    expect(
      renderToStaticMarkup(
        createElement(DuplicateEmployees, {
          review: {
            ...review,
            items: [{ ...review.items[0], values: { name: "Sample" } }],
          },
        }),
      ),
    ).toContain("Restricted or unavailable");
  });
});
