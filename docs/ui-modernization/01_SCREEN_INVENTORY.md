# UI-00 — screen and component inventory

Baseline `f5ea0b5`, React 19 / TypeScript / Vite / custom CSS / Lucide / Supabase. Primary runtime styling is imported by `src/main.tsx` in this order: `styles.css`, then `appearance.css`; `public/appearance.js` applies theme/sidebar preferences before rendering. No Tailwind/shadcn dependency is needed.

| Screen / flow | Current owner | Preserve | Scroll / layout owner | Planned phase |
|---|---|---|---|---|
| Sign in and recovery | `App`, `PasswordRecovery` | Auth redirects, recovery marker, account switching, error state | Login layout / bounded recovery form | UI-02 / UI-07 |
| Application shell | `App`, `Appearance`, `public/appearance.js` | Permission-filtered routes, breadcrumbs, theme, rail/drawer, sign out, refresh, skip link | Fixed shell, workspace main | UI-02 |
| Overview | `ManagementAnalytics` | Six KPIs, five distributions, date ranges, readable-data explanations, PRF entry | `analytics-scroll`; stationary toolbar | Representative proposal now; production UI-06 |
| Employee register | `EmployeeTable`, `FilterBar`, `RowsPerPage`, `ColumnDesigner` | Authorized fields, ordering, pinning, widths, ordinals, filters, sorting, paging, selection, saved/managed views | `register` / `table-region` | UI-03 |
| View/add/edit employee | `EmployeeWorkspace`, `EmployeeEditor`, `EmployeeOverview` | Section and full editing, masking, addresses, emergency data, defaults, dynamic groups, category and name casing | Workspace header/tabs/actions stationary; body scrolls | UI-04 |
| History and employment change | `EmployeeEditor`, `MovementEditor` | Lazy history, effective dates, replacement references, official/correction choice, duplicates and conflicts | Workspace history / shared dialog | UI-04 / UI-06 |
| Import and bulk update | Existing import/bulk components, `ColumnDesigner` / picker primitives | XLSX/CSV, fixed identity headers, preview, all-or-nothing validation, scoped fields and confirmation | Bounded dialogs / preview data regions | UI-03 / UI-07 |
| Movements | `RecordExplorer`, `MovementEditor` | All existing transaction types, dates, assignment categories, corrections/voids, searchable authorized employee selection | `data-panel` / `data-scroll-region`; bounded transaction dialog | UI-06 |
| PRFs and assignments | `StaffingRequisitions`, `PrfAssignment`, `RecordExplorer` | Client requisitions, job lines, required/filled counts, employee links, version checks and temporary job labels | Dialog list, requirements editor, secured selector | UI-06 |
| Organization | `Configuration.Organization`, `RecordExplorer` | Head Office, branches, clients, stable IDs, active states and versioned edits | Shared record explorer | UI-05 |
| Field Builder | `Configuration.FieldBuilder`, `FormTabEditor`, job-choice controls | Types, defaults, sensitivity, validation, parent/form groups, applicability, uniqueness, responsive widths | Stationary toolbar + grouped definition table | UI-05 |
| Accounts | `Security` | Enroll/create, native roles, status, temporary/set password actions, capabilities, confirmations | Users table + focused dialogs | UI-05 |
| Access rules | `PermissionMatrix`, `OrganizationScopeEditor`, `AccessChangeReview` | Module/field policies, role templates, scopes, record restrictions, inheritance, effective access and reviewed atomic saves | Bounded permission body / sticky-header matrices | UI-05 |
| Register settings | `ManagedRegisterViews`, `UserQuickFilters`, `Security` | Managed view precedence, per-user filters, ordinals gate and duplicate threshold | Internally scrolling admin region | UI-05 |
| Data management | `EmployeeDataDeletion` | Native superadmin only, scope preview, typed phrase, expiry/conflict checks, final confirmation | Existing admin workspace | UI-05 / UI-07 |
| Sheets sync | `Sync` | Owner connection status, approved policies, immutable workbook mappings, pending/error states and manual reconciliation | Status cards / confirmed policy dialog | UI-06 |
| Audit | `RecordExplorer` | Authorized paging/search, projected old/new values, stable deterministic results | Shared record explorer | UI-06 |

Shared dependency chain: screen → existing picker/editor/list primitives → `api.ts` → authorized RPC/Edge Function. UI formatting must never replace or bypass that final boundary. `ValueEditor`, address controls and field icons retain dynamic metadata; future roles/fields remain data-driven.

Prototype uses the real application and the existing demo dataset, not screenshot-derived figures or employee identities. Inventory captures prove screens render in the baseline harness; they do not constitute fresh full business-flow or authorization certification.
