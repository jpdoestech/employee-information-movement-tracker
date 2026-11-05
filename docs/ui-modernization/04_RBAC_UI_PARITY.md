# UI-00 — RBAC presentation preservation

No authorization changes are part of UI-00 or the proposed visual skin. The existing database remains authoritative. The isolated preview uses the existing fictional demo administrator; it is not evidence of production role isolation.

| Boundary | Preserve in subsequent phases | UI acceptance |
|---|---|---|
| Native account role | Superadmin trusted override, scoped Admin, Viewer mutation restrictions | Do not imply that Admin is Superadmin or that adding a template changes the native role |
| Module matrix | Catalog-defined applicable actions; View separate from Create/Update/Delete/Export/Import/Manage | Keep table, row/column labels, disabled unavailable cells and stationary headers |
| Field/group policy | Independent actions, parent inheritance, restricted-field explicit grants, DENY precedence | Keep full group paths, parent links, source explanations, state labels and every applicable action |
| Scopes | Head Office, branch, client, all, unassigned; branch descendants explicit | Keep complete Allowed locations selection, per-location actions, dates/status, broad-access warning and saved-snapshot check |
| Record restrictions | Self, direct reports, departments and explicit assignments further restrict organization grants | Retain secured search selectors; never substitute a truncated employee page |
| Effective access | Role-derived permissions, direct allows/denies, scopes, assignments and final decisions | Preserve existing server-driven inspection and readable reasons; no client-only evaluator |
| Reviewed save | Reason, rollback-only impact preview, bound revision/date and atomic mutation | Preserve Continue/Cancel, no write on cancel, complete draft retention and stale-review rejection |
| Account management | Existing trusted create/enroll, status, password and capabilities flows | Preserve focused dialogs, no public signup or credential exposure introduced |
| Destructive data tools | Native superadmin-only preview, exact phrase and confirmation | Visual changes must not simplify away preview, expiry or authorization checks |
| Direct browser requests | Current publishable-key client and RLS/RPC/Edge enforcement | CSS, navigation visibility and local state must never be treated as security boundaries |

Recommended presentation: state legend with text (Allow / Deny / Inherit / Unavailable), consistent surfaces, compact source explanations, full group paths and a clearly separated save review. Color is supplementary. Do not compress all actions into a single editable checkbox or replace the permission matrix with a role-only selector.

Mobile navigation must use the same permission-filtered destination model as the sidebar. More must retain every permitted administration route and keyboard-focus behavior. A route being absent from the bottom bar must not make it unavailable through the drawer.

Before UI-05 release, run matrix/scope/account browser suites and native RBAC checks: unauthorized peer employee, permitted direct report, independent View/Export/Create/Update/Delete, cross-branch/cross-department denial, assigned-record isolation, explicit DENY, complete trusted-superadmin behavior, existing HR role behavior and direct RPC/table bypass rejection. Include ESS/lifecycle/onboarding/HR-operation equivalents only where they actually exist; this audit does not invent such modules.

Existing sources: `PermissionMatrix.tsx`, `OrganizationScopeEditor.tsx`, `AccessChangeReview.tsx`, `Security.tsx`, `accessReview.ts`, `scopeDraft.ts`, current `api.ts` calls and database permission definitions. Reuse them; no UI-only reimplementation of policy precedence is approved.
