# UI-00 — review and phase acceptance

## UI-00 delivery

- [x] Current branch/HEAD and remote checked against `f5ea0b5`.
- [x] Supplied master prompt, repository requirements, relevant code/docs and current test infrastructure inspected.
- [x] Both supplied reference images opened and visually inspected.
- [x] Screen inventory, prioritized findings, component reuse, token proposal, parity boundaries, responsive plan and phased roadmap documented.
- [x] Representative desktop/mobile dashboard rendered with current components and existing synthetic data.
- [x] Intentional visual differences documented; reference branding, identities, payroll, unrelated charts and modules excluded.
- [x] Prototype source/config/tests and generated verification output are contained under `.test-db`.
- [x] Production runtime source, dependencies, API contracts, database migrations, RLS and business workflows unchanged.
- [x] Final focused test results and visual screenshot review attached to the handoff: 16 browser checks across nine viewport sizes, plus isolated frontend/Vite configuration type checking. Baseline inventory captures were refreshed after data settled.
- [x] User approves representative desktop and mobile direction (2026-11-05: "approved").

The final two items are separate: automated/visual review by the implementer does not substitute for user approval. No production-wide redesign is authorized by checking the other boxes.

## Future release requirements

All existing features remain available at every relevant viewport and permission level. No hidden data appears through markup, previews, filters, exports or new dashboard widgets. No UI-only check replaces server authorization, validation, versions or request idempotency. Every mutation retains shared Continue/Cancel; closing a changed draft retains Discard changes/Continue editing.

Stationary list headers/toolbars/pagination and scroll owners remain consistent. Desktop controls stay compact; mobile targets retain at least 44px. Fonts remain local, labels readable, focus visible, reduced motion supported, and long forms/dropdowns viewport-bound. Tables remain efficient data tables rather than an incomplete replacement.

Apply the same reviewed tokens and shared primitives to Employees, Movements, PRFs, RBAC and Administration in their own phases. Test active/inactive/scheduled permissions, stale data, concurrent edits, slow requests, cancellation and mixed-role navigation at the responsible phase.

**UI-00 review gate passed:** the user approved both representative designs on 2026-11-05. The harness stays isolated. UI-01 may refine shared tokens and primitives; shell/module redesigns follow their own phases.

## UI-01 acceptance

- [x] Light/dark semantic colors have one production owner in `src/styles.css`; `appearance.css` consumes them.
- [x] Approved neutral canvas, white surfaces/navigation, blue actions and restrained shadows are applied through shared tokens.
- [x] Existing fixed typography, 6px controls and 8px card/picker surfaces are retained; compact/normal/touch control sizes are named tokens.
- [x] Touch-sized layouts and coarse pointers resolve shared controls to at least 44px without enlarging text.
- [x] Editable input boundaries use a stronger neutral than the prototype to reach 3:1 contrast in resting and filled-focus states; focus does not move controls or add nested search borders.
- [x] Production build and all 175 unit checks pass. The 29 existing appearance/typography/toolbar browser checks passed; all five new design-system checks passed after correcting the test's keyboard modality and required-field label lookup.
- [x] Rendered light/dark desktop/mobile screenshots inspected. Evidence: `.test-db/reports/ui-modernization/ui01-register-{theme}-{width}.png` and `ui01-editor-{theme}-{width}.png` for light/dark at 390px and 1440px.
- [x] No business logic, API, permission, schema, synchronization or dependency changes.
- [x] Separate [UI-01 draft PR #4](https://github.com/jpdoestech/employee-information-movement-tracker/pull/4) includes validation and intentional differences; based on the UI-00 review branch to keep the phase diff separate.

Commands: `npm run build`, `npm test`, and `npx playwright test --config .test-db/playwright.config.ts design-system.spec.ts appearance.spec.ts typography.spec.ts toolbar-ux.spec.ts`. The five new checks were rerun independently with `design-system.spec.ts`; no runtime edit was required after the existing 29 checks passed. Coverage includes reduced motion, local fonts, light/dark text and editable-border contrast, stable filled search focus, visible keyboard focus, picker bounds, draft cancellation, stationary footers, scroll bounds and a coarse-pointer tablet. Existing unit/browser tests remain unchanged.

This phase does not certify all screen contrast or production RBAC. Native/REST database suites and physical-device/screen-reader checks were not rerun for CSS-only changes. Existing build notices about chunk size and mixed static/dynamic API imports remain outside UI-01.

## UI-02 through UI-07 acceptance

- [x] Desktop starts with labelled navigation and honors saved collapsed preferences.
- [x] Bottom navigation and drawer share the existing authorized destination catalog, route handling and draft guard.
- [x] Mobile controls remain at least 44px; bottom safe areas do not obscure forms or pagination. Short landscape uses a compact bar and omits the informational footer.
- [x] Register sorting, pagination, frozen columns, column settings and managed/personal view behavior remain implemented by the original secured components.
- [x] Employee view/add/edit/history preserve dynamic fields, addresses, name casing, masking, applicability, scope and confirmations.
- [x] Administration retains all matrix actions and permission sources; the new state legend stays inside existing help disclosures.
- [x] All six dashboard metrics and five breakdowns remain; desktop/mobile compositions follow the approved visual target.
- [x] Movements, PRF assignments, sync and audit workflows keep existing API and mutation boundaries.
- [x] UI-00 prototype CSS/DOM navigation scaffolding is removed; the isolated preview renders the actual application.
- [x] Final dashboard and module screenshots rendered at desktop/phone sizes, with dashboard bounds checked at nine viewport sizes.
- [x] Full browser suite and targeted sort rerun cover all 355 cases. All 177 unit tests and 172 disposable PostgreSQL checks passed.
- [x] Final phase PR and production deployment evidence recorded in the [implementation log](08_IMPLEMENTATION_LOG.md).

Physical iOS/Android devices, screen-reader operation, 200% browser zoom and complete WCAG certification are not claimed by the automated viewport checks. These remain explicitly reported limitations, not missing application modules.
