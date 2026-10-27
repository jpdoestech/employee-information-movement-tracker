import { FieldTypeIcon } from "./FieldTypeIcon";
import { useState } from "react";
import { Building2, CalendarDays, Users } from "lucide-react";
import { SearchFilterPicker } from "./SearchFilterPicker";
import { Popover } from "./Popover";
import { StaffingRequisitions } from "./StaffingRequisitions";
import type { Context, Option } from "../domain";

export type AnalyticsRange = { from: string; to: string };
type Count = { id?: string; label: string; context?: string; count: number };
export type AnalyticsReport = AnalyticsRange & {
  today: string;
  total: number;
  headcount: number;
  status_coverage: number;
  statuses: Record<string, number>;
  placements: Record<string, number>;
  fill_rate: number | null;
  staffing: { required: number; filled: number };
  period: {
    eligible: number;
    opening: number;
    closing: number;
    hires: number | null;
    separations: number | null;
    retention: number | null;
    turnover: number | null;
  };
  branches: Count[];
  clients: Count[];
  branch_groups: number;
  client_groups: number;
  employment_types: Count[];
  age_gender: { age: string; gender: string; count: number }[];
};

export function analyticsRange(today: string, days = 30): AnalyticsRange {
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { from: start.toISOString().slice(0, 10), to: today };
}

function Distribution({
  rows,
  total,
  groups = rows.length,
}: {
  rows: Count[];
  total: number;
  groups?: number;
}) {
  return rows.length ? (
    <>
      <div className="analytics-distribution">
        {rows.map((row) => (
          <div className="analytics-distribution-row" key={row.id ?? row.label}>
            <div className="analytics-category">
              <span>{row.label}</span>
              {row.context && <small>{row.context}</small>}
            </div>
            <div className="bar" aria-hidden="true">
              <span
                style={{
                  width: `${Math.min(100, (row.count / Math.max(total, 1)) * 100)}%`,
                }}
              />
            </div>
            <strong>{row.count.toLocaleString()}</strong>
            <small>
              {((row.count / Math.max(total, 1)) * 100).toFixed(1)}%
            </small>
          </div>
        ))}
      </div>
      {groups > rows.length && (
        <p className="analytics-note">
          Showing the largest {rows.length} of {groups} groups.
        </p>
      )}
    </>
  ) : (
    <p className="analytics-empty">No authorized workforce data available.</p>
  );
}

