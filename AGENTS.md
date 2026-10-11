# Repository requirements

Use the supplied full v1.8 specification in `docs/` as the authoritative application specification. Preserve permission checks, field applicability, server-side projections, atomic transactions, and synchronization boundaries when changing UI code. Reference repositories are read-only.

# Current and future UI

Use the installed UI UX Pro Max skill for UI work. The approved direction is a compact, data-focused enterprise interface inspired by the supplied employee-directory reference: navy accents, gray canvas, white surfaces, thin dividers, restrained radii, readable typography, and prominent data tables. See `docs/design-reference.md` and shared tokens in `src/styles.css`.

The latest directory reference uses a dark navy section header, compact desktop icon rail, and left-aligned search/filter toolbar. Preserve labelled mobile navigation. Inputs use a subtle filled focus state and a stable border; do not add an outline or external shadow inside composite search inputs. Applied selections stay in filter triggers with X clear controls; do not add a separate applied-filter chip row beneath any data toolbar. Keep keyboard focus visible on buttons/navigation and retain every existing feature.

- Reuse shared controls and semantic CSS tokens. Avoid oversized buttons, stretched toolbar dropdowns, repeated search icons, promotional copy, duplicate page titles, and unrelated HR features.
- Keep desktop controls compact (32–36px). On touch-sized layouts retain comfortable 44px controls, readable inputs, and visible keyboard focus. Do not achieve responsive layouts by wrapping control labels into multiple lines.
- Use compact action toolbars. Keep the primary action distinct; give icon controls accessible names. Reveal advanced filters in a centered viewport-bound modal with a dimmed backdrop without moving the data layout; show selection actions when needed. Use `Popover` for toolbar editors and `FloatingNotification` for loading, success, and error messages. Notifications must overlay the page without changing its layout; keep modal errors within the modal top layer.
- Use `SearchFilterPicker` for shared search/filter behavior. Toolbar pickers fit their content; form fields may occupy their form-grid column. Preserve stable IDs, permissions, draft Apply/Cancel behavior, keyboard access, and viewport-bound popovers.
- Inside toolbar editors, nested pickers share the existing panel through `PickerSurface`. Use a Back control and a bounded searchable list instead of stacking independent dropdowns over the panel. Group assignment scope and column rules, with compact paired controls.
- Data-list pages use a viewport-bound workspace with stationary navigation, toolbars, pagination, and footer. Only the data region scrolls. Use `.register` / `.table-region` for employee tables and `.data-panel` / `.data-scroll-region` for other lists. Keep pagination directly below its data region; its controls must not stretch.
- Reuse `RecordExplorer` for Movements, Organization, Audit and similar record lists, with server-authorized filtering, counts and deterministic pagination. Do not filter a truncated cached list or use the loaded employee page as a transaction selector; search the secured employee RPC.
- Preserve frozen desktop identity columns and the compact single pinned identity column on phones. Keep row selections and sort direction visibly distinguishable.
- Size list columns from their authorized displayed content and headers, with bounded widths for unusually long values; do not stretch every column to fill the screen. Keep employee rows uniform and single-line (36px desktop, 50px touch), with full values available in the record editor. Selected filter labels and option descriptions must wrap within their control instead of clipping. Keep workspace spacing minimal and pagination stationary.
- Use the shared transaction tracker for mutation and preview progress. Float progress in the active modal or page after a short delay, keep it visible until settlement, and explain extended waits. Never retry a write automatically or bypass confirmation to show progress.
- Verify desktop, phone, tablet, and short landscape layouts; test scrolling, popover bounds, readable contrast, focus, and reduced motion for affected flows. All test source, configurations, and generated verification files belong under `.test-db`.

Always provide a commit-ready Summary and Description when reporting completed changes. Do not include real credentials or generated caches in commits.

All saves and data-changing transactions require the shared Continue/Cancel confirmation before sending a mutation. Closing an edited dialog requires Discard changes/Continue editing; cancellation preserves the draft and sends no write. Keep confirmations compact, keyboard accessible, and within the viewport. Do not replace database authorization, validation, versions, or idempotency with client confirmation.

All modal headers use one compact title and close icon; footers share the same action spacing. Unsaved-change dialogs must say Continue editing and Discard changes, with a warning icon and red discard action; closing that prompt keeps the draft. Customize Columns keeps view settings, column ordering/pinning, and live preview clearly grouped. Do not add a separate Saved View / Column Filters row to the register; use the shared toolbar and More Filters modal.

Keep shared picker footers to one compact row. Bulk selection controls belong above larger lists; do not add separate count and bulk-action rows beneath a short option list. Simple toolbar filters stay compact dropdowns, while More Filters uses a centered modal.
