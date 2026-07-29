import { semesterToQuarter } from '../../src/planner/units';
import type { Plan, RowStatus } from '../../src/planner/plan';
import type { Course } from '../../src/parser/types';

function courseLabel(c: Course): string {
  return `${c.code} ${c.title}`;
}

// Every branch below is keyed off `status.state`, never off which fields
// happen to be populated. An `alternative` row still carries the
// `cheapestOption` it had while it was `remaining`, from before it lost its
// or-group to a cheaper sibling. Reading that field instead of the state
// would tell a student to take a course they no longer need.
function StatusRow({ status }: { status: RowStatus }) {
  const label = status.receiving.map(courseLabel).join(' and ');

  if (status.state === 'satisfied') {
    return (
      <li className="status-row status-satisfied">
        <strong>{label}</strong>. Satisfied by {status.satisfiedBy.map(courseLabel).join(', ')}.
      </li>
    );
  }

  if (status.state === 'remaining') {
    return (
      <li className="status-row status-remaining">
        <strong>{label}</strong>. Suggested: {status.cheapestOption.map(courseLabel).join(', ')} (
        {status.remainingUnits} semester units).
      </li>
    );
  }

  if (status.state === 'not_articulated') {
    return (
      <li className="status-row status-not-articulated">
        <strong>{label}</strong>. Nothing at your college is articulated for this. You take it
        after you transfer.
      </li>
    );
  }

  if (status.state === 'alternative') {
    return (
      <li className="status-row status-alternative">
        <strong>{label}</strong>. Not needed: this is a route you did not take. An alternative for
        the same requirement is already covered, so nothing here adds units.
      </li>
    );
  }

  return (
    <li className="status-row status-unreadable" role="alert">
      <strong>{label}</strong>. Could not be read from the agreement. Verify this requirement on{' '}
      <a href="https://assist.org" target="_blank" rel="noreferrer">
        assist.org
      </a>{' '}
      before relying on it.
    </li>
  );
}

export function PlanView({ plan }: { plan: Plan }) {
  const hasUnreadable = plan.statuses.some((s) => s.state === 'unreadable');

  return (
    <section className="plan">
      {/* remainingUnits is in the sending school's semester units, while the
          receiving school is on quarters. UC asks for 60 semester units or
          90 quarter units, so a bare number here would be ambiguous by
          construction. Always say which system each figure is in. */}
      <h2>{plan.remainingUnits} semester units remaining</h2>
      <p className="unit-note">
        About {semesterToQuarter(plan.remainingUnits)} quarter units at the receiving campus.
        Semester units and quarter units are not interchangeable, so both are shown.
      </p>

      {hasUnreadable && (
        <p role="alert" className="warning">
          Some requirements could not be read from this agreement. Do not rely on this plan for
          those rows. Check them directly on{' '}
          <a href="https://assist.org" target="_blank" rel="noreferrer">
            assist.org
          </a>
          .
        </p>
      )}

      <h3>Suggested order</h3>
      <p>
        Grouped by unit load only. Agreements do not list prerequisites, so this is not a
        prerequisite-aware sequence. Confirm the order with a counselor.
      </p>
      <p>
        Where a requirement has several accepted options, the one shown is simply the one with the
        fewest units. Fewest units is not the same as best for your major, so open the full
        requirement list below before deciding.
      </p>
      {plan.terms.length > 0 ? (
        <ol>
          {plan.terms.map((term, i) => (
            <li key={i}>{term.map(courseLabel).join(', ')}</li>
          ))}
        </ol>
      ) : (
        <p>Nothing left to schedule from what this agreement could read.</p>
      )}

      {plan.notArticulated.length > 0 && (
        <>
          <h3>No course articulated</h3>
          <p>Nothing at your college satisfies these. You take them after you transfer.</p>
          <ul>
            {plan.notArticulated.map((c) => (
              <li key={c.code}>{courseLabel(c)}</li>
            ))}
          </ul>
        </>
      )}

      <h3>All requirements</h3>
      <p>
        Every requirement on the agreement, including the alternative routes you did not take so
        they do not just vanish from view.
      </p>
      <ul className="status-list">
        {plan.statuses.map((s, i) => (
          <StatusRow key={i} status={s} />
        ))}
      </ul>
    </section>
  );
}
