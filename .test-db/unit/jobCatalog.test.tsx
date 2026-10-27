import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  officialJobMatch,
  temporaryJobEntries,
  mapJobEntries,
  staffingVacancies,
} from "../../src/jobCatalog";
import { JobValueEditor } from "../../src/components/JobValueEditor";
import { fieldConfigurationError } from "../../src/fieldConfiguration";
import type { Field } from "../../src/domain";

const fields = [
  {
    key: "department",
    label: "Department",
    type: "select",
    options: ["Production", "Warehouse"],
  },
  { key: "position", label: "Position", type: "system", options: ["Finisher"] },
] as Field[];

describe("shared official job choices with temporary entry", () => {
  it("finds consistent spelling without changing the entered value", () => {
    expect(officialJobMatch(" production ", fields[0].options)).toBe(
      "Production",
    );
    expect(officialJobMatch("New team", fields[0].options)).toBeUndefined();
  });
  it("deduplicates temporary values and only offers fields authorized in this import", () => {
    const rows = [
      { values: { department: "New team", position: "New job" } },
      { values: { department: "New team", position: "Finisher" } },
    ];
    expect(
      temporaryJobEntries(rows, fields).map((entry) => entry.value),
    ).toEqual(["New team", "New job"]);
    expect(
      temporaryJobEntries(rows, [fields[0]]).map((entry) => entry.value),
    ).toEqual(["New team"]);
  });
  it("maps only to current official choices and keeps temporary imports intact", () => {
    const rows = [
      {
        values: { department: "production", position: "New job" },
        manual_client_id: "0001",
      },
    ];
    const mapping = {
      [JSON.stringify(["department", "production"])]: "Production",
      [JSON.stringify(["position", "New job"])]: "Unavailable job",
    };
    expect(mapJobEntries(rows, fields, mapping)[0]).toEqual({
      values: { department: "Production", position: "New job" },
      manual_client_id: "0001",
    });
    expect(rows[0].values.department).toBe("production");
  });
  it("shows temporary information rather than rejecting unlisted manual values", () => {
    const html = renderToStaticMarkup(
      <JobValueEditor field={fields[0]} value="New team" onChange={() => {}} />,
    );
    expect(html).toContain('value="New team"');
    expect(html).toContain("Temporary entry.");
    expect(html).toContain("Saving is allowed.");
    const withoutChoices = renderToStaticMarkup(
      <JobValueEditor
        field={{ ...fields[0], options: [] }}
        value="New team"
        onChange={() => {}}
      />,
    );
    expect(withoutChoices).not.toContain(
      'aria-label="Choose existing Department"',
    );
    expect(
      fieldConfigurationError({ ...fields[0], default_value: "New team" }),
    ).toBeUndefined();
  });
  it("allows empty official lists and rejects inconsistent official definitions", () => {
    expect(
      fieldConfigurationError({ ...fields[1], options: [] }),
    ).toBeUndefined();
    expect(
      fieldConfigurationError({
        ...fields[1],
        options: ["Finisher", " finisher "],
      }),
    ).toBeTruthy();
  });
  it("reduces vacancies rather than reducing approved required manning", () => {
    expect(staffingVacancies(2, 0)).toBe(2);
    expect(staffingVacancies(2, 1)).toBe(1);
    expect(staffingVacancies(2, 3)).toBe(0);
    expect(staffingVacancies(2, null)).toBeNull();
  });
});
