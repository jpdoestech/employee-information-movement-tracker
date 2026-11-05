import type { Field } from "../domain";
import { temporaryJobEntries, mapJobEntries } from "../jobCatalog";
import { SearchFilterPicker } from "./SearchFilterPicker";

export function JobImportReview({
  rows,
  fields,
  mappings,
  onChange,
  disabled,
}: {
  rows: { values: Record<string, unknown> }[];
  fields: Field[];
  mappings: Record<string, string>;
  onChange: (id: string, official: string | undefined) => void;
  disabled: boolean;
}) {
  const entries = temporaryJobEntries(rows, fields);
  if (!entries.length) return null;
  const remaining = temporaryJobEntries(
    mapJobEntries(rows, fields, mappings),
    fields,
  ).length;
  return (
    <details className="import-guide job-import-review">
      <summary>Review Department / Position names ({entries.length})</summary>
      <p role="status">
        {remaining
          ? `${remaining} temporary job ${remaining === 1 ? "name can" : "names can"} be imported without blocking. Check spelling and consistency, or link to an official name below. Temporary names will not be added to the official lists.`
          : "All job names below are linked to official choices."}
      </p>
      {entries.map((entry) => (
        <div className="job-import-mapping" key={entry.id}>
          <span>
            {entry.field.label}: <strong>{entry.value}</strong>
          </span>
          <SearchFilterPicker
            mode="single"
            label={`Link ${entry.field.label}: ${entry.value}`}
            displayLabel="Keep temporary"
            disabled={disabled || !entry.field.options?.length}
            clearable={true}
            value={
              mappings[entry.id] &&
              entry.field.options?.includes(mappings[entry.id])
                ? [mappings[entry.id]]
                : []
            }
            options={(entry.field.options || []).map((value) => ({
              id: value,
              label: value,
            }))}
            onChange={([value]) => onChange(entry.id, value)}
          />
        </div>
      ))}
      <p className="hint">
        A Superadmin manages official choices in Field Builder. Linking changes
        this import draft only; the normal confirmation still applies.
      </p>
    </details>
  );
}
