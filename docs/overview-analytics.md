# Overview management analytics

This extends the v1.8 dashboard with management analytics and the user's approved
client staffing / Personnel Request Form (PRF) requirements. It records approved
staffing targets; applicant tracking and a PRF approval workflow are not included.

## Metric definitions

- All metrics intersect live employee module access, organization scopes, record
  restrictions, field Read permissions, active groups and field applicability.
  Counts never come from the loaded employee page or a browser employee cache.
- Current headcount is the count of accessible employees with readable effective
  **Active** status today. Inactive and Separated are excluded. The total accessible
  record count and status coverage are shown separately.
- 30D, 90D, 180D and 1YR represent trailing 30, 90, 180 and 365 inclusive calendar
  days ending today. Custom dates include both endpoints and cannot end in the
  future. Headcount, fill rate and workforce breakdowns remain explicitly labelled
  **today**; new hires, separations and rates use the selected reporting period.
- Period metrics describe the **currently accessible employee cohort**, not a
  reconstruction of the entire company's former workforce. Former employees who
  are outside the viewer's current scope or archived are excluded. This follows
  the existing secured employee and movement history boundary. The eligible
  cohort count is displayed; users with different access can see different rates.
- Period eligibility requires readable status and Date Hired, readable endpoint
  placements/fields and movement module access. A new hire need not have an
  authorized placement before their hire date. An employee with unauthorized
  status history in the selected period is excluded from the entire period
  calculation, rather than producing a misleading zero separation count.
- New hires counts employees whose recorded Date Hired is in the inclusive period.
  Rehires do not manufacture another hire date.
- Separations counts non-voided effective status events becoming Separated,
  including legacy Resigned/Terminated values. Inactive is not a separation.
  Future and voided events are excluded. An initial imported separated status
  without a recorded separation event is not counted as an event.
- Opening headcount is eligible employees hired before the period and Active on
  the preceding day. Closing headcount is eligible employees hired by the end date
  and Active on that date. Status event order matches `effective_value`:
  effective date, recorded timestamp, then immutable ID, descending.
- Retention is opening employees still Active at period end with no separation
  during the period, divided by opening headcount, multiplied by 100. A separated
  employee rehired during the period is not counted as continuously retained.
- Turnover is separation events divided by the mean of opening and closing
  headcount, multiplied by 100. It is not annualized. Repeated separations can
  produce turnover above 100%. Undefined rates and unavailable data display a dash.
- Workforce by Branch, Client, Employment Type and age/gender includes readable
  Active employees today. Stable organization IDs keep identically named clients
  separate. Both age and gender must be readable for the demographic matrix.
  Ages use completed birthdays today, with 18–25, 26–30, 31–40, 41–50, 51–60, 61+,
  and explicit Under 18 / Not recorded categories when needed. Missing values are
  distinct from fields excluded by authorization. Branch and client distributions
  return at most the largest 100 groups and disclose truncation.

## Approved client staffing / PRFs

Record the PRF reference, client, configured Employment Type, approved headcount,
start date, optional exclusive end date and active state. Multiple concurrent
active PRFs add to the client/type requirement. These records must represent the
total approved staffing demand, including existing staffing requirements where
applicable; they are not a count of unfilled hiring requests. Use the employee
field's configured choices, including On-call or Permanent if those have been
configured. No automatic mapping to Regular is performed.

Fill rate is `sum(min(active headcount, required headcount) per client/type) /
sum(required headcount) × 100`, using active PRFs effective today. Extra staffing
in one group cannot cover another group's vacancy. No target means a dash.

Staffing reads require organization View, employee scope Read, Client and
Employment Type Read, and an unrestricted organization record rule. Fill rate
also requires Status Read. Self/assigned/department/direct-report restrictions
hide client staffing targets and fill rate because those users cannot see the
whole staffing population. Users can read a PRF only within their client access.
Writes additionally require Organization Manage and client scope Update; native
Viewers cannot write. Base table access is denied by RLS and ACLs.

PRF records retain row versions and can be ended/deactivated instead of deleted.
Client is immutable on edit. The shared Continue/Cancel confirmation precedes
every write, and Cancel preserves the draft. Closing edited forms uses the shared
Discard changes / Continue editing prompt. RPC writes serialize with the existing
system-state lock, validate versions and configured choices, and commit audit,
revision and actor/payload-bound idempotency ledger together. PRFs are separate
from employee values and workbook synchronization; saving a PRF does not create
an employee or a Google synchronization event.

## Performance and deployment

Apply `20261026060000_staffing_requisitions.sql`, then
`20261026070000_overview_analytics.sql`, before deploying this frontend. The
existing `tracker_query('dashboard', q)` signature and its legacy total/status/
placement keys remain compatible with the previous frontend. New staffing data
and indexes are additive; existing employee values, permissions and history are
not rewritten. Roll back by redeploying the prior frontend, retaining both
migrations and PRF records. No destructive database rollback is needed.

The dashboard builds only the small analytics field projection. Policy grids are
evaluated by distinct placement within each statement. A partial status-history
index supports effective-date lookups. The database returns aggregate counts;
no employee identities or birth dates are sent to the Overview. Switching Branch
and Client is local to the returned aggregate response. Custom edits do not query
until Apply. Authorization/date/revision changes invalidate displayed results,
and obsolete responses are discarded. There is no shared authorization cache or
automatic write retry.

Local verification is under `.test-db`: exact metric fixtures, scoped reads,
field/module/record/historical denials, PRF versions and idempotency, invalid input,
desktop/phone/tablet/landscape browser flows and a previous-versus-new query
benchmark adding 1,000 synthetic profiles and 6,000 status events to the existing
fixtures, refreshing statistics with `ANALYZE` and alternating old/new samples. Generated timing
evidence is `.test-db/reports/verification/overview-performance.json`. These local
measurements do not establish hosted production latency or concurrency capacity.

Recorded verification: production build passed, 135 unit tests passed, 139 full
database checks passed, and 12 Overview / record-list browser scenarios passed.
The focused benchmark measured 2,435 ms for the previous projection versus 741 ms
for the new analytics; the larger regression fixture measured 8,102 ms versus
1,867 ms. Timings are local medians and vary with host load. No production
migrations or deployment were performed.
