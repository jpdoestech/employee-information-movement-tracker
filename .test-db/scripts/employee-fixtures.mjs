// Existing security scenarios retain their descriptive synthetic names while
// supplying the now-required structured identity payload.
export function employeeFixture(operation, payload) {
  if (
    ["employee_create", "employee_update", "bulk_update"].includes(operation) &&
    typeof payload?.values?.name === "string" &&
    !Object.hasOwn(payload.values, "first_name")
  ) {
    payload.values.first_name = payload.values.name;
    payload.values.last_name = "Test";
    payload.values.name = `Test, ${payload.values.first_name}`;
  }
  return payload;
}
