# Unified interface implementation

The user approved the desktop/mobile representative designs on 2026-11-05 and then requested completion of all remaining phases. Each phase retains a separate branch/PR and acceptance evidence. No new HR modules or backend architecture changes are part of this work.

## UI-02 — application shell

The desktop sidebar starts labelled unless an existing collapsed preference was saved. Both mobile primary navigation and the drawer consume App's existing permission-filtered navigation catalog. All links retain hash routing and the shared employee leave guard. More uses the shell-owned drawer callback; there is no prototype DOM bridge. Opening the drawer makes the entire workspace, including bottom navigation, inert; Escape restores its opener. Native modal dialogs retain their top-layer behavior. The fixed navy bottom bar includes safe-area padding and reserves content space so it cannot cover employee actions.

Acceptance: labelled/saved desktop behavior; selected mobile destination; 44px targets; draft cancellation/discard; drawer inertness and focus restoration; short-landscape and phone bounds. Existing appearance and workspace tests remain release gates.

## UI-03 — employee register

Retain the existing measured table, frozen identity columns, display ordinals, server filtering/paging and single stationary toolbar. Sorted headers now have a blue tinted state, distinct from row selection. Toolbar and pagination use quiet white surfaces; Customize Columns uses the approved selected-tab tint and clearly grouped selection/preview headings. Existing personal/managed view behavior, live preview, drag/keyboard ordering and all actions remain intact. No replacement grid or mobile-only loss of columns is introduced.

Acceptance: toolbar filters, paging, row height, stationary headers, column preview/order and managed precedence through existing browser suites; full release coverage in UI-07.

## UI-04 — employee workspace

Preserve the table-replacing workspace and bounded 1200px form content. Give the profile summary and section headings quiet neutral surfaces, use blue tint for the selected tab, and apply the fixed label/value typography to overview entries. Add/edit/view/history stay in the same component with stationary actions and an independently scrolling body. Personal/current/emergency addresses, dynamic fields, masked IDs, scoped pencils, name-case choices, category defaults and lazy history retain their existing behavior; no disclosure now hides previously visible fields.

Acceptance: existing employee form/overview, all address layouts, archive confirmation, draft guards and name-case suites; each remains a release gate. The mobile bar never replaces the Save/Cancel footer.
