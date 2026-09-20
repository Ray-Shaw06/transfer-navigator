import type { Schedule, ScheduleItem, TermRef } from '../../src/planner/schedule';
import { termLabel } from '../../src/planner/schedule';
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
  // What did not fit before the target. The terms drawn stop at the one
  // before the target, because that is the last one the student is at their
  // college for; this is what would have needed a term after it, named
  // rather than drawn.
  const leftOut = target !== null ? schedule.afterTarget : [];
  // Which courses on the route were added for a prerequisite, and for what.
  const addedFor = new Map(schedule.addedPrerequisites.map((a) => [a.course.code, a.neededFor]));
  const leftOutCourses = leftOut.filter((i) => i.kind === 'course');
  const leftOutAreas = leftOut.filter((i) => i.kind === 'area');
  const doubled = schedule.terms
    .flatMap((t) => t.courses)
    .filter((c) => areasCleared(doubleCount, c.code).length > 0).length;
  const areaSlots = schedule.terms
    .flatMap((t) => t.items)
    .filter((i) => i.kind === 'area').length;

  return (
    <>
      {schedule.addedPrerequisites.length > 0 && (
        <div className="route-block" data-added="true">
          {/* The one thing on this page a student cannot find out from the
              agreement. The agreement names the course that satisfies a
              university requirement; the college names what has to come
              first. Those are in the plan now, in earlier terms, and this says
              which they are and why, so a student who already has one can
              tick it and watch it drop out. */}
          <b>
            {schedule.addedPrerequisites.length === 1
              ? 'One course added that the agreement does not list.'
              : `${schedule.addedPrerequisites.length} courses added that the agreement does not list.`}
          </b>
          <ul>
            {schedule.addedPrerequisites.map((a) => (
              <li key={a.course.code}>
                <b>{padCourseCode(a.course.code)}</b> before {padCourseCode(a.neededFor)}
              </li>
            ))}
          </ul>
          <span>
            Your college requires each of these before the course after it, and the agreement does
            not mention them, so they are placed in the terms above where they have to be. If you
            have already taken one, tick it under &ldquo;Where you are&rdquo; and it comes out.
            Where the catalog offers a choice, the first is added; take the other by ticking it.
          </span>
        </div>
      )}

      {schedule.missingPrereqs.length > 0 && (
        <div className="route-block" data-warn="true">
          {/* Requirements that could not be put into the plan: ones placement
              can stand in for, which most transfer students have placed past,
              and ones this could not name as a course. Named, with the reason,
              so the student knows what to check rather than what to take. */}
          <b>
            {schedule.missingPrereqs.length === 1
              ? 'One course here has a requirement to check.'
              : `${schedule.missingPrereqs.length} courses here have a requirement to check.`}
          </b>
          <ul>
            {schedule.missingPrereqs.map((m) => (
              <li key={m.course}>
                <b>{padCourseCode(m.course)}</b> needs {m.needs.map(padCourseCode).join(' or ')}
                {m.reason === 'placement' ? ', or placement' : ''}
              </li>
            ))}
          </ul>
          <span>
            {schedule.missingPrereqs.some((m) => m.reason === 'placement') && (
              <>
                Where placement is an option, your college lets an assessment stand in for the
                course, which is how most transfer students clear it. Not added to the plan for that
                reason; if you have not placed past it, it is real work.{' '}
              </>
            )}
            {schedule.missingPrereqs.some((m) => m.reason === 'unlisted') && (
              <>
                The others name courses this could not find a title or units for, in the
                agreement, the general education pattern or the catalog itself. Not added for that
                reason; it is real work unless you have placed past it, and worth a counselor.
              </>
            )}
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
                  const added = addedFor.get(c.code);
                  return (
                    <span
                      className="course-chip"
                      key={c.code}
                      data-double={areas.length > 0}
                      data-added={added !== undefined}
                      title={added ? `Added: your college requires it before ${padCourseCode(added)}` : undefined}
                    >
                      <span className="code">{c.code}</span>
                      <span>{c.title}</span>
                      {added && <b className="added-badge">before {padCourseCode(added)}</b>}
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

        return body;
      })}

      {/* The line the plan stops at, and what did not make it across. Drawn
          after the last term rather than as terms of its own: a Fall 2028
          transfer means everything is done by the end of Spring 2028, and a
          term drawn for Fall 2028 would be a term the student is not at their
          college for. Named as courses and slots so it can be acted on: taken
          earlier at a higher load, in a summer, or after arriving. */}
      {target !== null && leftOut.length > 0 && (
        <div
          className="route-split"
          data-late={schedule.transferByTarget === false}
          style={{ '--i': schedule.terms.length } as React.CSSProperties}
        >
          <b>You transfer here, {termLabel(target)}</b>
          <span>
            {schedule.transferByTarget === false ? (
              <>
                Not everything admission turns on fits before then. The {schedule.overflowUnits}{' '}
                units below would need terms after {termLabel(target)}, which is why the plan cannot
                meet it as set.
              </>
            ) : (
              <>
                Everything above is what admission turns on. The {schedule.overflowUnits} units
                below did not fit before {termLabel(target)} and are not asked for before you
                transfer: {pattern} certification, and major preparation this agreement lists
                without marking it required for admission. Leaving the {pattern} part undone
                means doing your campus's own general education requirements after you arrive
                instead.
              </>
            )}
          </span>
          <div className="term-courses">
            {leftOutCourses.map((item) =>
              item.kind === 'course' ? (
                <span className="course-chip" key={item.course.code}>
                  <span className="code">{item.course.code}</span>
                  <span>{item.course.title}</span>
                  <u>{item.units}u</u>
                </span>
              ) : null,
            )}
            {leftOutAreas.map((item, k) =>
              item.kind === 'area' ? (
                <span className="area-chip" key={`left-${item.areaId}-${k}`}>
                  <span className="area-mark">{item.areaId}</span>
                  <span>{item.label}</span>
                  <u>{item.units}u</u>
                </span>
              ) : null,
            )}
          </div>
        </div>
      )}

      <div
        className="terminus"
        style={{ '--i': schedule.terms.length + (leftOut.length > 0 ? 1 : 0) } as React.CSSProperties}
      >
        <div className="term-when">
          <div className="term-season">Done</div>
        </div>
        <div className="terminus-body">
          {target !== null && leftOut.length > 0
            ? schedule.transferByTarget === false
              ? 'Not everything required fits'
              : 'Ready to transfer'
            : areaSlots > 0
              ? `Major preparation and ${pattern} finished`
              : 'Major preparation finished'}
          <small>
            {/* Three different endings, because the target makes them
                different. Only the last of them is bad news: a route that
                runs past the target on certification alone still gets the
                student there on time, and saying it is late would be the
                wrong answer to the question they asked. */}
            {target !== null && leftOut.length > 0
              ? schedule.transferByTarget === false
                ? `Not by ${termLabel(target)}. The work named above still needs a term.`
                : `Ready to transfer in ${termLabel(target)}, with ${schedule.overflowUnits} units named above left for after.`
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
