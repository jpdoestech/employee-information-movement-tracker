# Employment editing and movement endpoints

Employment fields follow Department, Position, Date Hired, Employment Type and
Employment Status. The choices are Active, Inactive and Separated. Legacy
Resigned/Terminated values display as Separated without rewriting history.

For non-active employment, Effective Date, Separation Category and Reason for
Separation are shown. Employment information is required when creating or
editing non-active employment. Others (specify) reveals a free-text reason;
Remarks stays optional. Unrelated contact/address edits on incomplete legacy
profiles remain possible. Government IDs remain optional.

Saving a changed Department or Position in the employee editor asks whether the
change is official or a typo correction, followed by the shared save
confirmation. Corrections are versioned and audited without creating a movement
or rewriting its payload. Official changes create movement history. Status
transitions use official changes because they affect effective dates and
placement intervals. Explicit New transaction entries continue to record official
movements.

The movement register displays Employee, Transaction, From, To, Effective Date,
State and Reason. Position and status changes show their recorded previous and
new values. Placement changes show branch/client names where authorized.
Department changes include a Department prefix. Unavailable endpoints display an
em dash. Search operates on the authorized server projection; denied fields are
excluded from endpoint text and search. Columns use bounded content widths and
the existing stationary toolbar/pagination with an internally scrolling table.

Apply migrations `20261012000900_employment_profile_changes.sql` and
`20261012001000_movement_endpoints.sql` through the normal migration workflow.
Testing applies them to disposable PostgreSQL only; it does not migrate hosted
databases.
