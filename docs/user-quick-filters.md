# User quick filters

Superadmins configure **Permissions → Register settings → User quick filters**.
Choose an account, disable **Use client/default quick filters**, and select up to
five list fields. Save requires Continue/Cancel confirmation. Empty selection
hides custom quick filters; enabling defaults restores the existing client
configuration (or Status when no client is selected).

Assignments replace client toolbar shortcuts, not client entry defaults, saved
filters, or permissions. Branches and Clients remain available. New fields appear
in configuration when active and eligible for lists. Disabled or unreadable
fields are removed from the recipient's effective shortcuts on context refresh.
Field and record authorization remain enforced by the server for choices and
employee results. Selecting a shortcut does not grant access.

## Performance and release

The context response includes effective keys through the existing register
settings read, without another browser request. Choice queries run only when a
picker is opened and debounce searches for 180 ms. Each returns at most 100
matching choices from authorized records; searches run over the full authorized
scope rather than a truncated employee page. The query computes only the selected
field and evaluates its policies once per distinct placement. Client and branch
selections restrict the choice scope. No chart or picker dependency is added.

Five limits toolbar complexity and concurrent choice requests; it does not bound
the database's employee scan. No index is created per user or automatically per
new field. Effective values can include movement overrides and calculated values,
so a raw JSON index alone may not serve these queries. Production-size query
measurements should determine additional indexes or a future authorized value
index. Existing client configurations retain their previous eight-field limit.

Apply `20261029000000_user_quick_filters.sql` before the frontend. Existing users
retain their behavior because no assignments are seeded. Saves are versioned,
audited, atomic, and bound to actor/request/payload. A frontend rollback may leave
the additive migration installed; no data contraction is required. Do not remove
the table during rollback, since it contains saved assignments.
