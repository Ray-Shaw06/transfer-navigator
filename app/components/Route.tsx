import type { Schedule } from '../../src/planner/schedule';
import type { Course } from '../../src/parser/types';

// The plan drawn as a route: a rail, a station per term, a terminus. The
// content genuinely is a sequence, so the metaphor is carried by the
// structure rather than by decoration.
export function RouteView({ schedule, unitsPerTerm }: { schedule: Schedule; unitsPerTerm: number }) {
  if (schedule.terms.length === 0) return null;

  const target = schedule.meetsTarget;

  return (
    <div className="route">
      {schedule.terms.map((term, i) => {
        const [season, year] = term.label.split(' ');
        // A term over the normal load is worth flagging: it is usually the
        // result of one course that is simply larger than the budget, and a
        // student should see that rather than discover it at registration.
        const over = term.units > unitsPerTerm;

        return (
          <div
            className="term"
            key={term.label}
            data-over={over}
            style={{ '--i': i } as React.CSSProperties}
          >
            <div className="term-when">
              <div className="term-season">{season}</div>
              <div className="term-year">{year}</div>
            </div>
            <div className="term-body">
              <div className="term-load">
                {term.units} units · {term.courses.length}{' '}
                {term.courses.length === 1 ? 'course' : 'courses'}
                {over ? ' · over a normal load' : ''}
              </div>
              <div className="term-courses">
                {term.courses.map((c: Course) => (
                  <span className="course-chip" key={c.code}>
                    <span className="code">{c.code}</span>
                    <span>{c.title}</span>
                    <u>{c.units}u</u>
                  </span>
                ))}
              </div>
              {term.sequenced.length > 0 && (
                <p className="term-note">
                  {term.sequenced.join(', ')} looks like part of a numbered sequence, so the rest of
                  it sits in later terms. That is read from how the courses are numbered, not from
                  the agreement, which lists no prerequisites at all.
                </p>
              )}
            </div>
          </div>
        );
      })}

      <div className="terminus" style={{ '--i': schedule.terms.length } as React.CSSProperties}>
        <div className="term-when">
          <div className="term-season">Done</div>
        </div>
        <div className="terminus-body">
          Major preparation finished
          <small>
            {target === false
              ? 'Later than the term you were aiming for.'
              : 'Everything on this agreement that your college can cover.'}
          </small>
        </div>
      </div>
    </div>
  );
}
