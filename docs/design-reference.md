# Read-only design review

Verified live main on 2026-10-10 (Asia/Manila): coop-sys `54bbf05cc9211a603a011051803e5de44a815319`; hr-management `99a28c937f16c8f582649ea8c89370ff00cb032d`. Snapshots cloned under Codex temporary storage; reference checkouts were never edited. User also permits relevant read-only inspection at `C:/Users/USER/Documents/GitHub/coop-sys` and `C:/Users/USER/Documents/GitHub/hr-management`.

Inspected coop-sys paths:

- `src/features/payments/components/PlacementSearchField.tsx`: case-insensitive local mixed branch/client search, ten-option cap, parent branch labels, Building2/Search/X/Check Lucide icons, immediate stable ID selection, clear, blur dismissal. Arrow-key navigation is not implemented there; implement it independently here.
- `src/features/payments/components/PaymentSummaryPanel.tsx`: deferred free text, placement IDs passed as branch/client predicates, sort/reset/page-size controls, obsolete response suppression, loading/errors; server callback pagination.
- `src/services/repositories/supabase/SupabasePaymentRepository.ts`: `payment_summary_page` RPC receives IDs, sorting and pagination. This observation does not establish its database security.
- `src/components/ui/DropdownSurface.tsx`: viewport-aware fixed positioning, flip above/below, visualViewport handling.
- `src/styles.css`, `tailwind.config.js`: moss #287353, ink #17211c, paper #f4f7f5, line #dfe6e1; Segoe UI/system sans, compact bordered inputs, subtle panel shadows.

Inspected hr-management: `js/core/table-layout.js` (order reconciliation/frozen key normalization); `js/core/table-enhancer.js` (measured sticky offsets and boundary, pinning disabled below 721px); `js/app.js` `openTableViewSettings`/save/reset (show/freeze, arrows and drag, personal saved preferences). A live sample preview was not present in this inspected dialog; implement draft preview independently. Screenshot asset was not supplied in workspace.

No root license was located in either application snapshot, so no source/assets are copied. Patterns are implemented independently. Installed UI UX Pro Max `.agents/skills/ui-ux-pro-max/SKILL.md` was read and its search tool run without installation. The user's navy/gray redesign request supersedes the original moss visual identity; the shared search/filter behavior remains based on the reference patterns.

Current visual direction: UI UX Pro Max's Minimalism & Swiss Style enterprise recommendation, adapted to a data-entry workspace. Marketing hero/CTA recommendations are deliberately excluded. Navy navigation, gray canvas, white data surfaces, compact counts, placement/status breakdowns, and the employee table establish the hierarchy. The breadcrumb is the single page heading; the register begins with its record count and action toolbar. Demo status is a small header badge, and refresh is a header icon control. Login uses factual module labels rather than promotional copy. The existing system sans avoids an external font dependency.

Tokens: navy #14243d, navy raised #223a5b, action blue #234a7d, gray canvas #f1f3f7, ink #18263b, muted #56647a, border #dbe1ea, input boundary #8492a6. System sans, 12–14px table labels, 4/8px spacing, 6px control/8px panel radius. Solid navy primary actions, quiet icon/text toolbar actions, visibly bounded filter inputs, and inline record links have distinct roles. Success/danger retain semantic colors and text labels. 44px controls, visible focus, reduced motion. Bounded scroll tables; on phones only one compact pinned identity column. Responsive wrapping filters and viewport-safe sheets preserve existing keyboard and draft/apply/cancel behavior.

Design verification lives in `.test-db/e2e/design.spec.ts`: all eight routes at 375px and 1440px, selected text contrast >=4.5:1, navigation state, keyboard focus, and synthetic screenshots. Existing interface tests cover 320–2560px, landscape, picker behavior, frozen columns, modal bounds, and reduced motion. Screenshots and reports stay under ignored `.test-db/reports/`.
