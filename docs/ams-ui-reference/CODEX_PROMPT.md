# Prompt: apply the AMS user experience to Employee Tracker

Work in this repository on its existing `codex/standalone-tracker` branch:
`C:/Users/USER/Documents/GitHub/employee-information-movement-tracker`.

I like the compact, data-focused UI of my AMS project. Apply its visual style and relevant interface patterns to this tracker, while preserving every existing process and feature. Implement the styling changes; do not stop at a proposal.

Read `AGENTS.md`, the authoritative v1.8 specification in `docs/`, and these local references first:

- `docs/ams-ui-reference/README.md`: scope, component mapping, colors, dimensions, and acceptance criteria.
- `docs/ams-ui-reference/SOURCE.md`: reference provenance and snapshot index.
- `docs/ams-ui-reference/source/`: self-contained, read-only snapshots of the AMS styling and appearance helpers.

Use the installed `ui-styling` skill as the primary styling guide and `ui-ux-pro-max` for accessibility and responsive review. Inspect the existing tracker controls before editing. Reuse its React components, Lucide icons, semantic tokens, table sizing, pickers, dialogs, and notifications. The AMS snapshots illustrate appearance; they are not replacement runtime modules.

## Non-negotiable: preserve processes

This is a presentation update. Preserve all workflows, field applicability, configured fields, data values, permissions, server-authorized projections, RPCs, filters, counts, sorting, deterministic pagination, exports, synchronization boundaries, approvals, validation, optimistic versions, atomic writes, and idempotency. Preserve selections and unsaved drafts through UI interactions.

Keep all tracker Continue/Cancel mutation confirmations and Discard changes/Continue editing prompts. Do not import the AMS exception that permits saving duty without confirmation. Keep existing action availability and account/role behavior. Do not add attendance, payroll, regional wage rules, or other AMS business features.

Do not change Supabase schema, RLS, backend services, credentials, or business logic to achieve a visual result. Do not rename persisted values, field keys, stable IDs, routes, or export columns. Never remove functionality to make a screen cleaner. Do not introduce dependencies or replace the stack for styling.

## Desired presentation

1. Compact professional ERP appearance: restrained blue accents, neutral surfaces, thin borders, consistent icons, modest radii, readable data, and minimal decorative spacing.
2. System, Light, and Dark appearance preferences. Apply the stored preference before first paint; System follows OS changes; explicit Light/Dark remain stable. Persist UI preferences under tracker-specific keys. Theme changes must not reload application data or reset user state.
3. Keep the tracker typography scale and uniform rows: 36px employee rows on desktop and 50px on touch layouts. Desktop controls stay 32–36px; touch targets stay at least 44px. Never enlarge table rows merely to fill the viewport.
4. Stationary navigation, compact toolbars, pagination, and footer; only the data area scrolls. Preserve pinned identity columns, row ordinals, visible selection/sort states, content-based bounded column widths, and full values in the editor.
5. Compact, clickable breadcrumbs showing the current location. Remove duplicated large titles and promotional introductory copy, while retaining meaningful section labels and accessible page names. Keep existing destinations and workflow navigation intact.
6. Collapsible desktop sidebar or icon rail with accessible names; labelled mobile navigation. Persist only its appearance preference and keep navigation reachable by keyboard and touch.
7. Consistent viewport-bound modals: one compact title and close icon, stationary header/footer, internally scrolling body. Match width to content; employee forms should usually cap around 880px, simple dialogs around 680px, and table editors around 960px. Preserve any demonstrated need for a wider existing editor. Never force every dialog to full width or full height. Keep focus trapping, restoration, Escape behavior, unsaved-change protection, and nested picker surfaces.
8. Appropriate icon/button hierarchy: distinct primary action, restrained secondary actions, red destructive actions, disabled/busy states, accessible names for icon-only buttons, and visible keyboard focus. Preserve field-type icons.
9. Short hover/focus/tap information popovers may replace long static help text without hiding validation or essential instructions. Preserve safe text rendering and touch access.
10. Preserve tracker filter conventions: selected values and X clear controls inside triggers; no new applied-filter chip row. Keep existing Apply/Cancel semantics, secured search, `PickerSurface`, notifications, and transaction progress.

Adapt these patterns across existing screens and shared components. Change shared styles first; make component changes only where the presentation requires them. Do not rewrite components wholesale. Do not edit the AMS reference repository or these snapshots.

## Validate and finish

Verify desktop/laptop (1366×768 and 1920×1080), tablet (768×1024), phone (390×844), and short landscape (844×390), in Light and Dark modes. Confirm System mode, persistence, scrolling, table bounds, stationary modal chrome, draft preservation, accessible focus, touch controls, picker bounds, and no page-level horizontal overflow. Horizontal scrolling inside wide data regions is allowed.

Run the existing build and relevant tests. Keep new tests and verification artifacts under `.test-db`, as required by `AGENTS.md`. Add focused regression coverage for new appearance behavior such as theme persistence or sidebar state. Do not weaken authorization, validation, or workflow checks to get tests passing.

Report a commit-ready **Summary** and **Description**, checks performed, and any unverified behavior or risk. Describe UI changes separately from application behavior, which must remain intact. Follow existing repository and user instructions for commits and pushes.
