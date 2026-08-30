import type { GeStatus } from '../../src/planner/ge';
import { STANDARD_URL } from '../../src/planner/calgetc';
import { CourseChooser } from './CourseChooser';
import type { Course } from '../../src/parser/types';

// General education alongside major preparation.
//
// The headline is the overlap, because that is the part a student cannot work
// out on their own and routinely gets wrong: a course that satisfies a major
// requirement and a Cal-GETC area at once.
//
// How many courses each area needs comes from the ICAS standard rather than
// from ASSIST, so the panel names the edition it applied and links it. Two
// rules are shown rather than enforced: the laboratory, which is checkable and
// is checked, and Area 4's two academic disciplines, which is only flagged
// when both courses came from one department.
export function GeneralEducation({
  status,
  courses,
  chosen,
  onChange,
}: {
  status: GeStatus;
  courses: Course[];
  chosen: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const covered = status.areas.filter((a) => a.done.length > 0 || a.planned.length > 0);
  const finishedCount = status.overlap.filter((o) => o.finished).length;

  return (
    <>
      {status.overlap.length > 0 ? (
        <>
          <p className="ge-lead">
            <b>
              {status.overlap.length}{' '}
              {status.overlap.length === 1 ? 'course counts twice' : 'courses count twice'}
            </b>
            . These are already in your major preparation and they also clear a {status.pattern}{' '}
            area, so you are not taking them for general education on top. Where a course is listed
            under two areas it counts in one of them, never both.
          </p>
          <ul className="ge-overlap">
            {status.overlap.map((o) => (
              <li key={o.course.code}>
                <span className="code">{o.course.code}</span>
                <span className="ge-title">{o.course.title}</span>
                <span className="ge-areas">
                  {o.areas.map((a) => (
                    <em key={a}>{a}</em>
                  ))}
                </span>
                <span className="ge-when">{o.finished ? 'done' : 'in your route'}</span>
              </li>
            ))}
          </ul>
          {finishedCount > 0 && finishedCount < status.overlap.length && (
            <p className="field-note">
              {finishedCount} of those you have already finished; the rest are in the route above.
            </p>
          )}
        </>
      ) : (
        <p className="ge-lead">
          Nothing in your major preparation clears a {status.pattern} area, so general education is
          work on top of the route above.
        </p>
      )}

      <div className="ge-progress">
        <div className="ge-bar" role="img" aria-label={`${status.coursesDone} of ${status.coursesRequired} Cal-GETC courses finished`}>
          <span style={{ width: `${(status.coursesDone / status.coursesRequired) * 100}%` }} />
        </div>
        <p>
          <b>
            {status.coursesDone} of {status.coursesRequired} courses
          </b>{' '}
          finished, out of the {status.unitsRequired} semester units the full pattern takes.
          {covered.length > 0 && ` Your route touches ${covered.length} of ${status.areas.length} areas.`}
        </p>
      </div>

      {status.lab === false && (
        <p className="notice" data-tone="caution" role="note">
          <strong>No laboratory yet</strong>
          Area 5 asks that one of your two science courses carry a one-unit laboratory. Neither of
          the ones you have ticked does.
        </p>
      )}

      {status.areaFourOneDepartment && (
        <p className="notice" data-tone="caution" role="note">
          <strong>Both Area 4 courses look like one department</strong>
          The rule asks for two academic disciplines. Departments are not exactly disciplines, so
          this may be fine, but it is worth checking with a counselor.
        </p>
      )}

      <div className="ge-areas-head">
        <h4>The {status.pattern} areas</h4>
        <span className="tally">
          {status.areas.filter((a) => a.required > 0 && a.met).length} of{' '}
          {status.areas.filter((a) => a.required > 0).length} areas done
        </span>
      </div>

      <ul className="ge-list">
        {status.areas.map((area) => {
          const taken = [...area.done, ...area.planned];
          return (
            <li key={area.code} data-touched={taken.length > 0} data-met={area.met}>
              <span className="ge-code">{area.code}</span>
              <span className="ge-name">
                {area.name}
                {area.caveat && <em className="ge-caveat"> · {area.caveat}</em>}
              </span>
              <span className="ge-need">
                {area.required > 0 ? (
                  <>
                    {Math.min(area.done.length, area.required)} / {area.required}
                  </>
                ) : (
                  <>rule</>
                )}
              </span>
              <span className="ge-count">
                {taken.length > 0
                  ? taken.map((c) => c.code).join(', ')
                  : `${area.offered} to choose from`}
              </span>
            </li>
          );
        })}
      </ul>

      <details className="ge-add">
        <summary>Tick general education courses you have taken</summary>
        <div className="ge-add-body">
          <CourseChooser
            id="ge-filter"
            courses={courses}
            chosen={chosen}
            onChange={onChange}
            label={`Every ${status.pattern} course your college certifies`}
            emptyNote="Your college certifies no courses for this pattern in this year."
            footnote="Ticking here also updates your major preparation plan, since a course counts wherever it counts."
          />
        </div>
      </details>

      <div className="scope">
        <p>
          <b>Where these counts come from.</b> ASSIST publishes which of your college&apos;s courses
          clear which area. It does not publish how many each area needs. Those come from{' '}
          <a href={STANDARD_URL} target="_blank" rel="noreferrer">
            {status.citation}
          </a>
          , published by the Intersegmental Committee of the Academic Senates, which sets the
          pattern.
        </p>
        <p>
          <b>One course, one area.</b> The standard allows a course listed under two areas to be
          applied to only one of them, so this assigns each of yours to a single area and picks the
          assignment that satisfies the most requirements. The laboratory is the exception the
          standard names, and it rides along with an Area 5 course.
        </p>
        <p>
          <b>Two things are not decided here.</b> Area 4 asks for two academic disciplines, and a
          department is not quite a discipline, so that one is only flagged. Certification itself is
          done by your college, not by this page.
        </p>
        <p>
          <b>{status.pattern} is not always the right move.</b> Some majors, engineering and
          computer science especially, tell students to prioritise major preparation over finishing
          a full general education pattern. Read the campus notes above before committing to it.
        </p>
      </div>
    </>
  );
}
