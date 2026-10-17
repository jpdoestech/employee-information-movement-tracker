// Existing security scenarios retain their descriptive synthetic names while
// supplying the now-required structured identity payload.
// Display group names can change; permission fixtures follow the stable field key.
export const identityPolicyGrantSql = `insert into public.field_access_policies(user_id,group_id,action,effect,inherit_new)
select u,g,a,'allow',true from unnest($1::uuid[]) u,unnest(array['R','U']) a,
(select group_id g from public.field_definitions where key='name') groups`;

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
