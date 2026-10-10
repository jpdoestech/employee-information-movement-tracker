# Employee Information & Movement Tracking System
## Codex Implementation Specification — Standalone MVP (v1.1)

**Project type:** New, independent web application. Reference the latest live `main` branch of `https://github.com/jpdoestech/hr-management` **read-only** for relevant UI/data-table ideas only. Do not modify that repository, share its database, or migrate its unrelated HRIS modules.

## 1. Objective and scope

Build a professional, responsive, simple employee information and movement tracking application for **one company** with **Head Office → multiple Branches → each branch's Clients**.

The application must:
1. Maintain one permanent employee profile and unique employee identifier per person.
2. Let authorized administrators create **employee field groups and fields** through the UI; new fields automatically appear in employee entry/edit forms and can optionally appear as list columns.
3. Track **one effective primary organizational assignment**, plus **zero or more additional/temporary assignments**, without duplicating the employee record.
4. Preserve a reliable history of assignments, position changes, and employment status changes.
5. Provide search, filters, pagination, freeze/pin columns, configurable table layouts with live previews, and basic dashboard counts.
6. Restrict data and configuration changes using role-based permissions, with an audit trail for sensitive changes.

**Explicitly out of scope:** payroll, DTR/attendance, leave, recruitment/PRF, performance, disciplinary cases, HR documents, multi-company tenancy, complex workflow approvals, messaging, and employee self-service. Do not invent additional modules.

## 2. Suggested stack and delivery approach

- Frontend: simple maintainable modular HTML/CSS/TypeScript or JavaScript (a lightweight framework is acceptable only if it meaningfully reduces complexity). Responsive for phone/tablet/desktop.
- Backend: Supabase Postgres + Auth + Row Level Security (RLS), plus security-definer functions or server endpoints for atomic movement transactions. Do not expose privileged service-role credentials in the browser.
- Dates and effective-dated events use a defined company timezone (**Asia/Manila**) and consistent date-only semantics unless a timestamp is specifically needed.
- Generate a fresh, well-organized repository with setup instructions, `.env.example` with placeholders, SQL migrations, tests, and seed/demo data. Never hardcode real keys, passwords, or employee PII.
- Codex should inspect the *new project's files* first if implementation begins in an existing new-project workspace, state a concise plan, and implement in small verifiable steps. No changes to unrelated repositories.

## 3. Company structure and employees

Structure: **one Head Office**; many **Branches**; each Branch owns many **Clients**. A client record in this MVP belongs to exactly one branch; a separate client organization spanning multiple branches is out of scope.

Employees can be primarily assigned to Head Office, a Branch, or a Branch Client. Additional assignments may target any of these levels (including other branches), independently of their primary assignment. Each assignment's branch/client relationship must be valid. Do **not** create duplicate employee profiles for multi-branch responsibility.

Maintain permanent system-managed employee ID, employee name, basic employment status, and system timestamps as stable core fields. Other information can be configured through the field builder. Avoid turning critical foreign keys or workflow status into free-form custom fields.

## 4. Primary and additional assignments

- Exactly **zero or one effective active primary assignment** per employee (zero permitted before first placement, during an unassigned period, or after separation); never more than one on any calendar date.
- Any number of additional assignments, including time-limited temporary assignments. Store purpose/notes and optional expiry.
- Assignments have effective start and optional end dates, with clear inclusive/exclusive interval semantics used consistently; use **start-inclusive, end-exclusive** ranges internally.
- Future-dated entries are scheduled; employee's **current** assignment is the effective record on the date being viewed, not simply the newest row.
- Preserve history. Do not overwrite a previous assignment to hide a transfer; close its effective range and create a replacement through an atomic transaction.
- A transfer of the **primary** assignment must resolve previous effective primary date ranges; if scheduling a future transfer, retain the existing primary until the transfer's effective date. Reject or explicitly resolve overlaps with another scheduled primary event.
- Deactivation/separation closes incompatible effective assignments on the effective date. Do not silently erase future scheduled movements; flag conflicting schedules for cancellation or rescheduling.
- For each movement, record actor, creation timestamp, effective date, reason, and previous/new state. Correct erroneous transactions through a documented **void/correction event** rather than destructive deletion.

## 5. Exactly seven supported transaction types

