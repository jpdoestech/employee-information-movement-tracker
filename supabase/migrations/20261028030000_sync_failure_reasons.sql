-- Only fixed diagnostic messages may be stored; never persist upstream errors or PII.
do $$ declare definition text; needle text; replacement text; begin
 definition:=pg_get_functiondef('app_private.worker_command_before_audit(text,jsonb)'::regprocedure);
 needle:=$old$last_error=case when p->>'status'='Synced' then null else 'Sync suspended: confirm connectivity and export/sharing policy' end$old$;
 replacement:=$new$last_error=case when p->>'status'='Synced' then null
  when p->>'error_code'='ownership_mismatch' then 'The connected Google account must own this spreadsheet. Check the owner in Google Sheets Share.'
  when p->>'error_code'='unapproved_user' then 'A person with Drive access is missing from this workbook''s approved sharing emails. Restricted access can still include individually shared people.'
  when p->>'error_code'='unsafe_sharing' then 'Drive sharing includes a public link, domain, group or unsupported grant. Restrict access to the owner and approved individual emails.'
  else 'Sync suspended: confirm connectivity and export/sharing policy' end$new$;
 if strpos(definition,needle)=0 then raise exception 'Review workbook status before adding sync failure reasons'; end if;
 execute replace(definition,needle,replacement);
end $$;
