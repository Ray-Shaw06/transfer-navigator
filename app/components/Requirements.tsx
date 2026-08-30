import type { Plan, RowStatus } from '../../src/planner/plan';
import type { AndGroup } from '../../src/parser/groups';
import type { Course } from '../../src/parser/types';

const units = (o: AndGroup) => o.courses.reduce((sum, c) => sum + c.units, 0);

function CourseName({ course }: { course: Course }) {
  return (
    <>
      <span className="code">{course.code}</span>
      {course.title ? ` ${course.title}` : ''}
    </>
  );
}

function joined(courses: Course[], word: string) {
  return courses.map((c, i) => (
    <span key={c.code}>
      {i > 0 && ` ${word} `}
      <CourseName course={c} />
    </span>
  ));
}

// Every accepted alternative for a requirement, for the states where a
// student still has a real decision in front of them. `chosen` compares by
// array identity against the option the planner picked: baseStatus never
// copies, so this never has to match on course codes.
function Options({ options, chosen }: { options: AndGroup[]; chosen?: Course[] }) {
  if (options.length === 0) return null;
  return (
    <ul className="options">
      {options.map((o, i) => (
        <li key={i} data-chosen={o.courses === chosen}>
          {joined(o.courses, 'and')} · {units(o)} units
        </li>
      ))}
    </ul>
  );
}

// A mark carrying the state, so a scan down the list reads as a column of
// statuses before a word is read. Shape differs as well as colour, which is
// what keeps it legible to a colourblind reader.
//
// Drawn rather than typed: the arrows and the check are unicode glyphs whose
// weight varies with whatever font actually resolves them, and at 12px the
// difference between a thin arrow and a minus sign is the difference between
// "take this" and "you can skip this".
const MARKS: Record<RowStatus['state'], React.ReactNode> = {
  // done
  satisfied: <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />,
  // still to take
  remaining: <path d="M3.5 8h9m-3.5-3.5L12.5 8 9 11.5" />,
  // leaves your college: taken after transfer
  not_articulated: <path d="M5 11 11 5m0 0H6.5M11 5v4.5" />,
  // could not be read
  unreadable: <path d="M6 6a2 2 0 1 1 2.6 1.9c-.4.15-.6.5-.6.9v.7M8 12.2v.3" />,
  // not something to do
  optional: <path d="M4.5 8h7" />,
  alternative: <path d="M4.5 8h7" />,
};

function Mark({ state }: { state: RowStatus['state'] }) {
  return (
    <span className="token" aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {MARKS[state]}
      </svg>
    </span>
  );
}

// The receiving side is usually a course. When ASSIST names an area or a GE
// pattern instead, it carries no course code and no units, so it is said
// plainly rather than dressed up as a zero-unit course.
function ReceivingLabel({ status }: { status: RowStatus }) {
  if (status.receivingKind === 'requirement') {
    return (
      <>
        {status.receiving.map((c) => c.code).join(', ')}{' '}
        <span className="kindnote">· an area, not a single named course</span>
      </>
    );
  }
  if (status.receivingKind === 'ge_pattern') {
    return (
      <>
        CalGETC <span className="kindnote">· a general education pattern, not one course</span>
      </>
    );
  }
  return <>{joined(status.receiving, 'and')}</>;
}

