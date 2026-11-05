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
- [ ] User approves representative desktop and mobile direction.

The final two items are separate: automated/visual review by the implementer does not substitute for user approval. No production-wide redesign is authorized by checking the other boxes.

## Future release requirements

All existing features remain available at every relevant viewport and permission level. No hidden data appears through markup, previews, filters, exports or new dashboard widgets. No UI-only check replaces server authorization, validation, versions or request idempotency. Every mutation retains shared Continue/Cancel; closing a changed draft retains Discard changes/Continue editing.

Stationary list headers/toolbars/pagination and scroll owners remain consistent. Desktop controls stay compact; mobile targets retain at least 44px. Fonts remain local, labels readable, focus visible, reduced motion supported, and long forms/dropdowns viewport-bound. Tables remain efficient data tables rather than an incomplete replacement.

Apply the same reviewed tokens and shared primitives to Employees, Movements, PRFs, RBAC and Administration in their own phases. Test active/inactive/scheduled permissions, stale data, concurrent edits, slow requests, cancellation and mixed-role navigation at the responsible phase.

**Review gate:** approve or revise the two representative dashboard screenshots before UI-01. Stop here; do not deploy this harness or start production token/shell/module changes as part of UI-00.