| Type | Behavior |
|---|---|
| **Transfer** | Move primary assignment to a different branch (optionally one of its clients); close/replace primary effective interval. |
| **Deployment** | Assign employee to a branch client, typically as a new primary assignment; allow explicit additional-assignment mode where applicable. |
| **Reassignment** | Move from one client/organizational placement to another at the same or another branch, with history preserved. |
| **Return / Pull-out** | End client placement and return employee to a selected branch or Head Office, or mark unassigned, according to specified destination. |
| **Temporary Assignment** | Create an additional, explicitly time-bounded assignment without changing the primary placement unless user separately initiates a primary movement. |
| **Promotion / Position Change** | Record old/new position title and effective date; retain history. Position may change without changing assignment. |
| **Employment Status Change** | Record previous/new employment status and effective date (e.g., Active, Inactive, Resigned, Terminated). Not treated as a geographic transfer. |

**Important:** status and position changes are historical transactions in the same visible timeline, but they are not organizational assignment moves. Prefer explicit typed payload validation over opaque editable free text. Do not add an approval subsystem.

## 6. Dynamic employee field builder

Superadmin and authorized Admin can manage:
- **Field groups:** name, description, display order, active/inactive.
- **Field definitions:** internal immutable key, label, group, type, required flag, optional help text, validation, default value, display order, list-column eligibility, and active/inactive status.
- **Field types (MVP):** short text, long text, integer/decimal number, date, checkbox, single-select dropdown, email, and phone/text. Store dropdown choices in definition metadata.

Rules:
- Adding a group or field through UI **does not run `ALTER TABLE`** or require deployment; form rendering is metadata-driven.
- Use structured/validated JSONB custom values per employee for MVP, with canonical field keys and backend validation. Include examples and a documented upgrade path if complex custom-field reporting later requires separate typed value storage.
- **Custom fields must not replace** employee ID, core identity, status, or assignment relationships.
- Validate field value types, required values, constraints, and dropdown choices at the trusted backend boundary, not only the browser.
- Renaming a field changes the label only, never its immutable key or stored value. Inactivate rather than hard-delete any populated group/field; retain historical data. Type changes after data exists must be blocked unless explicitly migrated/validated.
- Custom fields can be selected for the employee table, but do not promise efficient universal sorting/filtering for every arbitrary custom field in v1; provide filters for core fields and basic custom-field filtering only if safely implemented.
- Sensitive employee information must be protected by roles and RLS; visibility toggles are not security boundaries.

## 7. Lean data model (conceptual)

Implement SQL migrations for these entities, adapting names only for consistency:

1. `employees`: UUID PK, unique human-readable employee number, permanent core identity, `custom_values JSONB`, timestamps.
2. `branches`: unique code/name, active flag.
3. `clients`: branch FK, unique code within branch, name, active flag.
4. `employee_assignments`: employee FK, target level (`head_office` / `branch` / `client`), validated branch/client FKs, category (`primary` / `additional` / `temporary`), effective date range, status/notes, source movement ID.
5. `employee_movements`: employee FK, one of seven types, effective date, reason, structured old/new payload, actor ID, created timestamp, correction/void relationship and status.
6. `field_groups`: group metadata and ordering.
7. `field_definitions`: metadata, constraints, dropdown options, ordering and lifecycle state.
8. `user_profiles` (support table): Supabase Auth user ID, role, active flag and optional branch scope (if authorized scoped Admin access is implemented).

Use an **audit log** (additional support table) for updates to employee information, custom field schema, role assignments, and movement corrections. Record actor, time, entity, operation, and changed-field summary; avoid copying secrets or unnecessary sensitive contents into logs.

Position and employment status histories may be represented as typed movement records plus effective-date queries; avoid additional tables unless integrity/query requirements make them necessary. Provide robust constraints, indexes, foreign keys, and transactional functions. In particular, enforce non-overlapping primary effective assignments for each employee **at the database level**, not just in the UI.

## 8. Access control and security

- **Superadmin:** full configuration, user/role administration, employee information, and movement corrections.
- **Admin:** manage employee profiles, fields, organization and movement transactions, except Superadmin-only security/user-role settings. (Optional branch-limited access may be added later; do not half-implement a misleading scope.)
- **Viewer:** read employee information and movement history only; no mutations.

Require authentication; use RLS on all application tables, including metadata and audit tables. Movement writes must pass server-side role checks, date-range integrity and audit logging. Ensure an authenticated user cannot promote their own role or modify sensitive audit records. Seed first Superadmin through documented trusted administrative setup, not client-side registration defaults.

## 9. Screens and user experiences

