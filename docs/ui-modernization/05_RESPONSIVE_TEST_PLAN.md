# UI-00 — responsive and accessibility verification

Focused command: `npx playwright test --config .test-db/ui-modernization/playwright.config.ts`.

| Viewport | Purpose |
|---|---|
| 320 × 740 | Small phone: labels, touch targets, no document overflow |
| 375 × 812 / 390 × 844 | Primary phone layouts and stationary bottom navigation |
| 768 × 1024 | Tablet desktop-shell transition and compact panel arrangement |
| 1024 × 768 / 1280 × 800 | Small desktop / laptop density |
| 1440 × 1000 | Representative desktop screenshot |
| 1920 × 1080 | Wide desktop proportions without oversized controls |
| 844 × 390 | Short landscape and viewport-bound selectors |

The isolated checks cover six metrics and five panels, matching baseline/proposal metric text, no document-wide horizontal overflow, stationary toolbar/bottom bar during content scrolling, 44px mobile navigation controls, date-picker bounds and 90D selection, original PRF dialog, More/drawer Escape, selected route, dark theme and focused control, selected card-text contrast >= 4.5:1, plus baseline inventory captures. External HTTP requests are blocked; no production data or third-party font requests are needed.

All generated files live under `.test-db/reports/ui-modernization/` and `.test-db/results/ui-modernization/`. Test source, preview source and configuration live under `.test-db/ui-modernization/`. The references themselves are documentation inputs under `docs/ui-modernization/references/` and remain unchanged.

## Visual review

Compare the desktop and mobile reference images with `proposed-dashboard-desktop.png`, `proposed-dashboard-mobile.png`, lower-content screenshot, and baseline captures. Inspect navigation density, card hierarchy, whitespace, typography, chart labels and persistent actions. Actual content differs intentionally; an image-difference percentage is not a useful fidelity score here.

Baseline inventory captures cover Employees, Movements, Organization, Field Builder, Permissions, Sheets sync and Audit at phone/desktop sizes. Capture alone does not mean every business flow was tested. Deep feature parity remains a later-phase gate.

## Before production shell changes

- Integrate a single authorized navigation model and shell-owned callbacks; remove prototype DOM action bridging.
- Verify bottom navigation with ordinary and denied accounts, all drawer destinations, native dialog top layer and background inertness.
- Verify employee dirty guards through every navigation entry, repeated browser Back, sign out and keyboard dismissal.
- Test physical iOS Safari/Android Chrome, dynamic browser bars, safe-area padding, virtual keyboard and orientation changes.
- Check 200% browser zoom, text scaling, long labels/translations, Windows high contrast, complete light/dark contrast, actual screen-reader announcements and focus order.
- Validate all existing register, movement, PRF, field-builder and RBAC workflows at the applicable phase; retain all current security/database checks.

This is a focused prototype evaluation, not WCAG certification or a fresh full regression/security audit. No physical-device, real screen-reader or hosted database testing is claimed for UI-00.
