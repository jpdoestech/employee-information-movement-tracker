export const separationCategories = ["VOLUNTARY", "INVOLUNTARY"];
export const employmentDisplayOrder = [
  "employee_number",
  "client_employee_number",
  "branch",
  "client",
  "manpower_classification",
  "replaced_employee_id",
  "department",
  "position",
  "date_hired",
  "date_hired-duration",
  "employment_type",
  "status",
  "status_effective_date",
  "separation_category",
  "separation_reason",
  "separation_details",
  "remarks",
];
export const employmentOrder = [
  "manpower_classification",
  "replaced_employee_id",
  "department",
  "position",
  "date_hired",
  "employment_type",
  "status",
  "status_effective_date",
  "separation_category",
  "separation_reason",
  "separation_details",
  "remarks",
];
export const inactiveEmploymentRequired = [
  "department",
  "position",
  "date_hired",
  "employment_type",
  "status_effective_date",
  "separation_category",
  "separation_reason",
];
export function employmentStatus(value: unknown) {
  return ["Resigned", "Terminated"].includes(String(value))
    ? "Separated"
    : String(value || "Active");
}
export function employmentError(values: Record<string, unknown>) {
  if (employmentStatus(values.status) === "Active") return;
  const missing = inactiveEmploymentRequired.find(
    (key) => !String(values[key] ?? "").trim(),
  );
  if (missing)
    return {
      key: missing,
      message: `${employmentOrder.includes(missing) ? missing.replaceAll("_", " ") : missing} is required when employment is not active.`,
    };
  if (
    values.separation_reason === "Others (specify)" &&
    !String(values.separation_details ?? "").trim()
  )
    return { key: "separation_details", message: "Specify the other reason." };
}
export const separationReasons = [
  "Health Concerns",
  "Better Job Opportunity",
  "Better Pay",
  "Going Abroad",
  "Career Growth",
  "Further Studies",
  "Termination",
  "AWOL",
  "Store Variance",
  "Family Reason",
  "Personal reasons",
  "End of contract",
  "Resignation",
  "Retirement",
  "Others (specify)",
];
// These are editable metadata defaults, not a separate HR module or authorization path.
export const profileDefinitions = [
  {
    key: "manpower_classification",
    label: "Employment Manpower Classification",
    type: "select",
    group: "employment",
    options: ["New/Additional", "Replacement"],
    default_value: "New/Additional",
  },
  {
    key: "replaced_employee_id",
    label: "Employee replaced",
    type: "short_text",
    group: "employment",
    validation: { max_length: 36 },
  },
  {
    key: "separation_category",
    label: "Separation Category",
    type: "select",
    group: "employment",
    options: separationCategories,
  },
  {
    key: "separation_reason",
    label: "Reason for Separation",
    type: "select",
    group: "employment",
    options: separationReasons,
  },
  {
    key: "separation_details",
    label: "Specify reason",
    type: "short_text",
    group: "employment",
    validation: { max_length: 500 },
  },
  { key: "birth_date", label: "Birth Date", type: "date", group: "personal" },
  {
    key: "gender",
    label: "Gender",
    type: "select",
    group: "personal",
    options: ["Male", "Female", "Other", "Prefer not to say"],
  },
  {
    key: "civil_status",
    label: "Civil Status",
    type: "select",
    group: "personal",
    options: ["Single", "Married", "Separated", "Divorced", "Widowed"],
  },
  {
    key: "department",
    label: "Department",
    type: "short_text",
    group: "employment",
  },
  { key: "date_hired", label: "Date Hired", type: "date", group: "employment" },
  {
    key: "employment_type",
    label: "Employment Type",
    type: "select",
    group: "employment",
    options: [
      "Regular",
      "Probationary",
      "Contractual",
      "Project-based",
      "Casual",
      "Seasonal",
      "Part-time",
    ],
  },
  {
    key: "status_effective_date",
    label: "Effective Date",
    type: "date",
    group: "employment",
    help_text: "Official status changes take effect on this date.",
  },
  { key: "remarks", label: "Remarks", type: "long_text", group: "employment" },
];
