-- Column availability is independent of permission. Explicit field Read grants
-- and the existing server projection continue to govern Government ID values.
-- Do not add policies, change sensitivity, or make identifiers required.
update public.field_definitions
set list_eligible=true,row_version=row_version+1
where key in ('bir_tin','sss_number','philhealth_pin','pagibig_mid')
  and validation ? 'government_id_digits' and not list_eligible;
