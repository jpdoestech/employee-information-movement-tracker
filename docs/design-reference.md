# Read-only design review

Current typography (2026-10-12): Inter 4.1 variable upright is bundled locally at
`src/assets/fonts/InterVariable.woff2`, using the shared `--font-sans` token for
pages, tables, forms, pickers and dialogs. UI UX Pro Max's Minimal Swiss guidance
uses one Inter family with weight-based hierarchy for enterprise dashboards.
Existing sizes, touch targets and tabular-number styles remain unchanged. One
critical font preload and `font-display: swap` keep text available while loading;
Vite emits the same hashed asset for both CSS and preload, including Pages paths.
Source: https://github.com/rsms/inter/tree/v4.1 (unmodified font from
`docs/font-files/InterVariable.woff2`). Its SIL Open Font License 1.1 is retained
in `src/assets/fonts/Inter-LICENSE.txt`. No runtime font CDN request is required.

Verified live main on 2026-10-10 (Asia/Manila): coop-sys `54bbf05cc9211a603a011051803e5de44a815319`; hr-management `99a28c937f16c8f582649ea8c89370ff00cb032d`. Snapshots cloned under Codex temporary storage; reference checkouts were never edited. User also permits relevant read-only inspection at `C:/Users/USER/Documents/GitHub/coop-sys` and `C:/Users/USER/Documents/GitHub/hr-management`.

Inspected coop-sys paths:

- `src/features/payments/components/PlacementSearchField.tsx`: case-insensitive local mixed branch/client search, ten-option cap, parent branch labels, Building2/Search/X/Check Lucide icons, immediate stable ID selection, clear, blur dismissal. Arrow-key navigation is not implemented there; implement it independently here.
- `src/features/payments/components/PaymentSummaryPanel.tsx`: deferred free text, placement IDs passed as branch/client predicates, sort/reset/page-size controls, obsolete response suppression, loading/errors; server callback pagination.
- `src/services/repositories/supabase/SupabasePaymentRepository.ts`: `payment_summary_page` RPC receives IDs, sorting and pagination. This observation does not establish its database security.
- `src/components/ui/DropdownSurface.tsx`: viewport-aware fixed positioning, flip above/below, visualViewport handling.
- `src/styles.css`, `tailwind.config.js`: moss #287353, ink #17211c, paper #f4f7f5, line #dfe6e1; Segoe UI/system sans, compact bordered inputs, subtle panel shadows.

Inspected hr-management: `js/core/table-layout.js` (order reconciliation/frozen key normalization); `js/core/table-enhancer.js` (measured sticky offsets and boundary, pinning disabled below 721px); `js/app.js` `openTableViewSettings`/save/reset (show/freeze, arrows and drag, personal saved preferences). A live sample preview was not present in this inspected dialog; implement draft preview independently. Screenshot asset was not supplied in workspace.

No root license was located in either application snapshot, so no source/assets are copied. Patterns are implemented independently. Installed UI UX Pro Max `.agents/skills/ui-ux-pro-max/SKILL.md` was read and its search tool run without installation. The user's navy/gray redesign request supersedes the original moss visual identity; the shared search/filter behavior remains based on the reference patterns.

Current visual direction: the user-supplied compact employee-directory image and the global installed UI UX Pro Max skill at `C:/Users/USER/.codex/skills/ui-ux-pro-max/SKILL.md`. Its Data-Dense Dashboard recommendation is applied to the existing React web application; native-only and marketing/hero guidance does not fit this app. Light navigation and white data surfaces use navy accents over a gray canvas. No reference logo/assets or unrelated HR modules are copied. The breadcrumb is the single page heading. Demo status is a small header badge, and refresh is a header icon control. The existing system sans avoids an external font dependency.

Tokens: navy #14243d, navy raised #223a5b, action blue #234a7d, gray canvas #f1f3f7, ink #18263b, muted #56647a, border #dbe1ea, input boundary #8492a6. System sans, 12–14px table labels, 4/8px spacing, 6px control/8px panel radius. Desktop controls are 32–36px; phone controls retain 44px touch targets and 16px inputs. Toolbar dropdowns fit their labels and use icons only where meaningful. The employee toolbar is one row: search, desktop status, Saved View, More Filters, and Reset. Scope and column filters share the More Filters modal; phone layouts use compact icons and move status into that popover. No separate Saved View / Column Filters row consumes data space. Selection actions appear when rows are selected. Desktop rows are 40px and phone rows 48px. Sort direction, selected rows, and partial selection remain explicit. Success/danger retain semantic colors and text labels.

The shared workspace fills the dynamic viewport. Navigation, header, employee toolbar, pagination, and footer remain stationary while only the table body scrolls; movement/audit list bodies use the same bounded data-panel pattern. Form/configuration content can scroll inside its main region without moving the workspace header or footer. Short landscape layouts collapse scope filters to preserve room for records. Popovers and dialogs remain viewport-bound. `AGENTS.md` carries this standard forward to future UI work.