export function ManagementAnalytics({
  context,
  report,
  range,
  onRangeChange,
  loading,
  options,
  onSaved,
}: {
  context: Context;
  report?: AnalyticsReport;
  range: AnalyticsRange;
  onRangeChange: (range: AnalyticsRange) => void;
  loading: boolean;
  options: Option[];
  onSaved: () => void;
}) {
  const [preset, setPreset] = useState(() =>
      !range.to
        ? "30"
        : [30, 90, 180, 365]
            .find((days) => {
              const candidate = analyticsRange(context.today, days);
              return candidate.from === range.from && candidate.to === range.to;
            })
            ?.toString() || "custom",
    ),
    [draft, setDraft] = useState(range),
    [staffingOpen, setStaffingOpen] = useState(false),
    [group, setGroup] = useState("branch"),
    [rangeError, setRangeError] = useState("");
  const today = context.today;
  const activeRange = range.to ? range : analyticsRange(today);
  const headcount =
    report && (report.status_coverage > 0 || report.total === 0)
      ? report.headcount
      : undefined;
  const period = report?.period;
  const display = (value: number | null | undefined, percent = false) =>
    value == null
      ? "—"
      : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${percent ? "%" : ""}`;
  const genders = [
    ...new Set(report?.age_gender.map((r) => r.gender) || []),
  ].sort();
  const ages = [
    "18–25",
    "26–30",
    "31–40",
    "41–50",
    "51–60",
    "61+",
    ...["Under 18", "Not recorded"].filter((age) =>
      report?.age_gender.some((r) => r.age === age),
    ),
  ];
  return (
    <section
      className="management-analytics"
      aria-label="Management Analytics"
      aria-busy={loading}
    >
      <div className="analytics-toolbar">
        <h2>Management Analytics</h2>
        <SearchFilterPicker
          mode="single"
          label="Date range"
          icon={CalendarDays}
          clearable={false}
          value={[preset]}
          options={[
            ["30", "30D"],
            ["90", "90D"],
            ["180", "180D"],
            ["365", "1YR"],
            ["custom", "Custom date"],
          ].map(([id, label]) => ({ id, label, kind: "range" }))}
          onChange={([value]) => {
            setPreset(value);
            if (value !== "custom") {
              const next = analyticsRange(today, Number(value));
              setDraft(next);
              onRangeChange(next);
            } else {
              setDraft(activeRange);
              setRangeError("");
            }
          }}
        />
        {preset === "custom" && (
          <Popover label="Edit date range" icon={CalendarDays}>
            {(close) => (
              <form
                className="analytics-date-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (
                    !draft.from ||
                    !draft.to ||
                    draft.from > draft.to ||
                    draft.to > today ||
                    draft.from < "1900-01-01"
                  ) {
                    setRangeError(
                      "Choose a valid date range ending on or before today.",
                    );
                    return;
                  }
                  setRangeError("");
                  onRangeChange(draft);
                  close();
                }}
              >
                <label>
                  From
                  <span className="value-control has-type-icon">
                    <span className="value-type-icon">
                      <FieldTypeIcon type="date" size={14} />
                    </span>
                    <input
                      className="text-date"
                      aria-label="From date"
                      type="date"
                      required
                      min="1900-01-01"
                      max={draft.to || today}
                      value={draft.from}
                      onChange={(e) =>
                        setDraft({ ...draft, from: e.target.value })
                      }
                    />
                  </span>
                </label>
                <label>
                  To
                  <span className="value-control has-type-icon">
                    <span className="value-type-icon">
                      <FieldTypeIcon type="date" size={14} />
                    </span>
                    <input
                      className="text-date"
                      aria-label="To date"
                      type="date"
                      required
                      min={draft.from || "1900-01-01"}
                      max={today}
                      value={draft.to}
                      onChange={(e) =>
                        setDraft({ ...draft, to: e.target.value })
                      }
                    />
                  </span>
                </label>
                {rangeError && (
                  <p role="alert" className="error">
                    {rangeError}
                  </p>
                )}
                <div className="analytics-date-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(activeRange);
                      setRangeError("");
                      close();
                    }}
                  >
                    Cancel
                  </button>
                  <button className="primary" type="submit">
                    Apply
                  </button>
                </div>
              </form>
            )}
          </Popover>
        )}
        {context.module_permissions?.["organization.view"] && (
          <button onClick={() => setStaffingOpen(true)}>Staffing / PRFs</button>
        )}
        <span className="analytics-range">
          <time>{activeRange.from}</time>
          <span>–</span>
          <time>{activeRange.to}</time>
        </span>
      </div>
      <div className="analytics-scroll">
        <p className="analytics-note">
          Within your access scope · Current workforce as of{" "}
          <time>{today}</time>. Period metrics use the selected dates and
          currently accessible employee records.
        </p>
        <div className="analytics-stats">
          {[
            ["Current headcount", display(headcount), "Active employees today"],
            [
              "Fill rate",
              display(report?.fill_rate, true),
              report?.staffing?.required
                ? `${report.staffing.filled} filled / ${report.staffing.required} required today · ${Math.max(0, report.staffing.required - report.staffing.filled)} vacant`
                : "No authorized active staffing requirement",
            ],
            [
              "New hires",
              display(period?.hires),
              "Date Hired within selected period",
            ],
            [
              "Separations",
              display(period?.separations),
              "Recorded separation events in period",
            ],
            [
              "Retention rate",
              display(period?.retention, true),
              "Starting employees retained through period",
            ],
            [
              "Turnover rate",
              display(period?.turnover, true),
              "Separations ÷ average endpoint headcount",
            ],
          ].map(([label, value, detail]) => (
            <div className="stat" key={label}>
              <span className="stat-label">{label}</span>
              <strong>{value}</strong>
              <small>{detail}</small>
            </div>
          ))}
        </div>
        <p className="analytics-note">
          {report
            ? `${report.total.toLocaleString()} accessible employees · ${report.status_coverage.toLocaleString()} with readable status · ${period?.eligible.toLocaleString()} eligible for period metrics.`
            : loading
              ? "Loading authorized analytics…"
              : "No analytics loaded."}{" "}
          Period metrics require readable hire dates, status and movement
          history. A dash means unavailable data or a zero denominator.
        </p>
        <div className="analytics-grid">
          <section className="panel analytics-panel">
            <div className="section-heading">
              <h3>Workforce by</h3>
              <SearchFilterPicker
                mode="single"
                label="Workforce grouping"
                icon={Building2}
                clearable={false}
                value={[group]}
                options={[
                  { id: "branch", label: "Branch", kind: "group" },
                  { id: "client", label: "Client", kind: "group" },
                ]}
                onChange={([value]) => setGroup(value)}
              />
            </div>
            <Distribution
              rows={
                (group === "branch" ? report?.branches : report?.clients) || []
              }
              total={headcount || 0}
              groups={
                group === "branch"
                  ? report?.branch_groups
                  : report?.client_groups
              }
            />
          </section>
          <section className="panel analytics-panel">
            <div className="section-heading">
              <h3>Employment Type</h3>
              <Users size={16} aria-hidden="true" />
            </div>
            <Distribution
              rows={report?.employment_types || []}
              total={headcount || 0}
            />
          </section>
          <section className="panel analytics-panel analytics-demographics">
            <div className="section-heading">
              <h3>Age &amp; Gender Mix</h3>
              <span className="muted">Active employees today</span>
            </div>
            {genders.length ? (
              <div
                className="data-scroll-region analytics-mix"
                tabIndex={0}
                role="region"
                aria-label="Age and gender mix"
              >
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Age range</th>
                      {genders.map((gender) => (
                        <th key={gender} scope="col">
                          {gender}
                        </th>
                      ))}
                      <th scope="col">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ages.map((age) => {
                      const rows = report!.age_gender.filter(
                        (r) => r.age === age,
                      );
                      return (
                        <tr key={age}>
                          <th scope="row">{age}</th>
                          {genders.map((gender) => (
                            <td key={gender}>
                              {rows.find((r) => r.gender === gender)?.count ||
                                0}
                            </td>
                          ))}
                          <td>{rows.reduce((sum, r) => sum + r.count, 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="analytics-empty">
                No authorized age and gender data available.
              </p>
            )}
            <p className="analytics-note">
              Breakdowns include only readable fields. Percentages use readable
              active headcount; hidden fields can make totals differ.
            </p>
          </section>
          <section className="panel analytics-panel">
            <div className="section-heading">
              <h3>Employee status</h3>
              <a href="#employees">Employee register</a>
            </div>
            <Distribution
              rows={Object.entries(report?.statuses || {}).map(
                ([label, count]) => ({ label, count }),
              )}
              total={report?.status_coverage || 0}
            />
          </section>
          <section className="panel analytics-panel">
            <div className="section-heading">
              <h3>Primary placement</h3>
              {context.module_permissions?.["movements.view"] && (
                <a href="#movements">Movement history</a>
              )}
            </div>
            <Distribution
              rows={Object.entries(report?.placements || {}).map(
                ([label, count]) => ({ label, count }),
              )}
              total={report?.total || 0}
            />
          </section>
        </div>
      </div>
      {staffingOpen && (
        <StaffingRequisitions
          context={context}
          options={options}
          onClose={() => setStaffingOpen(false)}
          onSaved={onSaved}
        />
      )}
    </section>
  );
}
