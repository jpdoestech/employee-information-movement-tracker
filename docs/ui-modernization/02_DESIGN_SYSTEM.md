# UI-00 — proposed design system and reference fidelity

Proposal only. The reusable production token/component system is established in UI-01 after review; the current experiment is isolated in `.test-db/ui-modernization/proposal.css`. Existing runtime styles remain unchanged.

## Reference comparison

| Reference characteristic | Desktop proposal | Mobile proposal / intentional difference |
|---|---|---|
| White labelled navigation; subtle dividers | Original Employee Tracker brand and icon, expanded existing sidebar, blue selected row | Existing accessible drawer remains available through More; primary routes use a persistent bottom bar |
| Light gray background; white cards | Neutral `#f5f6f8`, thin borders, 8px card radius, almost-flat shadow | Same surfaces and spacing, stacked cards; no clipped card carousel |
| Compact header and controls | Existing Workspace > Overview breadcrumbs, appearance, refresh, account/sign out | Compact current-page title; 44px controls and labelled navigation |
| Three-card desktop rhythm | Three KPI columns, followed by wider main/narrower secondary chart panels | One KPI card per row; all metrics remain reachable without sideways swiping |
| Blue accents and professional icons | Existing Lucide icons, blue navigation/bar accents | Navy bottom bar, light-blue selected item with text and icon |
| Dashboard charts and employee list | Existing workforce, employment, demographic, status and placement distributions | Same existing data and units; no fabricated payroll or trend series |
| Employee cards in reference | Existing register remains its own secured destination | No extra employee-data query/cache or duplicate dashboard register is introduced |
| Search, bell, mail and export in reference | Retain real EIMT actions only | No non-functional global search, notifications inbox or share controls are invented |
| Reference logos, photos, brand and device frame | Original EIMT identity retained | No reference identity, employee names, figures, phone hardware frame or OS status bar copied |

Six existing metrics occupy two desktop rows rather than dropping metrics to reproduce the reference's three-example-card layout. Bar distributions remain accurate existing EIMT summaries; a financial spline/donut would imply data the app does not have. Explanatory scope/coverage text and unavailable-data dashes remain visible. The actual date range stays accessible through the existing date control; the redundant date caption is omitted on phones.

Mobile uses four labelled primary controls (Overview, Employees, Movements, More), rather than copying five unrelated reference destinations. PRFs remain the existing dashboard action. The user-requested bottom navigation supersedes the earlier drawer-only direction for this proposal, without changing desktop destination placement.

## Token proposal

| Role | Proposed light value / size | Existing rule retained |
|---|---|---|
| Canvas / surface / navigation | `#f5f6f8` / white / white | Semantic tokens; dark values continue from appearance theme |
| Action / hover / tint | `#2458d3` / `#1946b5` / `#eaf2ff` | Independent focus and semantic error/success colors |
| Divider / input boundary | `#e1e5eb` / `#b8c0cc` | Stable borders and filled focus; visible keyboard focus |
| Mobile navigation | `#101f36`; selected `#213954`, foreground `#9fc7ff` | Text plus shape/color; icon-only navigation is avoided |
| Radius | 6px controls, 8px cards | No pill cards or oversized radii |
| Spacing | 4 / 8 / 10 / 12 / 16 / 20px | Use by purpose, not new one-off values per screen |
| Controls | 32–36px desktop; at least 44px touch | Hit area independent of font size |
| Typography | 14px sections/body/forms, 13px navigation, 12px compact/data, 11px labels, 10px headers, 30px KPIs | Segoe UI Variable / Aptos local stack; 400/500/600/700 only |
| Tables | Existing 36px desktop / 50px touch rows | Measured authorized content and bounded long columns |

## Component ownership after approval

Refine existing buttons, inputs, cards, status indicators and layout primitives rather than adding a component library. Consolidate styles incrementally: tokens → one control family → shell → register → editor → administration. Preserve shared picker portals, notifications and transaction layers. Prefer existing `Dialog`, `SearchFilterPicker`, `PickerSurface`, `RecordExplorer` and `EmployeeWorkspace` ownership.

For production mobile navigation, move the current authorized navigation catalog into one shell-owned source consumed by drawer and bottom navigation. Do not ship the review harness's demo-context navigation or DOM button bridge; these are isolated scaffolding for visual/interaction review. The production shell must own callbacks, current route, dirty guards, focus restoration and background inertness.

## Review method

References were visually inspected; actual baseline/proposal dashboards were rendered and compared for navigation, surface color, spacing, typography, card proportions, density and phone stacking. Screenshots use actual browser viewport dimensions rather than stretching the reference image. No pixel-match percentage is claimed because content, aspect ratios and workflow requirements differ.

Review both the initial mobile screenshot and `proposed-dashboard-mobile-details.png`: the bottom bar and toolbar remain fixed while the lower breakdowns remain reachable. See the responsive plan for automated proof and remaining real-device/accessibility work.
