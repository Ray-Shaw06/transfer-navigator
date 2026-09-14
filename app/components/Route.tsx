import { Fragment } from 'react';
import type { Schedule, ScheduleItem, TermRef } from '../../src/planner/schedule';
import { termIndex, termLabel } from '../../src/planner/schedule';
import { areasCleared, type DoubleCountIndex } from '../../src/planner/doubleCount';
import { padCourseCode } from '../../src/catalog/normalize';
import type { Course } from '../../src/parser/types';

// The plan drawn as a route: a rail, a station per term, a terminus. The
// content genuinely is a sequence, so the metaphor is carried by the
// structure rather than by decoration.
export function RouteView({
  schedule,
  doubleCount,
  pattern,
  target,
  catalog,
}: {
  schedule: Schedule;
  doubleCount: DoubleCountIndex;
  // Whether the order came from the college's own catalog or from reading
  // course numbers.
  catalog: boolean;
  pattern: string;
  // The term the student is aiming at, so the route can draw the line they
  // are actually planning against rather than only its own end.
  target: TermRef | null;
}) {
  if (schedule.terms.length === 0) return null;

  const onTime = schedule.meetsTarget;
  // The term the divider goes after: the last one before the target. Before,
  // not at: the target is the term the student starts at the university, so
  // it is not a term they can take a course at their college in.
  //
  // Only drawn when work genuinely falls past it, and only when that work is
  // work the student can leave until after they transfer.
  const split =
    target !== null && schedule.transferByTarget === true && schedule.meetsTarget === false
      ? schedule.terms.filter((t) => termIndex(t.ref) < termIndex(target)).length
      : -1;
  const doubled = schedule.terms
    .flatMap((t) => t.courses)
    .filter((c) => areasCleared(doubleCount, c.code).length > 0).length;
  const areaSlots = schedule.terms
    .flatMap((t) => t.items)
    .filter((i) => i.kind === 'area').length;

  return (
    <>
      {schedule.missingPrereqs.length > 0 && (
        <div className="route-block" data-warn="true">
          {/* The one thing on this page a student cannot find out from the
              agreement, and the one that stops them at the registration page.
              Named as courses, with what opens each, so it can be acted on. */}
          <b>
            {schedule.missingPrereqs.length === 1
              ? 'One course here needs something first that this plan does not include.'
              : `${schedule.missingPrereqs.length} courses here need something first that this plan does not include.`}
          </b>
          <ul>
            {schedule.missingPrereqs.map((m) => (
              <li key={m.course}>
                <b>{m.course}</b> needs {m.needs.map(padCourseCode).join(' or ')}
              </li>
            ))}
          </ul>
          <span>
            Your college requires these; the agreement does not list them, so they are not in the
            plan above. If you have already taken one, tick it under &ldquo;Where you are&rdquo; or
            mark the requirement as already held. If you have not, it is real work to add and worth
            taking to a counselor.
          </span>
        </div>
      )}

      {schedule.terms.some((t) => t.sequenced.length > 0) && (
        <p className="route-note">
          {/* Which of the two ordered this plan changes how far a student
              should trust it, so it is said rather than left to be assumed. */}
          {catalog ? (
            <>
              Some of these are ordered because one comes before another, read from your
              college&rsquo;s own catalog. The agreement carries no prerequisites; the catalog
              does, and it is what put these terms in this order.
            </>
          ) : (
            <>
              Some of these are ordered because one comes before another. This site cannot read
              your college&rsquo;s catalog, so that is a reading of how the courses are numbered
              and of which of them the agreement groups together, not a list of real
              prerequisites. Check what you are taking together against your college&rsquo;s
              catalog before you register.
            </>
          )}
        </p>
      )}
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
                Everything above is what admission turns on. The {schedule.overflowUnits} units
                below are {pattern} certification and major preparation this agreement lists
                without marking it required for admission. Neither is asked for before you
                transfer. Leaving the {pattern} part undone means doing your campus's own general
                education requirements after you arrive instead.
              </span>
            </div>
          ) : null;
        // A term over its own ceiling is worth flagging: it is usually the
        // result of one course that is simply larger than the budget, and a
        // student should see that rather than discover it at registration.
        // Against the term's ceiling, not the student's chosen load, or every
        // ordinary winter and summer term would read as under-filled and an
        // overfull one would not read as over at all.
        const over = term.units > term.budget;
        // A short session is not a semester and should not be mistaken for
        // one on a route that lists them side by side.
        const short = term.ref.kind === 'Winter' || term.ref.kind === 'Summer';

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
                {short ? ' · short session' : ''}
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
                  <b>{term.sequenced.join(', ')}</b> looks like part of a chain, so the rest of it
                  sits in later terms.
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
