# AMS UI reference for Employee Tracker

Use [CODEX_PROMPT.md](CODEX_PROMPT.md) as the implementation prompt. These documents supply the reference; they do not change the application.

Target: `employee-information-movement-tracker`, branch `codex/standalone-tracker`.
Reference: the local AMS interface, with self-contained snapshots indexed in [SOURCE.md](SOURCE.md).

## Preserve the tracker

Port appearance and UI preference behavior, not attendance or payroll logic. The tracker specification and `AGENTS.md` govern its processes. Continue/Cancel confirmations, draft protection, server-side permissions, field applicability, synchronized data, exports, filters, and pagination must keep their existing behavior.

The tracker already has suitable shared React controls. Adapt them instead of embedding AMS scripts or its imperative DOM rendering. Keep this reference folder outside the application bundle.

## Source-to-target map

| AMS reference | Existing tracker location | Adaptation |
| --- | --- | --- |
| `source/styles.css.txt` theme tokens and compact workspace rules | `src/styles.css` | Map colors into existing tokens; preserve typography and component contracts |
| `source/theme.js.txt` | `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css` | Add appearance initialization and selector using the current stack; no AMS global or storage keys |
| `source/layout.js.txt` and sidebar CSS | `src/App.tsx`, `src/styles.css` | Collapsed desktop appearance and labelled mobile navigation |
| `#emt`, `.wrap`, `.pgbar` CSS | `src/components/EmployeeTable.tsx`, `src/components/RowsPerPage.tsx`, `src/components/RecordExplorer.tsx`, `src/tableSizing.ts` | Compact stationary data workspace; preserve authorization, widths, pinned columns, sorting and page counts |
| `.modal-header`, `.modal-body`, `.modal-footer`; `source/modal-layout.js.txt` | `src/components/Dialog.tsx`, `src/styles.css` | Bounded width, fixed chrome, scrolling body; retain native dialog and draft protection |
| `source/confirm-dialog.js.txt` | `src/components/TransactionConfirmation.tsx` | Visual reference only; retain tracker's mandatory confirmations and operation-specific labels |
| `source/ui.js.txt` icons and controls | Existing Lucide icons, `src/components/FieldTypeIcon.tsx`, shared controls | Consistent sizing and accessible names; no duplicate icon library |
| Compact AMS filters and information popovers | `src/components/FilterBar.tsx`, `SearchFilterPicker.tsx`, `Popover.tsx`, `PickerSurface.ts` | Use existing selection, focus, draft, and filtering semantics |
| Overlay notifications | `src/components/FloatingNotification.tsx`, `TransactionProgress.tsx` | Preserve layering, delayed progress, settlement and error behavior |

Inspect each component before changing it; these mappings are entry points, not instructions to edit every file.

## Color reference

Use semantic tokens rather than scattering raw colors through components. Preserve distinct success, warning, error, selected, disabled, and focus states.

| Role | AMS Light | AMS Dark |
| --- | --- | --- |
| Canvas | `#f3f5f8` | `#1b1c1e` |
| Surface | `#ffffff` | `#252629` |
| Main text | `#212529` | `#e1e1e1` |
| Secondary text | `#59616d` | `#adb3bd` |
| Border | `#d5dbe3` | `#454951` |
| Table/header surface | `#edf0f4` | `#2d2f33` |
| Primary accent | `#1d5dc0` | `#80adff` |
| Text on primary | `#ffffff` | `#172337` |
| Subtle accent | `#e8f0fc` | `#263750` |
| Navigation surface | `#f8f9fb` | `#202124` |
| Focus indicator | `#1d5dc0` | `#80adff` |

Example token mapping: AMS `--bg` → tracker `--paper`, `--tx` → `--ink`, `--mu` → `--muted`, `--bd` → `--line`, `--pr` → `--primary`, `--ring` → `--focus`. Check each token's actual use first; surface and canvas may need separate tokens. Never recolor statuses or selection to become indistinguishable.

## Dimensions and behavior

- Preserve the tracker's existing fixed typography scale and local fonts. No web-font downloads.
- Preserve 36px desktop employee rows and 50px touch rows. AMS uses 34px desktop employee rows; this is a visual reference, not a reason to violate the tracker requirement.
- Desktop controls: 32–36px. Touch hit areas: at least 44px. Form grids: three columns where comfortable, two on tablets, one on narrow phones.
- Employee dialog width: approximately 880px maximum. Simple dialog: approximately 680px. Table dialog: approximately 960px. Use viewport limits and preserve wider layouts when their content needs them.
- Employee forms and schedules can have a stable bounded height. Small dialogs should fit their contents. Headers/footers do not scroll with the body.
- Compact desktop rail can be about 60px; expanded navigation should fit its labels. Mobile navigation must retain visible labels and a reachable close control.
- Data tables may scroll horizontally inside their own regions. The whole page must not overflow horizontally.
- Help popovers must work on hover, focus, and tap, with dismissal and readable text. Do not hide required labels or errors in tooltips.

## Differences to keep intentional

| AMS pattern | Tracker requirement |
| --- | --- |
| Some attendance saves skip confirmation | Keep every required tracker mutation confirmation |
| Applied-filter chip row | Keep selected values and clear controls in existing filter triggers |
| 34px desktop employee rows | Keep 36px desktop / 50px touch rows |
| Plain JavaScript DOM helpers | Keep React components and their existing state ownership |
| Attendance codes, pay profiles, and duty actions | Keep only tracker features and field applicability |
| AMS-specific storage keys | Use tracker-specific preference keys |

## Acceptance checklist

- Existing business and data flows still work with the same permissions, requests, validations, confirmations and exports.
- Light/Dark/System preferences survive reload; System follows OS changes without resetting drafts or making extra data requests.
- Tables stay compact, pinned identities remain usable, pagination stays stationary, and long content stays within bounded data regions.
- Modals fit the viewport with stationary chrome; cancel/close behavior preserves existing draft safeguards.
- Filters retain their semantics; focus and nested pickers remain accessible.
- Phone, tablet, laptop, desktop and short landscape layouts pass checks in both themes.
- Existing build and relevant tests pass; all new verification files live under `.test-db`.

This pack does not verify a redesigned tracker UI: implementation and browser validation are the next task.
