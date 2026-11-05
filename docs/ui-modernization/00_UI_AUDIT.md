# UI-00 — audit and representative dashboard

Status: ready for design review; UI-01 has not started. Baseline: `f5ea0b5e70853d15e9198e6bb77b6fd9305ee51b`, branch `codex/standalone-tracker`, verified against origin on 2026-11-05 (Asia/Manila). No newer remote commits were present.

The master prompt limits this phase to audit/documentation. The additional visual-fidelity requirement also requests representative desktop/mobile dashboards before the wider redesign. An isolated review harness satisfies both: it imports the current `App`, analytics, pickers, PRF dialog and demo dataset, with a separate proposal stylesheet. No `src/`, public assets, dependencies, database code, migrations or production configuration are changed. No production deployment is part of UI-00.

## Evidence and inspection

Read the supplied master prompt, `AGENTS.md`, v1.8 requirements, design/architecture documentation, current shell and appearance styles, employee/table/column components, movement/configuration/security screens, permission/scope editor, record explorer, PRFs, pickers, dialogs, and representative browser tests. `ui-styling` is the primary guide; existing CSS and components take precedence over adding libraries.

Rendered the current application and proposal using existing fictional demo records. Captured dashboard baselines and inventory screens at desktop/mobile sizes. Dashboard references were opened and visually inspected directly. Synthetic metrics are unchanged: the baseline and proposal use the same six KPIs and five distribution panels. This is not a live employee-data audit.

## Ranked findings

| Priority | Component/file | Current behavior and problem | Recommended change | Regression risk / required proof |
|---|---|---|---|---|
| P1 | `src/App.tsx`, `src/appearance.css` | Phones rely on the menu drawer for module switching; no persistent primary navigation. | Review a labelled Overview / Employees / Movements / More bottom bar; preserve the drawer for all other permitted destinations. | High: route guards, authorization filtering, browser history, modal layering, safe areas, virtual keyboard and draft retention. |
| P2 | `ManagementAnalytics.tsx`, analytics CSS | Six KPIs share one desktop row; mobile uses two columns with long explanatory text. Cards compete with notes and chart panels. | Three consistent desktop card columns, stacked phone cards and a wider main chart column. | Medium: preserve every metric, unavailable-data dashes, scope explanations, date range, all breakdowns and PRF entry. |
| P2 | `styles.css` / `appearance.css` | Multiple generations of tokens/selectors overlap. `styles.css` has 4,784 lines at baseline, with later overrides controlling shared surfaces. | Inventory final computed values, then consolidate one component family per reviewed phase. | High: specificity changes can alter frozen tables, confirmations, portals, phone layouts and dark mode. Do not broadly delete CSS. |
| P2 | `App.tsx` | Desktop defaults to the compact rail; approved desktop reference favours a labelled white sidebar. Account actions are separate header icons. | Review labelled sidebar as default, retain collapse; keep existing account actions until an accessible account menu is approved. | Medium: persisted preferences, mobile drawer focus trap, visible labels, and available routes. |
| P2 | `EmployeeWorkspace.tsx`, `EmployeeEditor.tsx` | Table-replacing workspace and bounded fields already work. Long forms can still require substantial scrolling. | Preserve this architecture; refine section hierarchy and disclosure only after parity review. | High: applicability, blind updates, scoped pencils, dirty guards, history, addresses and transaction progress. |
| P2 | `EmployeeTable.tsx`, `ColumnDesigner.tsx` | Strong data-table functionality and measured widths already exist; complex configuration has several groups of controls. | Retain the table; improve grouping and consistency rather than replacing it with generic cards/grid code. | High: sticky identity columns, ordinals, sort, pagination, managed precedence, selections, imports and exports. |
| P2 | `PermissionMatrix.tsx`, `OrganizationScopeEditor.tsx` | Module/field tables, inheritance notes and scope controls are powerful but dense. | Apply consistent section surfaces and a clearly labelled state legend; preserve every policy state and review. | High: Allow/Deny/Inherit/Unavailable, restricted fields, native-role boundaries, atomic scope changes and effective access. |
| P2 | `MovementEditor.tsx`, `StaffingRequisitions.tsx` | Complex transactions remain bounded dialogs, with nested selectors and effective-date fields. | First standardize shared dialog chrome; separately review a PRF workspace only if the existing flow remains too dense. | High: employee lookup RPC, client/job line binding, conflict checks, retries, versions and shared confirmations. |
| P2 | `RecordExplorer.tsx`, `Configuration.tsx`, `Security.tsx` | List pages and administration use different combinations of tabs, inner scroll regions and toolbars. | Establish a documented list/administration layout using the existing bounded scroll owners. | Medium/high: stationary headers, horizontal bounds, focus and all below-fold controls. |
| P2 | `Sync.tsx` | Status cards are useful, but last-sync values are raw timestamp strings. | In UI-06, format dates consistently for Asia/Manila and retain the exact value accessibly. | Low/medium: do not alter sync scheduling, approval state or data delivery. |
| P2 | Existing UI docs | Some older descriptions conflict with current creation defaults and employee-workspace behavior. | Reconcile documentation against current code during the relevant phase; use the new parity inventories as the review baseline. | Medium: do not infer a business-rule change from stale prose. |

