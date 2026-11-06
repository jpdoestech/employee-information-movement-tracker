# Employee names and entry tabs

New employees use Last Name and First Name (required), Middle Name and Suffix
(optional). Each is an independently authorized core field, stored under its
canonical key in employee values. The server builds Employee Name as
`Last Name, First Name Middle Name Suffix` for existing tables, employee search,
movement selection and exports. Name parts accept up to 80 characters each;
the combined identity retains the existing 200-character limit.

Existing full names are preserved exactly. No automatic splitting or guessing
occurs. Legacy profiles may retain their original name until an authorized
operator completes the separate first and last fields. Once structured, change
the component fields rather than submitting an inconsistent combined name.
Bulk editing uses the same component fields and atomic validation.

Column and organization permissions still apply. Name component reads require
the original identity read grant; combined-name reads require all four component
read grants to prevent a denied component leaking through search, counts or
exports. Component writes require both their own action and the identity write
grant (clearing an optional component requires its Delete and identity Update).
The migration copies existing explicit name policies, including denials and
organization scopes, into the new fields. Existing group inheritance remains
unchanged. System name definitions cannot be repurposed through the field builder.

In Field Builder, Superadmins choose **Form tabs**. Assign the same tab name to
multiple groups to merge their sections, and set an order (0–999) for each tab.
This changes presentation only, without moving fields or changing group policies.
Changes require confirmation and are saved atomically with group revisions,
idempotency, audit and synchronization invalidation. Inactive or unauthorized
groups do not appear in employee tabs. New groups get their own tab automatically
until configured. Record history is a reserved tab for existing employees.

Tabs support arrow keys, Home and End. Draft sections remain mounted so switching
tabs preserves input text, unresolved address validation and in-progress searches.
Navigation and Save/Cancel stay stationary; only the selected section scrolls.
Save validation returns the user to the section needing attention.

Apply `20261011000400_employee_names_and_form_tabs.sql` before using the updated
client. The migration stops if a reserved name-part key already exists, requiring
an explicit data migration instead of overwriting a custom field. It does not
apply itself to a hosted Supabase database.
