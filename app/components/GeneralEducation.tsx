import type { GeStatus } from '../../src/planner/ge';

// General education alongside major preparation.
//
// The headline is the overlap, because that is the part a student cannot work
// out on their own and routinely gets wrong: a course that satisfies a major
// requirement and a Cal-GETC area at once. What this panel will not say is
// that an area is finished. ASSIST publishes which courses clear which area,
// not how many each area needs, so the count comes from the official list and
// a counselor and is labelled as such.
export function GeneralEducation({ status }: { status: GeStatus }) {
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
            area, so you are not taking them for general education on top.
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

      <div className="ge-areas-head">
        <h4>The {status.pattern} areas</h4>
        <span className="tally">
          {covered.length} of {status.areas.length} touched by your plan
        </span>
      </div>

      <ul className="ge-list">
        {status.areas.map((area) => {
          const touched = area.done.length + area.planned.length;
          return (
            <li key={area.code} data-touched={touched > 0}>
              <span className="ge-code">{area.code}</span>
              <span className="ge-name">{area.name}</span>
              <span className="ge-count">
                {touched > 0 ? (
                  <>
                    {[...area.done, ...area.planned].map((c) => c.code).join(', ')}
                  </>
                ) : (
                  <>{area.offered} courses at your college</>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="scope">
        <p>
          <b>How many each area needs is not shown here.</b> ASSIST publishes which of your
          college&apos;s courses clear which {status.pattern} area, which is what is above. It does
          not publish how many courses or units each area requires, and this tool will not guess
          it. Get the counts from the official {status.pattern} list and your counselor.
        </p>
        <p>
          {status.pattern} is also not always the right move. Some majors, engineering and computer
          science especially, tell students to prioritise major preparation over completing a full
          general education pattern. Read the campus notes above before you commit to it.
        </p>
      </div>
    </>
  );
}