Design verification lives in `.test-db/e2e/design.spec.ts`: all eight routes at 375px and 1440px, selected text contrast >=4.5:1, navigation state, keyboard focus, bounded movement pickers, collapsed filters, partial row selection, and stationary pagination/toolbars during table scrolling on phone, desktop, and landscape screens. Existing interface tests cover 320–2560px, picker behavior, frozen columns, modal bounds, and reduced motion. Screenshots and reports stay under ignored `.test-db/reports/`.

Scope and column filters use the shared More Filters `Popover` component as a centered modal with a dimmed backdrop, without shifting rows or pagination. Simple toolbar pickers remain compact dropdowns. Shared `FloatingNotification` messages float above every page and modal; they are dismissible except while loading and never reserve space in the data layout. Keep actionable confirmations within their forms.

More Filters follows the compact control spacing, restrained dropdown surfaces, and label/context hierarchy reviewed in the local coop-sys `PlacementSearchField.tsx`, `DropdownSurface.tsx`, and `PaymentSummaryPanel.tsx`. Assignment scope and column rules are grouped with paired controls. Nested pickers reuse the same panel via `PickerSurface`, with a Back control, searchable options, and contained scrolling; no second dropdown overlaps the panel or pagination. Back and Cancel discard uncommitted multi-select choices, while Apply commits stable IDs. Keyboard focus includes the shared header and returns to the original trigger. Three regression tests cover phone, desktop, and short landscape panel bounds, focus, draft cancellation, and unchanged table layout. Reference files remain read-only; patterns are implemented independently.

Every UI mutation uses a shared native modal confirmation with an operation-specific title and Continue/Cancel controls. The mutation is not sent until confirmed; cancel preserves its draft. Closing an edited dialog prompts Discard changes/Continue editing, including Escape and the close control. Database permission checks, atomic transactions, version checks, and request idempotency remain authoritative.

Shared modal headers use a single compact title and close icon; all modal footers use the same action spacing. Customize Columns groups view name/visibility settings above an ordered, scrollable column list and live preview, with side-by-side panes on desktop and stacked panes on narrow screens. Move/pin controls are compact on desktop and 44px on phones. All edited dialogs share the warning-style Discard unsaved changes dialog, with Continue editing and red Discard changes actions. Page section labels describe their data rather than repeat breadcrumb titles.

More Filters is a centered, viewport-bound modal with a dimmed backdrop and trapped keyboard focus. Nested selection views remain in its surface. Shared multi-select footers use one action row; bulk selection tools appear above larger lists only, and selection counts remain available to screen readers. Desktop option rows are 36px and touch rows remain 44px.

Movements, Organization and Audit now share `RecordExplorer`: compact header/search controls, bounded More Filters, sortable headers, a scrolling data region, and stationary compact pagination. Transactions use secured employee search beyond the loaded register page. System ID and Employee Name retain their default identity-column order; Client-based ID follows them. Visible Columns keeps its approved layout. Workbook policy editing uses the same modal, floating errors and confirmation patterns as other editors. `.test-db/e2e/records.spec.ts` covers list bounds at 320px, tablet, desktop and short landscape, remote employee selection, and the client-prefix creation flow.

## Current approved directory reference (2026-10-11)

The latest supplied directory image supersedes the earlier employee-directory layout. Use a dark navy section header with restrained active tabs, a narrow desktop icon rail with accessible names/tooltips, a pale gray workspace, compact left-aligned search and filter controls, and a white table with muted icon-labelled headers and fine dividers. Keep the existing navy action palette. Phones retain the labelled navigation drawer and compact header; desktop section tabs scroll within their own area when space is limited. Only records scroll; toolbar and pagination remain stationary.

Inputs use a subtle filled focus state with a stable border. Do not draw an input outline or external focus shadow inside composite search fields. Buttons and navigation retain keyboard focus indicators. Applied filters are represented in their picker triggers with the existing X clear controls and More Filters count; do not render a separate chip row below the toolbar. Preserve all filters, saved views, permissions, frozen columns, exports, transaction confirmations, and modal editing behavior. The uploaded reference supplies visual direction only; unrelated HR modules, imports and third-party side rails are outside this application's scope.

Verification: `.test-db/e2e/directory-reference.spec.ts` exercises stable input bounds without focus outlines/shadows, inline Status clearing, no applied-filter chip row, unchanged table position, and the compact desktop rail. Existing responsive, modal, permission-projection and column-layout tests remain applicable.

The register uses minimal outer spacing, a 48px desktop header, a compact toolbar/footer and uniform 36px employee rows. Touch layouts retain 44px actions and 50px rows. `contentWidths` sizes employee and record-list columns from their already-authorized display projection and header labels, bounded to 88–360px; the table keeps its intrinsic width rather than stretching short columns. Unusually long values retain full text in cell tooltips and employee record editors. Selected picker labels and option descriptions wrap inside their bounded control; saved-view triggers show the chosen name. No separate applied-filter row is added.

