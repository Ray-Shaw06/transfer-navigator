import type { GeStatus } from '../../src/planner/ge';
import { CourseChooser } from './CourseChooser';
import { GoldenFour } from './GoldenFour';
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
      {status.gate && <GoldenFour gate={status.gate} />}

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

      {!status.counted && (
        <p className="notice" data-tone="caution" role="note">
          <strong>No requirement counts for {status.pattern}</strong>
          ASSIST publishes which of your college&apos;s courses clear which area, which is the list
          below. How many each area takes is set by the CSU General Education Breadth Requirements,
          which this tool could not reach, so it is not shown rather than guessed. Get the counts
          from your counselor.
        </p>
      )}

      {status.counted && (
      <div className="ge-progress">
        <div className="ge-bar" role="img" aria-label={`${status.coursesDone} of ${status.coursesRequired} ${status.pattern} courses finished`}>
          <span style={{ width: `${(status.coursesDone / status.coursesRequired) * 100}%` }} />
        </div>
        <p>
          <b>
            {status.coursesDone} of {status.coursesRequired} courses
          </b>{' '}
          finished
          {status.unitsRequired ? `, out of the ${status.unitsRequired} semester units the full pattern takes` : ''}
          .
          {status.destination
            ? ` Counted for a ${status.destination} destination, which decides some of these areas.`
            : ''}
        </p>
      </div>
      )}

      {status.lab === false && (
        <p className="notice" data-tone="caution" role="note">
          <strong>No laboratory yet</strong>
          Area 5 asks that one of your two science courses carry a one-unit laboratory. Neither of
          the ones you have ticked does.
        </p>
      )}

      {status.oneDepartment && (
        <p className="notice" data-tone="caution" role="note">
          <strong>Those courses look like one department</strong>
          The rule asks for two academic disciplines. Departments are not exactly disciplines, so
          this may be fine, but it is worth checking with a counselor.
        </p>
      )}

      <div className="ge-areas-head">
        <h4>The {status.pattern} areas</h4>
        {status.counted && (
          <span className="tally">
            {status.areas.filter((a) => a.required > 0 && a.met).length} of{' '}
            {status.areas.filter((a) => a.required > 0).length} areas done
          </span>
        )}
      </div>

      <ul className="ge-list">
        {status.areas.map((area) => {
          const taken = [...area.done, ...area.planned];
          return (
            <li key={area.id} data-touched={taken.length > 0} data-met={area.met}>
              <span className="ge-code">{area.id}</span>
              <span className="ge-name">
                {area.label}
                {area.onlyFor && <em className="ge-caveat"> · {area.onlyFor} only</em>}
                {area.caveat && <em className="ge-caveat"> · {area.caveat}</em>}
                {area.notCoursework && <em className="ge-caveat"> · {area.notCoursework}</em>}
              </span>
              <span className="ge-need">
                {area.notCoursework ? '—' : area.required > 0 ? (
                  <>
                    {Math.min(area.done.length, area.required)} / {area.required}
                  </>
                ) : (
                  '—'
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
        {status.citation && status.citationUrl && (
          <p>
            <b>Where these counts come from.</b> ASSIST publishes which of your college&apos;s
            courses clear which area. It does not publish how many each area needs. Those come from{' '}
            <a href={status.citationUrl} target="_blank" rel="noreferrer">
              {status.citation}
            </a>
            , published by the Intersegmental Committee of the Academic Senates, which sets the
            pattern.
          </p>
        )}
        <p>
          <b>One course, one area.</b> Every pattern here allows a course listed under two areas to
          be applied to only one of them, so this assigns each of yours to a single area and picks
          the assignment that satisfies the most requirements.
          {status.dualCertifyNote ? ` ${status.dualCertifyNote}` : ''}
        </p>
        <p>
          <b>Some things are not decided here.</b> An area asking for two academic disciplines is
          flagged when both courses share a department rather than enforced, because a department is
          weaker than a discipline. Certification itself is done by your college, not by this page.
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
