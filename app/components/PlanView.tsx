import { semesterToQuarter } from '../../src/planner/units';
import type { Plan, RowStatus } from '../../src/planner/plan';
import type { AndGroup } from '../../src/parser/groups';
import type { Course } from '../../src/parser/types';

function courseLabel(c: Course): string {
  return `${c.code} ${c.title}`;
}

const optionUnits = (o: AndGroup) => o.courses.reduce((sum, c) => sum + c.units, 0);
const optionLabel = (o: AndGroup) => o.courses.map(courseLabel).join(' and ');

// Lists every accepted alternative for a requirement, for the states where
// the student still has a real decision in front of them. `chosen` compares
// by array identity against status.cheapestOption or status.satisfiedBy,
// both of which are the exact same array reference as one member of
// status.allOptions (baseStatus never copies), so this never has to fall
// back to matching on course codes.
function OptionList({ options, chosen }: { options: AndGroup[]; chosen?: Course[] }) {
  if (options.length === 0) return null;
  return (
    <ul className="option-list">
      {options.map((o, i) => (
        <li key={i} className={o.courses === chosen ? 'option-chosen' : undefined}>
          {optionLabel(o)} ({optionUnits(o)} semester units)
          {o.courses === chosen ? '. This is the one suggested above.' : '.'}
        </li>
      ))}
    </ul>
  );
}

// Every branch below is keyed off `status.state`, never off which fields
// happen to be populated. An `alternative` or `optional` row still carries
// the `cheapestOption` it had while it was `remaining`, from before it lost
// its group to a cheaper sibling. Reading that field instead of the state
// would tell a student to take a course they no longer need, which is
// exactly the bug this component exists to not have.
function StatusRow({ status, sectionLabel }: { status: RowStatus; sectionLabel?: string }) {
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
        {status.allOptions.length > 1 && (
          <>
            <p className="option-list-intro">Every accepted option for this requirement:</p>
            <OptionList options={status.allOptions} chosen={status.cheapestOption} />
          </>
        )}
      </li>
    );
  }

  if (status.state === 'not_articulated') {
    return (
      <li className="status-row status-not-articulated">
        <strong>{label}</strong>. Nothing at your college is articulated for this. You take it
        after you transfer.
        {/* ASSIST distinguishes "no course articulated" from "this course
            must be taken at the university after transfer", which are
            different pieces of advice. Shown in its own words when it gave
            one; an agreement read from a PDF prints only a single marker and
            so carries none. */}
        {status.notArticulatedReason && (
          <span className="reason"> ASSIST says: {status.notArticulatedReason}.</span>
        )}
      </li>
    );
  }

  if (status.state === 'optional') {
    return (
      <li className="status-row status-optional">
        <strong>{label}</strong>. Optional, not something you need to do: enough other choices
        {sectionLabel ? ` in "${sectionLabel}"` : ' in this section'} already cover it.
        {status.allOptions.length > 0 && (
          <>
            <p className="option-list-intro">What would have counted for this one:</p>
            <OptionList options={status.allOptions} />
          </>
        )}
      </li>
    );
  }

  if (status.state === 'alternative') {
    return (
      <li className="status-row status-alternative">
        <strong>{label}</strong>. Not needed: this is a route you did not take. An alternative for
        the same requirement is already covered, so nothing here adds units.
        {status.allOptions.length > 0 && (
          <>
            <p className="option-list-intro">What would have counted for this route:</p>
            <OptionList options={status.allOptions} />
          </>
        )}
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

// Plain-language statement of a section's rule. The whole point is telling a
// student "pick 1 of these 8" instead of letting all 8 read as separate
// required items, which was the bug this component exists to fix. An 'all'
// section with a real label (REQUIRED FOR ADMISSION, for example) still gets
// a one-line reminder that everything under it is required; the unlabelled
// synthetic section that never governs a real requirement gets no line at
// all. An 'advisory' section says outright that its rule was not applied,
// because a student reading a list of required-looking items deserves to
// know the tool did not understand the rule over them.
function SectionRuleLine({ section, count }: { section: Plan['sections'][number]; count: number }) {
  const { rule } = section;

  if (rule.kind === 'choose') {
    return (
      <p className="section-rule">
        Pick at least {section.needed} of these {count}. You have {section.satisfiedCount} so far.
      </p>
    );
  }

  if (rule.kind === 'choose_units') {
    return (
      <p className="section-rule">
        Take at least {rule.least} semester units from these {count}. You have{' '}
        {section.satisfiedUnits} so far.
      </p>
    );
  }

  if (rule.kind === 'choose_route') {
    return (
      <p className="section-rule">
        Complete any one of these {count} routes in full. The cheapest one by units is the one
        shown as still needed; the others are marked as routes you did not take.
      </p>
    );
  }

  if (rule.kind === 'advisory') {
    return (
      <p className="section-rule section-rule-advisory" role="note">
        {rule.text} This tool does not apply that rule, so everything below is counted as
        required, which overstates the work rather than hiding a requirement. Read the rule and
        decide for yourself which of these you need.
      </p>
    );
  }

  if (section.label) {
    return <p className="section-rule">All {count} of these are required.</p>;
  }
  return null;
}

export function PlanView({ plan }: { plan: Plan }) {
  const hasUnreadable = plan.statuses.some((s) => s.state === 'unreadable');

  // Group the flat statuses array back under the section it came from. A
  // status without a recognised section (only possible from a hand-built
  // Agreement that never set one; a real parsed agreement always tags every
  // row) falls back to a plain, unheaded list so nothing silently vanishes.
  const bySection = new Map<number, RowStatus[]>();
  const ungrouped: RowStatus[] = [];
  for (const status of plan.statuses) {
    if (status.section === undefined || !plan.sections[status.section]) {
      ungrouped.push(status);
      continue;
    }
    const members = bySection.get(status.section) ?? [];
    members.push(status);
    bySection.set(status.section, members);
  }

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

      <p className="limits-note">
        Two ways this plan can be wrong, both worth knowing. Where a section&apos;s rule was not
        one this tool evaluates, it treats every item under that section as required and says so
        on the section itself, which can overstate the work. Separately, when a course you
        already completed could count toward more than one requirement, this tool credits it to
        only the first requirement it matches, walking the agreement in order, which can
        understate what you have already finished. It never overstates what you have finished.
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
        Where a requirement has several accepted options, the one suggested here is simply the one
        with the fewest units. Fewest units is not the same as best for your major: every accepted
        option for each requirement is listed under &quot;All requirements&quot; below, with the
        one suggested here marked.
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
        Every requirement on the agreement, grouped the way the agreement itself groups them.
        Alternative routes you did not take stay listed so they do not just vanish from view, and
        an optional requirement is marked as optional rather than as something left to do.
      </p>

      {ungrouped.length > 0 && (
        <ul className="status-list">
          {ungrouped.map((s, i) => (
            <StatusRow key={i} status={s} />
          ))}
        </ul>
      )}

      {plan.sections.map((section, index) => {
        const members = bySection.get(index) ?? [];
        if (members.length === 0) return null;
        return (
          <div className="section-group" key={index}>
            {section.label && <h4>{section.label}</h4>}
            <SectionRuleLine section={section} count={members.length} />
            <ul className="status-list">
              {members.map((s, i) => (
                <StatusRow key={i} status={s} sectionLabel={section.label || undefined} />
              ))}
            </ul>
          </div>
        );
      })}

      {plan.notes.length > 0 && (
        <>
          <h3>Notes from the receiving campus</h3>
          <p>Their text, shown as printed. Read it, it carries rules this tool does not check.</p>
          <ul>
            {plan.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
