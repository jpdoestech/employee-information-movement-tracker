# Read-only design review

Verified live main on 2026-10-10 (Asia/Manila): coop-sys `54bbf05cc9211a603a011051803e5de44a815319`; hr-management `99a28c937f16c8f582649ea8c89370ff00cb032d`. Snapshots cloned under Codex temporary storage; reference checkouts were never edited. User also permits relevant read-only inspection at `C:/Users/USER/Documents/GitHub/coop-sys` and `C:/Users/USER/Documents/GitHub/hr-management`.

Inspected coop-sys paths:

- `src/features/payments/components/PlacementSearchField.tsx`: case-insensitive local mixed branch/client search, ten-option cap, parent branch labels, Building2/Search/X/Check Lucide icons, immediate stable ID selection, clear, blur dismissal. Arrow-key navigation is not implemented there; implement it independently here.
- `src/features/payments/components/PaymentSummaryPanel.tsx`: deferred free text, placement IDs passed as branch/client predicates, sort/reset/page-size controls, obsolete response suppression, loading/errors; server callback pagination.
- `src/services/repositories/supabase/SupabasePaymentRepository.ts`: `payment_summary_page` RPC receives IDs, sorting and pagination. This observation does not establish its database security.
- `src/components/ui/DropdownSurface.tsx`: viewport-aware fixed positioning, flip above/below, visualViewport handling.
- `src/styles.css`, `tailwind.config.js`: moss #287353, ink #17211c, paper #f4f7f5, line #dfe6e1; Segoe UI/system sans, compact bordered inputs, subtle panel shadows.

Inspected hr-management: `js/core/table-layout.js` (order reconciliation/frozen key normalization); `js/core/table-enhancer.js` (measured sticky offsets and boundary, pinning disabled below 721px); `js/app.js` `openTableViewSettings`/save/reset (show/freeze, arrows and drag, personal saved preferences). A live sample preview was not present in this inspected dialog; implement draft preview independently. Screenshot asset was not supplied in workspace.

No root license was located in either application snapshot, so no source/assets are copied. Patterns are implemented independently. Installed UI UX Pro Max `.agents/skills/ui-ux-pro-max/SKILL.md` was read and its search tool run without installation. Minimal enterprise style guidance is applied; generic hero/CTA suggestions do not fit this data-entry app, and its proposed blue palette is subordinate to the verified coop-sys visual identity.

Tokens: system sans 16px body, 12–14px table labels, 4/8px spacing, 6px control/12px panel radius, moss primary, dark ink, muted #56655d. 44px controls, visible focus, reduced motion. Bounded scroll tables; on phones only one compact pinned identity column. Responsive wrapping filters and viewport-safe sheets; accessible modal focus/escape/cancel, 200% zoom, landscape and 320–2560px tests.
