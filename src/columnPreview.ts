import { localToday, type Employee, type Field } from "./domain";
import { fullYears, lengthOfService } from "./employeeOverview";

// Only authorized metadata is used; real employee values never enter this preview.
export function columnPreviewRows(
  fields: Field[],
  today = localToday(),
): Employee[] {
  return [1, 2].map((index) => {
    const sample: Record<string, unknown> = {
      birth_date: `${1996 - index}-01-15`,
      date_hired: `${2026 - index}-01-15`,
      status: "Active",
      name: `Sample employee ${index}`,
      employee_number: `SAMPLE-${index}`,
    };
    sample.age = fullYears(sample.birth_date, today);
    sample.length_of_service = lengthOfService(sample, today);
    return {
      id: `preview-${index}`,
      row_version: 1,
      values: Object.fromEntries(
        fields
          .filter((f) => f.active && f.list_eligible && f.actions.includes("R"))
          .map((f) => {
            let value: unknown = sample[f.key];
            if (!Object.hasOwn(sample, f.key)) {
              if (f.validation?.government_id_digits)
                value = "0".repeat(f.validation.government_id_digits);
              else if (f.type === "date") value = "2026-01-15";
              else if (f.type === "checkbox") value = index === 1;
              else if (["integer", "decimal"].includes(f.type))
                value = index * 100;
              else value = f.options?.[0] ?? `Sample ${f.label.toLowerCase()}`;
            }
            return [f.key, value];
          }),
      ),
    };
  });
}
