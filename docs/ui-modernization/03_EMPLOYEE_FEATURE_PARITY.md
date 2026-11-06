# UI-00 — employee feature preservation

Production source remains at the audited baseline. This inventory is the acceptance contract for UI-03/UI-04, not a claim that the full employee suite was rerun during this documentation phase.

| Capability | Existing owner / behavior to retain | Required regression evidence before production modernization |
|---|---|---|
| Authorized register | `App`, `EmployeeTable`, `api.ts`; server-projected fields/rows | Hidden values absent from DOM, filtering, sorting, export and column previews |
| Table structure | Measured content widths, frozen identity columns, stationary headers, ordinals separate from IDs | Desktop/phone scroll, sort, page offsets, widths and row selection |
| Views and filters | Personal and managed views, per-user quick filters, draft Apply/Cancel, More Filters | Precedence, saved layout, pin/order, keyboard, stale revisions and cancellation |
| View employee | Workspace replaces table; original table remains mounted/hidden | Bounds match register, Back restores search/page/scroll/focus |
| Personal and additional fields | Dynamic definitions, tabs, parent/subgroup placement and applicability | All configured visible fields appear; hidden or inapplicable fields remain absent |
| Personal/current/emergency addresses | Shared official hierarchy, stable search list, compact desktop rows and postal control | Unresolved text cannot save; dependent choices and three independent addresses retained |
| Names and category | UPPER CASE / PROPER CASE / USER DEFINED; actual-value preview; placement-based creation default | Spacing normalization, preserved spelling and category field authorization |
| View masking | Government IDs masked on initial view/reopen | Only already-authorized values can unmask; no hidden data in markup |
| Section/full editing | Parent and child pencils, all-details expansion, Back to overview | Draft survives expansion/tab navigation; switching scope requests discard correctly |
| Employment and replacements | Official/correction choice, non-active requirements, dates, PRF/job links | Effective-date validation, replacement eligibility, history, client ID and optimistic versions |
| History | Lazy authorized history, refresh/retry on revisions | Opening a profile does not load all movement history; restricted history stays restricted |
| Mutations | Shared Continue/Cancel, Discard/Continue editing, transaction progress | No write before confirmation; cancel keeps draft; no automatic write retry |
| Concurrency and duplicates | Versions, payload-bound receipts, duplicate review and atomic saves | Stale conflicts, replay, duplicate create and invalid bulk rollback |
| Import/export/bulk/archive | Existing independent capabilities and secured RPC paths | View never implies Export/Import/Delete; unauthorized rows/fields rejected server-side |

Retain every existing workflow and keyboard path. Do not exchange the employee grid for generic mobile cards, hide essential fields at narrow widths, or move name/category/default logic into styling. Field Builder responsive widths remain meaningful.

Existing relevant suites include employee-workspace, employee-form, employee-overview, employee-entry-normalization, name-case, employee-category, address, address-layout, emergency-address, government-columns, employee-import, duplicate-employees, archive-employee, employment, PRF assignments and function-fixes. Their baseline tests remain unchanged by UI-00.

Next-phase visual changes must be checked against this table and `docs/00001_employee_information_movement_tracker_codex_requirements_v1_8_full.md`. No database, synchronization or projection change is implied by the prototype.
