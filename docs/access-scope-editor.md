# Organization access selection

In Access rules → select a user → Scope & assignments, **Allowed locations** shows every saved organization grant, including inactive or scheduled grants. Select multiple branches, clients, Head Office, or unassigned employees. Unselect a location to remove all its grants on save; there is no separate removal checkbox.

New selections default to View. Set actions per location, or choose a matching access preset before selecting locations. Branch grants include their clients only when **Include all branch clients** is checked. An active **All organization scopes** grant still applies across the company; remove it to narrow access. Dates and status expand for optional schedules, exclusive end dates, disabling access, and multiple periods.

Save requires a reason and a server-generated review. Continue saves the additions and removals together. Cancel preserves the draft and sends no mutation. The review lists the resulting locations and removed grants. Concurrent changes to the saved grant list require reloading and reviewing the account again.

Module permissions, field permissions, account status, and record restrictions continue to restrict organization grants. Superadmin retains its trusted override. Selecting locations does not change the separate field-policy scope.

Deploy migration `20261028050000_scope_assignment_editor.sql` before the frontend. The existing singular `scope_grant` payload remains supported, so the frontend can be rolled back without changing saved permissions. This migration changes mutation/review handling; it does not modify any user's grants.

Focused checks: `TEST_SCOPE_EDITOR_ONLY=true npm run test:db`, `TEST_RBAC_ONLY=true npm run test:db`, unit tests, build, and the permission-matrix / permissions-editors Playwright suites. All fixtures use synthetic accounts.
