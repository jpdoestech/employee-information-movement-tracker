# Employee workspace

Viewing, adding and editing an employee replaces the employee table in its existing
workspace. It uses a labelled region, not a dialog or modal backdrop. Sidebar,
workspace navigation and keyboard access remain available. Existing employee form,
field permissions, lazy history, mutation/version checks and server projections
are unchanged. Save, archive, duplicates and employment-change confirmations remain
shared dialogs. Pickers and progress attach to the active workspace or nested modal.

Back to Employees/Cancel returns to the retained table, preserving filters, sort,
page and scroll. Focus returns to the record/action that opened the workspace.
An edited draft requires Discard changes/Continue editing before Back, Cancel,
sidebar navigation, browser history or sign-out. Reload/tab close uses the browser's
unsaved-work warning. Busy transactions block leaving; there is no automatic retry.

The workspace uses the same outer bounds and spacing as the register, including
when the sidebar expands or collapses. Inner form content is capped at 1,200px to
avoid stretched inputs, with stationary actions in the heading row.
At phone widths actions move to a stationary bottom row, fields stack, section tabs
scroll horizontally and controls retain 44px touch targets. The form body owns
vertical scrolling. Short landscape reduces identity-strip detail to preserve
usable form space. Field Builder width configuration and
authorized fields remain intact. No backend migration is required.

Responsive and navigation tests live in `.test-db/e2e/employee-workspace.spec.ts`.
Existing employee scenarios use a region locator instead of the former modal
locator; confirmation and picker dialogs retain their dialog roles.
