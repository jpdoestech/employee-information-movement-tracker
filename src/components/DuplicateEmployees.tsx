import type { DuplicateReview } from "../duplicateEmployees";
export function DuplicateEmployees({ review }: { review: DuplicateReview }) {
  return (
    <div className="duplicate-review">
      <p>
        These employees have the same birthday and at least {review.threshold}%
        name similarity. Review their assignments before continuing.
      </p>
      <ul>
        {review.items.map((employee) => (
          <li key={employee.id}>
            {employee.candidate_name && (
              <small>Reviewing changes to {employee.candidate_name}</small>
            )}
            <strong>{String(employee.values.name)}</strong>
            <small>{employee.similarity.toFixed(1)}% name match</small>
            <dl>
              {[
                ["branch", "Branch"],
                ["client", "Client"],
                ["department", "Department"],
                ["position", "Position"],
              ].map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>
                    {Object.hasOwn(employee.values, key)
                      ? String(employee.values[key] || "—")
                      : "Restricted or unavailable"}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      {review.total > review.items.length && (
        <p>
          Showing {review.items.length} of {review.total} possible matches.
          Narrow the details or review the remaining records before proceeding.
        </p>
      )}
      <p>Continue only if this is a different employee.</p>
    </div>
  );
}
