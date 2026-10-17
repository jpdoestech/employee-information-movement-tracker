# Audit From and To

The Audit register displays From and To for employee data changes recorded after
`20261013000200_audit_value_changes.sql` is applied. Name changes include the
changed name components and derived employee name, for example
`First Name: JUAN` to `First Name: JUANA`. Multiple changed fields are labelled in
each endpoint. Position corrections and movement transactions also capture
their previous/new values. Unknown values display an em dash; historical audit
records created before this migration are not reconstructed from current data.

Snapshots are stored in a private RLS-protected table, without grants to public,
anonymous or authenticated roles. They are linked to the existing audit record
within the same transaction; failures and previews roll back both. Replays do
not append a second change. Original values remain unchanged by subsequent
employee edits.

Read projections require audit capability, employee scope, and field Read access
in the current and captured origin/destination scopes. Combined names retain
the component permission guard. Search and counts use these authorized
endpoints. Field denial and live scope revocation suppress both values and
search matches. Existing public audit reference objects remain intact.

Configuration records and older events without captured values display an em
dash. No hosted migration or deployment is performed by local verification.
