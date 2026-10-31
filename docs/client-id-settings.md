# Client ID allocation

The displayed **ID** uses the existing `client_employee_number` field key, so existing field permissions, views, filters and exports retain their references. System ID remains a separate permanent system identifier.

Superadmins choose **Manual** or **Automatic** in Employees → Client entry settings for each client. Automatic is the default. Changes use the existing confirmation, optimistic version check and audited settings transaction. Authorized administrators may still configure client filters without changing the ID mode.

Automatic allocation uses the client's code and a five-digit sequence, for example `COM-00023`. Manual mode requires an ID for a new employee/client binding during employee creation or an assignment movement. Enter 1–64 ASCII letters/digits, hyphens, underscores, dots or slashes, starting with a letter or digit. Input is trimmed and uppercased; leading zeroes are retained. Manual issuance additionally requires Create permission for the ID field in that client.

IDs are unique **within each client**. Different clients may use the same ID. A database unique constraint and a client row lock protect concurrent issuance. Manual issuance does not consume the automatic counter; automatic allocation skips identifiers already reserved manually. Allocation is part of the employee/movement transaction, and preview rolls it back.

Changing modes retains existing IDs. Returning to a client reuses the employee's existing ID; supplied conflicting values are rejected. Generic profile and bulk edits cannot overwrite IDs. The migration preserves previously generated identifiers and the existing restricted-table access boundary.

Apply versioned migration `20261014000100_client_id_modes.sql` before deploying the updated application.