**Dashboard:** counts of employees by status, primary placement (Head Office/branch/client), currently unassigned employees, and recent movements. Label which numbers are *current as of today*.

**Employees:** searchable/paginated employee table with branch, client, status filters; show configurable list columns. Create/edit/view employee profiles grouped by configured field groups. Employee detail shows current primary assignment, additional/temporary assignments, and chronological movement/status/position history.

**Movements:** new-transaction form with movement-specific fields, effective dates, reason, conflict previews, confirmation, and browsable transaction history. Show scheduled vs currently effective vs past items. Separate correction/void action for authorized users.

**Organization:** manage Head Office reference, branches, and branch-specific clients. Inactivation should not invalidate historical assignments; restrict new placements to active destinations.

**Field Builder:** group/field list, create/edit/reorder/inactivate, type-specific validation controls and form preview.

**Settings:** authentication account/role management (Superadmin), minimal system settings, and audit history where permitted.

**UI guidelines:** professional understated appearance, sidebar or compact mobile nav, responsive forms/tables, sensible loading/empty/error states, accessible labels, confirmation for impactful transactions, no crowded screens or decorative dashboards at expense of usability.

## 9A. Priority employee table UX — frozen columns and custom column preview

The user explicitly prioritizes the **freeze-column** and **custom-column-preview** experiences, inspired by `https://github.com/jpdoestech/hr-management` (inspect its latest live `main` branch **read-only**; do not claim to reproduce exact behavior without verifying the source). Build these as core MVP features, not stretch goals.

### Freeze / pin columns
- In employee master list, allow users to pin at least the leftmost Employee ID and Employee Name; optionally pin further selected columns up to a sensible limit.
- Frozen columns remain visible during **horizontal scrolling** of wide tables; use sticky positioning or a reliable equivalent without breaking sorting, column resize, keyboard navigation, pagination, or responsive layouts.
- Keep sticky table headers visible during vertical scrolling where practical. Define predictable sticky offsets and z-index for intersections; prevent overlapping headers/cells, clipping, and misalignment.
- Provide an explicit pin/unpin control in table customization, a visible frozen boundary, and a reset-to-default action.
- On small screens, use a horizontally scrollable table with a compact sticky identifier column or an accessible alternative card view. Do not make the entire page horizontally scroll.
- Persist the user's pin settings as part of the user's saved view, not globally by default.

### Custom column preview / table view designer
- Offer a **Customize Columns** interface where users select eligible employee core fields and active dynamic fields; display a **live sample table preview before Apply/Save**.
- Support show/hide, reorder, pin/unpin, search available columns, and reset to default. Optional width controls only if simple to maintain.
- Preview reflects chosen order, visible fields, pinned columns, and sample data. Preview changes are **draft-only** and must not modify stored user preferences until Apply/Save; Cancel restores the previous configuration.
- Allow named personal saved views (e.g., All Employees, Branch Staffing, Client Deployments). A default system view is always available. Personal layouts never alter employee data or other users' views.
- Combine custom columns with branch/client/status filters, sorting, search, pagination (10/25/50/100), and CSV export of **authorized** visible columns only. Do not export hidden sensitive information, even if its identifier appears in a saved view.
- Handle a field being renamed or deactivated gracefully; avoid broken views, and tell users when a saved column is unavailable.
- Field Builder definitions remain separate from *Column Customizer* preferences. Creating a new field does not automatically expose it to users without the necessary permission.

### Practical table UX acceptance tests
1. Pin Employee ID and Name, then horizontally scroll through at least 15 visible fields: both remain aligned and visible.
2. Customize columns: toggle, reorder, pin, see immediate preview; Cancel changes nothing; Apply persists on reload for the same user.
3. Switch named views and preserve independent layouts, filters, and sort settings; another user's view remains unaffected.
4. Search, sort, paginate, and filter work on large tables while frozen columns remain stable.
5. Restricted custom fields never leak through grid previews, exported CSV, filters, or direct API calls.
6. Test on mobile widths, keyboard-only operation, and with horizontal overflow.

## 9B. Front-end design skill — UI UX Pro Max