P1 is a high-value modernization priority, not a claim that the current app is unusable or insecure. No critical production authorization defect was established by this UI audit.

## Keep

- React/TypeScript/Vite, current API contracts, data-driven fields, server projections, RLS/RPC enforcement and outbox boundaries.
- Existing SearchFilterPicker / PickerSurface / Popover, modal focus management, shared Continue/Cancel and Discard/Continue editing.
- Workspace employee records, lazy history, scoped edits, name-case options and compact desktop addresses.
- Measured table widths, stationary headers and pagination, frozen identity columns, single-row toolbars and existing navigation guards.
- Local Segoe UI Variable/Aptos stack, fixed typography scale, dark mode and reduced motion.

## Review artifacts and reproduction

Run `npm run dev -- --config .test-db/ui-modernization/vite.config.ts --port 5178` and open `http://127.0.0.1:5178/.test-db/ui-modernization/dashboard.html#dashboard`. Add `?baseline` before the hash for current styling, or `?theme=dark` for the proposal's dark variant. The custom Vite configuration reuses the application configuration but watches the isolated harness; normal Vite intentionally ignores `.test-db`.

Run `npx playwright test --config .test-db/ui-modernization/playwright.config.ts` for focused proof. All output is ignored under `.test-db/reports/ui-modernization/` and `.test-db/results/ui-modernization/`. References remain unchanged under `references/`.

Validation: 16 focused browser checks and `npx tsc --project .test-db/ui-modernization/tsconfig.json --noEmit`. This type-checks the imported frontend and isolated entry/Vite configuration; Playwright loads and executes the test configuration and scenarios. The full application/database suites were not rerun because runtime source and backend behavior are unchanged.

Desktop proposal: `../../.test-db/reports/ui-modernization/proposed-dashboard-desktop.png`. Mobile proposal: `../../.test-db/reports/ui-modernization/proposed-dashboard-mobile.png`. Generated evidence is intentionally not committed.

Continue with [screen inventory](01_SCREEN_INVENTORY.md), [design system and fidelity](02_DESIGN_SYSTEM.md), [employee parity](03_EMPLOYEE_FEATURE_PARITY.md), [RBAC parity](04_RBAC_UI_PARITY.md), [responsive plan](05_RESPONSIVE_TEST_PLAN.md), [roadmap](06_MIGRATION_ROADMAP.md), and [acceptance criteria](07_ACCEPTANCE_CRITERIA.md).

## Decision required

Review the representative desktop and mobile screenshots and intentional differences before UI-01. This report does not authorize applying the skin to the remaining screens. No new payroll, attendance, leave, recruitment, approval engine or global search is proposed.
