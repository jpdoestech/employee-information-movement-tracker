import { ChevronDown } from "lucide-react";

// Pagination has four fixed sizes, not a searchable entity/filter catalog.
export function RowsPerPage({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="rows-per-page">
      <span className="sr-only">Rows per page</span>
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {[10, 25, 50, 100].map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
      <ChevronDown size={14} aria-hidden />
    </label>
  );
}
