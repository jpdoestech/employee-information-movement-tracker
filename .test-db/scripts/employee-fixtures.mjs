// Existing security scenarios retain their descriptive synthetic names while
// supplying the now-required structured identity payload.
export function employeeFixture(operation, payload) {
  if (operation === "employee_create")
    payload.values = {
      bir_tin: "012345678",
      sss_number: "0123456789",
      philhealth_pin: "012345678901",
      pagibig_mid: "012345678901",
      ...payload.values,
    };
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
