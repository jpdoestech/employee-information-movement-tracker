# UI-00 — incremental modernization roadmap

There is no database migration in this modernization. Preserve React 19, TypeScript, Vite, Supabase Auth/PostgreSQL/RLS/RPC/Edge Functions, current data shapes, Google synchronization and both hosting paths.

| Phase | Smallest reviewable scope | Required proof / exit |
|---|---|---|
| UI-00 (current) | Audit, parity/risk inventories and isolated desktop/mobile dashboard | Inspect references and rendered screenshots; verify focused prototype checks; user reviews visual direction |
| UI-01 | Refine semantic tokens and one shared control/surface family at a time | Approved direction, computed-style and light/dark/keyboard/touch tests; no business source rewrite |
| UI-02 | Shell-owned shared navigation, sidebar/header and mobile bottom navigation | Same visible destinations/permissions, draft guards, auth redirects, history, focus/inertness and safe-area tests |
| UI-03 | Register toolbar, table boundaries and Customize Columns organization | Sorting/filtering/paging, frozen columns, ordinals, selections, saved/managed settings, previews, import/export parity |
| UI-04 | Employee summary hierarchy and long-form visual consistency | Section/full edits, field applicability, masking, address search, history, PRF/replacement, confirmations/conflicts |
| UI-05 | Accounts, access rules, organization and Field Builder surfaces | Complete account/RBAC parity, effective access, group paths, scope review, stationary tables and all below-fold controls |
| UI-06 | Movements, PRFs, Sheets status and Audit reuse the approved primitives | Existing transactions, dates and job requirements, secured lookups, sync boundaries and authorized list counts |
| UI-07 | Responsive/accessibility/performance release proof and documentation reconciliation | Applicable unit/browser/native/REST gates; physical mobile and screen-reader work explicitly reported |

Each phase gets its own reviewable PR and acceptance checklist. Do not merge a phase with critical failures or use this proposal to authorize all remaining screens. UI-01 begins only after UI-00 review.

## Implementation boundaries

Refactor only to establish ownership, reduce duplicated state/requests or make a specific component safe to change. Do not extract large components solely to lower line counts: `App.tsx` (1,228 baseline lines), `EmployeeEditor.tsx` (1,438) and `PermissionMatrix.tsx` (1,208) own important guards and transaction state.

Start with scoped CSS/token changes. Extract a shared authorized navigation catalog during UI-02 if needed; keep routing/hash semantics and existing callbacks. Gradually move proven selector families into logical stylesheets, preserving import order and component tests. No global stylesheet rewrite, new framework, gratuitous component library or persistent employee-data cache.

## Compatibility and rollback

UI-only releases keep the existing data/API contracts. An earlier frontend remains compatible because no database migrations or authorization changes are introduced. Roll back the relevant frontend commit/deployment; preserve user settings, records and backend functions. The UI-00 harness is not imported by `src/main.tsx`, and `.vercelignore` excludes `.test-db`, so removing it has no production runtime effect.

A future PRF workspace requires its own usability review; it must retain current lines, counts, assignments, versions and correction behavior. A new approval engine, dynamic PRF builder and unrelated HR modules are outside this modernization.
