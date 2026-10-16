# AMS reference provenance

Captured 2026-10-16 (Asia/Manila) from local AMS commit `325e83e28a3aac29b14ea4567c455824c406d320`.

Source repository: https://github.com/jpdoestech/ams

Local source: `C:/Users/USER/Documents/GitHub/ams`

These are read-only design references, not tracker runtime code. The .txt extension prevents accidental use as application modules. Full CSS contains attendance-specific selectors; port only relevant shared visual patterns. Never copy AMS business logic or replace the tracker components wholesale.

| Snapshot | Original | Purpose |
| --- | --- | --- |
| [styles.css](source/styles.css.txt) | assets/styles.css | Semantic colors, compact tables, buttons, modal sizing, responsive rules |
| [theme.js](source/theme.js.txt) | assets/theme.js | System/light/dark preferences, first paint, OS and cross-tab changes |
| [layout.js](source/layout.js.txt) | assets/layout.js | Persisted collapsed desktop sidebar state |
| [ui.js](source/ui.js.txt) | assets/ui.js | SVG icons, button labels and visual enhancement examples |
| [confirm-dialog.js](source/confirm-dialog.js.txt) | assets/confirm-dialog.js | Accessible operation-specific confirmation appearance |
| [Modal layout excerpt](source/modal-layout.js.txt) | assets/ui-workflows.js, layoutModal | Stationary header/footer and scrollable body only |

Refresh these snapshots only after deliberately reviewing a newer AMS version. The tracker must continue to work if the original AMS folder is moved or unavailable.
