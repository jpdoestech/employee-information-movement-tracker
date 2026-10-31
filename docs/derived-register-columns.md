# Calculated employee columns

**Age** and **Length of Service** are available in **Customize Columns → Visible
columns** and **Permissions → Register settings → Column view → Visible columns**.
Existing active, readable, list-eligible employee fields remain available there,
including custom fields and government identifiers. Selecting a column does not
grant access or change other saved views. Administrator eligibility and field
permission gates remain in force.

Age is completed years on the Asia/Manila business date. Length of Service uses
the same calendar anniversary calculation as the profile, through today for an
active employee or the recorded effective date for an inactive/separated employee.
Missing, future or invalid dates display a dash. Neither value is stored or
accepted in manual, bulk, import or synchronization writes.

Both columns require their own field read permission. Age also requires readable
Birth Date; service requires Date Hired and Employment Status, plus readable
Status Effective Date for a non-active record. The server projects authorized
values and sorts Age numerically and service by exact elapsed days before
pagination. Export uses the same readable values.

Apply `20261027020000_derived_employee_columns.sql` after shared job choices and
before the frontend. It adds two system field definitions and retains private
predecessors for the shared policy/projection/order functions. Employees, grants
and saved views are preserved. A frontend rollback is compatible: keep the
additive migration; the prior UI can display the same system columns. Do not
delete field definitions or strip saved-view selections during rollback.

Verification under `.test-db` covers source-field revocation, rejected writes,
month-end/leap-day durations, managed/personal saves, server sort/export paths,
and desktop, phone, tablet and short-landscape column selection.