- Use `https://github.com/nextlevelbuilder/ui-ux-pro-max-skill` as the **preferred UI/UX design guidance** for Codex, following its current README and project-local installation instructions. For Codex CLI, its documented setup is `npx ui-ux-pro-max-cli init --ai codex` (or the documented `uipro init --ai codex` after installing the CLI). Ask for explicit permission before installing dependencies if the environment requires it; do not silently modify global tooling.
- Codex should first define a small and coherent design system: typography, spacing, accessible contrast, responsive layout, buttons/forms, modal/drawer behavior, tables and interaction states. Favor polished enterprise data-entry UI over decorative dashboard complexity.
- Keep performance, accessible focus states, reduced-motion support, empty/loading/error states, touch targets, and screen-reader labels in scope.
- The skill is **design guidance**, not a requirement to change stacks, add heavy components, or compromise security. If unavailable, implement equivalent high-quality accessible UI without blocking the application.
- Check the skill's repository license and usage instructions for any assets that are copied into the project. Do not copy private code or employee data from the reference HR repository.

## 10. Operational edge cases

Implement and test at minimum:
- Future transfer that must not alter today's placement.
- Multiple additional assignments coexisting with one primary.
- Reject two overlapping primary assignments, including scheduled overlaps.
- Early return/pull-out from a temporary or primary client placement.
- Scheduled primary transfer followed by cancellation or correction.
- Employee marked resigned/terminated on a future date and effect on scheduled placements.
- Transfer between different branches while client belongs to destination branch.
- Inactive branch/client retains historical references but cannot receive new placements.
- Rename/inactivate populated custom field without loss of stored values.
- Viewer attempting write through the API; authenticated user attempting unauthorized role change.
- Concurrent edits to the same employee's assignment (database constraint/atomic processing protects integrity).

## 11. Deliverables and build sequence for Codex

1. **Foundation:** project scaffolding, Auth, roles/RLS, baseline migrations, README, `.env.example`.
2. **Organization and employees:** branches/clients, core employee CRUD, basic responsive employee list/details.
3. **Dynamic field builder:** metadata, custom-values validation, auto-generated forms, safe field lifecycle.
4. **Assignment and movement engine:** effective-date rules, seven transaction types, atomic writes, histories/corrections.
5. **Dashboard and usability:** counts, search/filters/pagination, configurable list views, mobile optimization.
6. **Tests and documentation:** database integrity/security tests, sample fixtures, clear local setup and manual acceptance checklist.

At each step, run available checks and report what passed, what is blocked and why. Prefer clear small modules to overengineered abstractions.

## 12. Acceptance criteria (definition of done)

- [ ] Single company has Head Office, branches and branch-owned clients.
- [ ] Every employee has one stable identity; no duplicate records needed for multiple assignments.
- [ ] Authorized Admin can create a custom field group and field; it appears in create/edit and persists valid input **without code or database schema changes**.
- [ ] Field rename/inactivation preserves historical values.
- [ ] Employee has no more than one primary assignment effective on any date, while concurrent additional/temporary assignments are supported.
- [ ] Future movements become effective on the specified date, not at entry time.
- [ ] All seven agreed movement/status transaction types work and show chronological history.
- [ ] Position/status changes do not silently masquerade as branch/client transfers.
- [ ] Inactive destinations cannot receive new movements, without losing old history.
- [ ] Core search, branch/client/status filters, pagination and responsive screens work.
- [ ] Role enforcement is validated against direct database/API requests, not only UI controls.
- [ ] Historical edits and corrections are attributable to authorized actors.
- [ ] SQL migrations, tests, configuration examples and run instructions are provided.

## 13. Instructions to Codex

**Implement this specification as a fresh standalone project.** Do not add unrelated HRIS modules, multi-tenancy, approvals, or complex integrations. Reuse standard well-supported components where appropriate. Before coding, summarize your implementation plan and any truly blocking ambiguity; otherwise adopt the simplest secure interpretation documented here. Keep the scope narrow and code understandable. Do not claim completion unless features and database/security checks have been tested; clearly identify anything not validated.


## 14. Reference boundaries and implementation priorities (v1.1 amendment)

- Reference repository: `https://github.com/jpdoestech/hr-management` — latest live `main`, **read-only**. Extract only proven, relevant interaction patterns, especially column freeze/pin and custom-column preview; if exact implementations cannot be located, implement the specified behavior independently and state that limitation.
- UI skill: `https://github.com/nextlevelbuilder/ui-ux-pro-max-skill` — use its currently documented Codex setup and guidance.
- Priority order: (1) employee/organizational model and effective-dated movement correctness, (2) custom field builder, (3) employee grid with freeze and live column preview, (4) role/security controls, (5) final polish. Security and data integrity are required throughout, not deferred.
- No scope expansion into payroll, leave, recruitment, disciplinary cases, DTR, or a full ERP.
