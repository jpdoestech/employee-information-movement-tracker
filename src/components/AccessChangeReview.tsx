import type { AccessImpact } from "../accessReview";

export function AccessChangeReview({
  impact,
  summary,
}: {
  impact: AccessImpact;
  summary: string;
}) {
  const gained = impact.changes.filter((c) => c.after);
  const lost = impact.changes.filter((c) => !c.after);
  return (
    <div className="access-change-review">
      <p>{summary}</p>
      {impact.demo ? (
        <p>
          Synthetic demo: effective access is not evaluated. Real changes are
          reviewed by the database.
        </p>
      ) : (
        <>
          <p>
            Effective today ({impact.today}): {gained.length} permissions gained
            · {lost.length} lost · {gained.filter((c) => c.restricted).length}{" "}
            restricted-field permissions gained.
          </p>
          <p>
            {impact.targets.length} organization targets reviewed
            {impact.user_count === undefined
              ? ""
              : ` for ${impact.user_count} accounts`}
            . Only current access differences appear below; grant dates can
            change future access.
          </p>
          {impact.changes.length > 0 ? (
            <details open>
              <summary>Permission changes</summary>
              <ul>
                {impact.changes.map((c) => (
                  <li key={`${c.user_id}:${c.target_id}:${c.key}:${c.action}`}>
                    <strong>
                      {c.after ? "Gain" : "Lose"} {c.action}
                    </strong>{" "}
                    · {c.user_label ? `${c.user_label} · ` : ""}
                    {c.target} · {c.label}
                    {c.restricted ? " (restricted)" : ""}
                    <small>{c.reason}</small>
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <p>
              No effective permissions change today. Other grants, explicit
              denies, applicability, account status or future dates may prevent
              a change.
            </p>
          )}
        </>
      )}
      <p>
        Continue saves this change only. Existing roles, capabilities and other
        grants remain in place.
      </p>
    </div>
  );
}
