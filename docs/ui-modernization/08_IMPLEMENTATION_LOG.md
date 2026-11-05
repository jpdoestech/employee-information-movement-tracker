# Unified interface implementation

The user approved the desktop/mobile representative designs on 2026-11-05 and then requested completion of all remaining phases. Each phase retains a separate branch/PR and acceptance evidence. No new HR modules or backend architecture changes are part of this work.

## UI-02 — application shell

The desktop sidebar starts labelled unless an existing collapsed preference was saved. Both mobile primary navigation and the drawer consume App's existing permission-filtered navigation catalog. All links retain hash routing and the shared employee leave guard. More uses the shell-owned drawer callback; there is no prototype DOM bridge. Opening the drawer makes the entire workspace, including bottom navigation, inert; Escape restores its opener. Native modal dialogs retain their top-layer behavior. The fixed navy bottom bar includes safe-area padding and reserves content space so it cannot cover employee actions.

Acceptance: labelled/saved desktop behavior; selected mobile destination; 44px targets; draft cancellation/discard; drawer inertness and focus restoration; short-landscape and phone bounds. Existing appearance and workspace tests remain release gates.
