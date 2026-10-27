# Column preview and reliable view saves

Customize Columns and managed column views show the shared employee table beside
the order editor on desktop and below it on phones. Each pane owns its scrolling;
the modal header, tabs and footer stay stationary. Examples are synthetic, derived
only from readable, active, list-eligible metadata. No employee records are read,
selected or opened from the preview. Age and service use internally consistent
sample dates and the Asia/Manila business date.

The list, preview and saved register share a pinned-first order. Move or drag
columns within their pinned/unpinned section; unpin a column to move it after
ordinary columns. Multi-selection and Escape cancellation remain available.
Busy saves lock editing until settlement. Cancelling confirmation keeps the
draft; closing an edited dialog still requires Discard changes/Continue editing.

Managed drafts keep the register-settings revision captured on open. A background
refresh does not rebase a stale draft onto somebody else's save. Conflicts keep
the draft open with the existing reload-before-saving error.

Apply `20261027030000_atomic_personal_views.sql` before this frontend. The new
`save_personal_view` RPC saves the named and active view in one transaction via
the existing save path, validates authorized columns, and records an actor-bound,
payload-bound receipt. Failure in either write rolls back both. Legacy save_view
remains supported for older frontends. The migration does not rewrite any view,
employee, policy or grant. Keep the additive endpoint on frontend rollback.

Focused checks cover activation-failure rollback, receipts and invalid layouts;
stale managed drafts after background refresh; preview authorization, pin order,
read-only examples, drag cancellation and responsive pane bounds. Verification
sources and generated proof remain under `.test-db`.
