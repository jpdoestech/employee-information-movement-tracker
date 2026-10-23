# Employee groups and scoped editing

Employee Category is an editable Admin/Agency choice in Employment information. It is independent of login roles, employment type and placement: Head Office staff can be Admin, while branch/client employees can be Agency. It follows the existing field permissions and confirmed, versioned saves. Existing records stay blank until classified; changing an assignment does not overwrite the selected category. The default register includes it; saved personal column layouts remain unchanged.

Existing records open with horizontal Overview and Record history tabs.
Overview contains the complete authorized summary; Employment Details and
Additional Information are summary sections, not duplicate view-mode tabs.

Core identity is now Personal Information. Address, Government IDs and Emergency
Information are sub-groups beneath it. Existing personal/contact fields appear
directly in Personal Information. Employment Details contains employment entries,
with Compensation and Allowances available as configurable sub-groups. Empty
sections are omitted from employee forms until fields are configured; no sample
salary or personal values are inserted.

Each visible, writable group has an accessible pencil action. A sub-group pencil
edits only that section; a parent pencil includes its child sections. The main
Edit details button above the tabs opens every authorized entry section in one
scrolling form. Back to overview preserves drafts. Expanding a scoped draft into
all-details editing retains it; switching to a different scoped group requires
Discard changes / Continue editing. Saves retain their transaction confirmation.

Field Definitions supports a Parent group selector (two levels maximum), and a
Form group / sub-group selector on editable definitions. Existing field group
membership remains the access-policy boundary. Form placement is separate
metadata, so regrouping existing fields does not change CRUD, applicability,
restricted Government ID rules or permission inheritance. Parent membership is
not an access grant. Standalone groups retain custom tab settings; hierarchical
tabs follow the parent name and order.

Migration: 20261013000300_employee_group_hierarchy.sql. Foreign keys enforce valid
references; serialized hierarchy validation prevents cycles or a third level.
Configuration continues through the existing authorized, versioned, idempotent
mutation path. Context returns the section/parent metadata needed by authorized
fields, without broadening the field or value projections.

Government IDs appear once in the summary and reveal in place with Unmask
Government IDs. Identifiers start masked again when returning from editing or
reopening a record. Masking is presentation only; server authorization controls
access. Derived age/service and address summaries use readable fields only.

Employment details use one shared sequence: System ID, Client-based ID, Primary
Branch, Primary Client, Department, Position, Date Hired, derived Length of
Service, Employment Type and Employment Status. Non-active records append
Effective Date, Separation Category and Reason for Separation. Others (specify)
retains its text entry. Remarks remain available for active and non-active records.
Readonly identifiers/placement values stay readonly in the editor.

Length of Service is a calendar difference (years, months, days): Date Hired to
the business date for Active, or Date Hired to Effective Date for Inactive or
Separated. Legacy Resigned/Terminated statuses are displayed as Separated.
Missing, invalid, reversed or future cutoff dates show an em dash. Derived
service requires Read access to its source fields on existing employees and does
not expose a denied effective date or status through the calculation.
Personal Information retains independent Home and Current Address fields. Emergency
Information also has its own Emergency Address (street/building, province,
city/municipality, barangay and postal code), using the same authorized address
picker and official hierarchy validation. New emergency values start empty;
existing addresses and field permissions are preserved. Denied address parts are
omitted from the overview and server projections.