function Row({ status, sectionLabel }: { status: RowStatus; sectionLabel?: string }) {
  return (
    <li className="row" data-state={status.state}>
      <Mark state={status.state} />
      <div className="row-main">
        <div className="row-title">
          <ReceivingLabel status={status} />
        </div>

        {status.state === 'satisfied' && (
          <p className="row-detail">
            Satisfied by {joined(status.satisfiedBy, 'and')}.
          </p>
        )}

        {status.state === 'remaining' && (
          <>
            <p className="row-detail">
              Take {joined(status.cheapestOption, 'and')} · {status.remainingUnits} units.
            </p>
            {status.allOptions.length > 1 && (
              <details className="more">
                <summary>{status.allOptions.length} accepted options</summary>
                <Options options={status.allOptions} chosen={status.cheapestOption} />
              </details>
            )}
          </>
        )}

        {status.state === 'not_articulated' && (
          <p className="row-detail">
            <strong>Nothing at your college counts for this.</strong> You take it after you
            transfer.
            {status.notArticulatedReason && (
              <span className="row-reason">ASSIST says: {status.notArticulatedReason}.</span>
            )}
          </p>
        )}

        {status.state === 'optional' && (
          <>
            <p className="row-detail">
              Not something you need to do. Enough other choices
              {sectionLabel ? ' in this section' : ''} already cover it.
            </p>
            {status.allOptions.length > 0 && (
              <details className="more">
                <summary>What would have counted</summary>
                <Options options={status.allOptions} />
              </details>
            )}
          </>
        )}

        {status.state === 'alternative' && (
          <>
            <p className="row-detail">
              A route you did not take. Another route through the same requirement is already
              covered, so nothing here adds units.
            </p>
            {status.allOptions.length > 0 && (
              <details className="more">
                <summary>What would have counted</summary>
                <Options options={status.allOptions} />
              </details>
            )}
          </>
        )}

        {status.state === 'unreadable' && (
          <p className="row-detail">
            This tool could not read this requirement. Do not rely on the plan for this row: check
            it on{' '}
            <a href="https://assist.org" target="_blank" rel="noreferrer">
              assist.org
            </a>
            .
          </p>
        )}
      </div>
    </li>
  );
}

// The rule over a section, in plain language. Telling a student "pick 1 of
// these 8" instead of letting all 8 read as separate required items is the
// whole reason sections are modelled at all. An advisory section says
// outright that its rule was not applied.
function RuleLine({ section, count }: { section: Plan['sections'][number]; count: number }) {
  const { rule } = section;

  if (rule.kind === 'choose') {
    return <p className="section-rule">Pick at least {rule.least} of these {count}.</p>;
  }
  if (rule.kind === 'choose_units') {
    return (
      <p className="section-rule">
        Take at least {rule.least} {rule.unitLabel} from these {count}.
      </p>
    );
  }
  if (rule.kind === 'choose_route') {
    return (
      <p className="section-rule">
        Complete any one of these routes in full. The cheapest by units is the one marked as still
        needed; the rest are marked as routes you did not take.
      </p>
    );
  }
  if (rule.kind === 'advisory') {
    return (
      <p className="section-rule" data-advisory="true">
        {rule.text} This tool does not apply that rule, so everything below is counted as required.
        That overstates the work rather than hiding a requirement. Read the rule and decide which of
        these you actually need.
      </p>
    );
  }
  return <p className="section-rule">All {count} are required.</p>;
}

function Tally({ section }: { section: Plan['sections'][number] }) {
  if (section.rule.kind === 'choose_units') {
    return (
      <span className="tally" data-met={section.met}>
        {section.satisfiedUnits} / {section.rule.least} {section.rule.unitLabel}
      </span>
    );
  }
  return (
    <span className="tally" data-met={section.met}>
      {section.satisfiedCount} / {section.needed} done
    </span>
  );
}

export function Requirements({ plan }: { plan: Plan }) {
  // Group the flat statuses back under the section each came from. A status
  // without a recognised section falls back to an unheaded list so nothing
  // silently vanishes.
  const bySection = new Map<number, RowStatus[]>();
  const ungrouped: RowStatus[] = [];
  for (const status of plan.statuses) {
    if (status.section === undefined || !plan.sections[status.section]) {
      ungrouped.push(status);
      continue;
    }
    bySection.set(status.section, [...(bySection.get(status.section) ?? []), status]);
  }

  return (
    <>
      {ungrouped.length > 0 && (
        <ul className="rows">
          {ungrouped.map((s, i) => (
            <Row key={i} status={s} />
          ))}
        </ul>
      )}

      {plan.sections.map((section, index) => {
        const members = bySection.get(index) ?? [];
        if (members.length === 0) return null;
        return (
          <div className="section-block" key={index}>
            <div className="section-head">
              <h4>{section.label || 'Requirements'}</h4>
              <Tally section={section} />
              <RuleLine section={section} count={members.length} />
            </div>
            <ul className="rows">
              {members.map((s, i) => (
                <Row key={i} status={s} sectionLabel={section.label || undefined} />
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}
