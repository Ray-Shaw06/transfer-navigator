import { Fragment } from 'react';
import type { Schedule, ScheduleItem, TermRef } from '../../src/planner/schedule';
import { termIndex, termLabel } from '../../src/planner/schedule';
import { areasCleared, type DoubleCountIndex } from '../../src/planner/doubleCount';
import type { Course } from '../../src/parser/types';

// The plan drawn as a route: a rail, a station per term, a terminus. The
// content genuinely is a sequence, so the metaphor is carried by the
// structure rather than by decoration.
export function RouteView({
  schedule,
  unitsPerTerm,
  doubleCount,
  pattern,
  target,
}: {
  schedule: Schedule;
  unitsPerTerm: number;
  doubleCount: DoubleCountIndex;
  pattern: string;
  // The term the student is aiming at, so the route can draw the line they
  // are actually planning against rather than only its own end.
  target: TermRef | null;
}) {
  if (schedule.terms.length === 0) return null;

  const onTime = schedule.meetsTarget;
  // The term the divider goes after: the last one at or before the target.
  // Only drawn when work genuinely falls past it, and only when that work is
  // work the student can leave until after they transfer.
  const split =
    target !== null && schedule.transferByTarget === true && schedule.meetsTarget === false
      ? schedule.terms.filter((t) => termIndex(t.ref) <= termIndex(target)).length
      : -1;
  const doubled = schedule.terms
    .flatMap((t) => t.courses)
    .filter((c) => areasCleared(doubleCount, c.code).length > 0).length;
  const areaSlots = schedule.terms
    .flatMap((t) => t.items)
    .filter((i) => i.kind === 'area').length;

  return (
    <>
      {(doubled > 0 || areaSlots > 0) && (
        <p className="route-note">
          {doubled > 0 && (
            <>
              <b>{doubled}</b> of these courses also clear a {pattern} area, marked on the course.
              You are not taking them twice.{' '}
            </>
          )}
          {areaSlots > 0 && (
            <>
              The <b>{areaSlots}</b> outlined {areaSlots === 1 ? 'slot is' : 'slots are'} general
              education still to choose: ASSIST does not say which course fills an area, so the
              area is scheduled at the units it takes and you pick the course.
            </>
          )}
        </p>
      )}
      <div className="route">
      {schedule.terms.map((term, i) => {
        const [season, year] = term.label.split(' ');
        // Everything from here down is the rest of the pattern, not the
        // route to transferring. Said at the boundary, where a student
        // reading downwards actually reaches it.
        const divider =
          i === split && target !== null ? (
            <div className="route-split" key="split" style={{ '--i': i } as React.CSSProperties}>
              <b>You transfer here, {termLabel(target)}</b>
              <span>
                Everything above is on this agreement or is what admission itself turns on. The{' '}
                {schedule.overflowUnits} units below finish {pattern} certification, which neither
                system asks for before you transfer. Leaving them undone means doing your campus's
                own general education requirements after you arrive instead.
              </span>
            </div>
          ) : null;
        // A term over the normal load is worth flagging: it is usually the
        // result of one course that is simply larger than the budget, and a
        // student should see that rather than discover it at registration.
        const over = term.units > unitsPerTerm;

        const body = (
          <div
            className="term"
            key={term.label}
            data-over={over}
            data-after={split >= 0 && i >= split}
            style={{ '--i': i } as React.CSSProperties}
          >
            <div className="term-when">
              <div className="term-season">{season}</div>
              <div className="term-year">{year}</div>
            </div>
            <div className="term-body">
              <div className="term-load">
                {/* Counted over items, not courses: an area slot is one
                    course the student will take, it just does not have a name
                    yet. Counting only the named ones reads as an empty term. */}
                {term.units} units · {term.items.length}{' '}
                {term.items.length === 1 ? 'course' : 'courses'}
                {over ? ' · over a normal load' : ''}
              </div>
              <div className="term-courses">
                {term.items.map((item: ScheduleItem) => {
                  // An area is not a course. It carries the units the pattern
                  // says it takes, and the student picks what fills it.
                  if (item.kind === 'area') {
                    return (
                      <span className="area-chip" key={`area-${item.areaId}-${item.units}`}>
                        <span className="area-mark">{item.areaId}</span>
                        <span>{item.label}</span>
                        <u>{item.units}u</u>
                      </span>
                    );
                  }

                  const c = item.course;
                  // A course doing double duty is the best thing on the
                  // route, so it is marked where the student reads the plan
                  // rather than only counted in the panel below.
                  const areas = areasCleared(doubleCount, c.code);
                  return (
                    <span className="course-chip" key={c.code} data-double={areas.length > 0}>
                      <span className="code">{c.code}</span>
                      <span>{c.title}</span>
                      {areas.length > 0 && (
                        <b
                          className="double-badge"
                          title={`Also clears ${pattern} ${areas.length === 1 ? 'Area' : 'Areas'} ${areas.join(', ')}`}
                        >
                          {areas.join('·')}
                        </b>
                      )}
                      <u>{c.units}u</u>
                    </span>
                  );
                })}
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

        return divider ? (
          <Fragment key={term.label}>
            {divider}
            {body}
          </Fragment>
        ) : (
          body
        );
      })}

      <div className="terminus" style={{ '--i': schedule.terms.length } as React.CSSProperties}>
        <div className="term-when">
          <div className="term-season">Done</div>
        </div>
        <div className="terminus-body">
          {areaSlots > 0 ? `Major preparation and ${pattern} finished` : 'Major preparation finished'}
          <small>
            {/* Three different endings, because the target makes them
                different. Only the last of them is bad news: a route that
                runs past the target on certification alone still gets the
                student there on time, and saying it is late would be the
                wrong answer to the question they asked. */}
            {split >= 0 && target !== null
              ? `${pattern} certification, finished after you transfer in ${termLabel(target)}.`
              : onTime === false
                ? 'Later than the term you were aiming for.'
                : areaSlots > 0
                  ? `Everything on this agreement your college can cover, plus the ${pattern} pattern.`
                  : 'Everything on this agreement that your college can cover.'}
          </small>
        </div>
      </div>
      </div>
    </>
  );
}