All mutations and hosted transaction previews use shared progress tracking after confirmation. A floating loading message appears after 600ms, adds an extended-wait explanation after eight seconds, and disappears on success or failure. It uses the active native modal's top layer when an editor is open, preserving layout and draft state. Concurrent requests remain tracked independently; no automatic mutation retries are introduced. Unit lifecycle checks and `.test-db/e2e/density.spec.ts` cover settlement, failure, column sizing, uniform rows, laptop density, long labels and delayed modal feedback.

Field Definitions shares the stationary workspace frame and uses a compact grouped table, searchable by label, machine key and help text, with group/status pickers and existing edit actions. Its definition editor uses a labelled two-column grid on desktop and one column on phones. Access Rules separates policy management, accounts/capabilities and register display settings. Policy forms have compact spacing and readable labels; the current policy list sits beside the editor on wide screens and below it on narrow screens. Only the administration content region scrolls.

The optional No. column is always pinned before selection and employee identity columns. Numbers indicate positions in the current filtered/sorted result and continue across pages. Superadmins allow or disable this display under Permissions → Register settings; users hide/show it in Customize Columns when allowed. Personal view preferences persist, but never override the global display setting. No. is presentation metadata, not an editable field, persistent employee identifier or authorization boundary; it is omitted from export and synchronization.

Pagination uses a shared compact native `RowsPerPage` selector for the fixed
10/25/50/100 values; it is pagination configuration, not an entity/list filter.
It has no search, clear or confirmation controls and resets the offset on change.
The existing searchable picker remains the standard for data filters.
Employee data rows open the existing secured profile editor on click or Enter/Space.
Bulk-selection checkboxes and existing interactive cell actions keep their own
behavior; column previews remain read-only.

Number fields reuse the existing decimal storage type and appear as Number in
Field Builder; Integer stays separate. Shared editors, table cells, bulk previews
and record history format Number values with grouping commas and two fractional
digits. Editors reveal the stored numeric precision on focus; formatting does not
round stored values or change numeric filtering/export behavior. Malformed numeric
text is rejected before employee saves, bulk previews and numeric-default saves.

Employee value clearing uses labelled inline X controls rather than a separate
Clear value action below each input. Existing-record clearing requires the field's
Delete permission; selectors reuse their clear control. Confirmation and unsaved
change handling remain shared. Inputs and clear buttons have separate accessible
labels, with touch controls kept within the input bounds.

Profile defaults are grouped into personal information, contact details and
employment information. Email/Phone share Profile. Default sections precede custom
sections: Profile, Government ID, Address, then administrator-added tabs. The
Additional information group is the default destination for new field definitions.
The tab-order helper recognizes default entries while retaining authorized group
membership and configurable tab names; tab grouping never grants field access.
Employee name entry always uses Last Name, First Name, Middle Name and Suffix.
Existing unstructured names are displayed as recorded, not inferred or split.
Initial position is captured only at employee creation; later position/status
changes retain the existing movement workflow and effective history.

The approved ui-styling direction uses flat form sections, shared thin dividers,
quiet surfaces and compact labels across the application. Employee forms use a
section rail on desktop and horizontal tabs on phones. Wide employee/movement
editors share width/height tokens, with stationary headers and footers and only
their bodies scrolling; movement entry, preview and Back preserve the same frame.
Compact confirmations retain their own smaller viewport-bound size.

Department and Position are paired in the employment section. Authorized profile
position edits save as an effective-today position movement in the same database
transaction as other changed fields, preserving movement permissions, conflicts,
versions, audit/outbox and request idempotency. Status still uses Movements.

Shared controls size by purpose: dates, government IDs, numeric values and short
choices have bounded widths; general text and addresses use their available form
column. Choice widths use the option names with room for arrows/clear controls,
bounded by their parent. Long labels wrap, touch heights remain 44px, and toolbar
pickers retain their compact behavior. Widths do not resize on every keystroke.
Employee entry groups use wrapping field slots rather than equal-width stretching:
names have readable bounded widths, Suffix stays short, contact controls have their
own widths and Department/Position stay paired when space permits. Remarks and
address sections keep the available full width; phones stack the entries.

Government IDs default to required restricted text fields, excluded from table
columns by default. Validation is duplicated in the shared editor and PostgreSQL:
BIR TIN is the 9-digit personal TIN (branch code excluded), SSS has 10 digits, and
PhilHealth PIN/Pag-IBIG MID have 12. Spaces and hyphens normalize to digits while
leading zeroes remain intact. These checks validate syntax, not agency issuance.
New records require all applicable mandatory IDs and explicit field Create grants.
Existing absent IDs are not fabricated and do not block unrelated profile edits;
once supplied, a required ID cannot be cleared. Existing explicit policies and
organization boundaries remain enforced. Profile-required rules are configurable.
Status Reason and Status Effective Date are profile context, not replacements for
status movement transactions or their effective dates.
