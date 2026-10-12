// These are editable metadata defaults, not a separate HR module or authorization path.
export const profileDefinitions = [
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
    key: "status_reason",
    label: "Status Reason",
    type: "select",
    group: "employment",
    options: [
      "Active / Normal",
      "Personal reasons",
      "End of contract",
      "Resignation",
      "Retirement",
      "Other",
    ],
    help_text:
      "Profile context only. Record employment status changes through Movements.",
  },
  {
    key: "status_effective_date",
    label: "Status Effective Date",
    type: "date",
    group: "employment",
    help_text: "Profile reference date; it does not schedule a status change.",
  },
  { key: "remarks", label: "Remarks", type: "long_text", group: "employment" },
];
