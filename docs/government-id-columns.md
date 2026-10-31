# Government ID columns

Government IDs were excluded from Customize Columns because their original
database and demo defaults set `list_eligible=false`. Migration
`20261013000100_government_id_columns.sql` makes the four built-in IDs eligible
without changing their restricted sensitivity, optional entry rules, validation,
field applicability or permissions. Superadmins can still manage column
eligibility through Field Definitions.

Only active, eligible fields with Read access appear in column selection. The
database continues to require explicit Government ID field grants; an inherited
group grant does not expose restricted identifiers. Saved layouts grant no data
access. Current permission and eligibility metadata removes unavailable and
duplicate columns/pins from drafts and the register.

Customize Columns uses Column order, Government IDs and View settings tabs.
It groups optional authorized Government IDs in a compact section.
The main picker shows a selection count. Compact column rows show selection,
drag and pin controls with minimalist field icons. Selecting one or more columns
reveals the shared Move up/down, Deselect and Hide controls above the list.
Reset removes unavailable pins. Closing after Reset or a visibility change uses
the shared discard confirmation. Save cancellation retains the draft.
Live Preview is removed. Select one or multiple columns and drag a selected
handle to move them together; the original relative order is preserved. Dragging
an unselected handle moves only that column. The single-column arrows and bulk
Move up/down controls provide keyboard alternatives. Escape cancels a drag.
Only the bounded column list scrolls; tabs and footer actions stay available.
Repeated section titles and instructions are omitted from the visible layout.

Government identifiers stay strings with leading zeroes. Register cells,
tooltips use existing dashed display formats: TIN 3-3-3, SSS 2-7-1,
PhilHealth 2-9-1 and Pag-IBIG 4-4-4. Exported and stored values remain canonical;
no checksum validation or third-party verification is introduced.

All new verification sources and screenshots are under `.test-db`. The migration
is verified in disposable PostgreSQL and must be applied through the normal
deployment workflow for a hosted database.
