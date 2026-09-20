import type { Plan } from '../../src/planner/plan';
import type { Schedule, ScheduleItem, TermRef } from '../../src/planner/schedule';
import { termLabel } from '../../src/planner/schedule';

// The one sentence a student reads first, and the one this whole tool is
// judged on. It is a judgement, not a metric tile: the number that matters
// sits inside a sentence that says what it means.
//
// The case this exists to get right: ASSIST publishes real agreements where a
// college articulates nothing at all. Those come back with zero units left to
// take, and a naive headline would tell a student who has done nothing that
// there is nothing to do. That is the single most damaging thing this could
// say, so it is the first case handled below.

type Tone = 'plan' | 'ready' | 'blocked' | 'late';

// What falls past the target. Counted in courses rather than areas because a
// slot is one course the student will take, and an area can hold several of
// them: two Area 5 slots and one Area 6 slot are three courses across two
// areas, and calling that "three areas" overstates what is left by an area.
function describeLeftover(items: ScheduleItem[]) {
  const ge = items.filter((i) => i.kind === 'area');
  const areas = new Set(ge.map((i) => i.areaId));
  const units = items.reduce((sum, i) => sum + i.units, 0);
  return { courses: ge.length, areas: areas.size, units };
}

const unitsOf = (items: ScheduleItem[]) => items.reduce((sum, i) => sum + i.units, 0);

const courseList = (items: ScheduleItem[]) =>
  items.flatMap((i) => (i.kind === 'course' ? [i.course.code] : [])).join(', ');

function verdictFor(
  plan: Plan,
  schedule: Schedule,
  target: TermRef | null,
  pattern: string | undefined,
) {
  const blocked = plan.statuses.filter((s) => s.state === 'not_articulated');
  const satisfied = plan.statuses.filter((s) => s.state === 'satisfied');
  const remaining = plan.statuses.filter((s) => s.state === 'remaining');
  // Everything that is a verdict on a requirement. 'reference' joins the two
  // demoted states here: an equivalency is not a requirement, and counting it
  // would report a denominator a student can never finish.
  const countable = plan.statuses.filter(
    (s) => s.state !== 'optional' && s.state !== 'alternative' && s.state !== 'reference',
  );

  // Nothing to plan against. ASSIST publishes some entries with no
  // requirements at all, only a note: Long Beach's "Business Administration"
  // says to use the entries for its options, Accountancy and Finance and the
  // rest. Read as finished, this told a student their major preparation was
  // done because the page listing it was empty.
  if (countable.length === 0) {
    return {
      tone: 'blocked' as Tone,
      line: `This agreement lists no requirements.`,
      sub: `ASSIST publishes this entry without any courses, which usually means it points at more specific entries, the options of this major, and one of those is the agreement to plan against. Read the campus note below and choose that option under Major.`,
    };
  }

  // Nothing at this college counts toward anything on this agreement.
  if (remaining.length === 0 && satisfied.length === 0 && blocked.length > 0) {
    return {
      tone: 'blocked' as Tone,
      line: `Your college has nothing articulated for this major.`,
      sub: `ASSIST lists ${blocked.length} ${blocked.length === 1 ? 'requirement' : 'requirements'} for this agreement and none of them can be satisfied at ${plan.statuses.length > 0 ? 'your college' : 'your college'}. That is what the agreement says, not a failure to read it. You would take all of this after transferring, so talk to a counselor about whether this pairing is the right route.`,
    };
  }

  // Requirements the student said they already hold, which the tool could not
  // check. Named wherever it would otherwise read as something the agreement
  // confirmed, because the difference is the whole basis for trusting the
  // rest of the page.
  const claimed = plan.statuses.filter((s) => s.clearedByCredit);
  const onYourWord =
    claimed.length > 0
      ? ` ${claimed.length} of ${claimed.length === 1 ? 'them is' : 'them are'} on your word rather than read from the agreement, so confirm ${claimed.length === 1 ? 'it' : 'those'} with a counselor.`
      : '';

  if (remaining.length === 0) {
    const line =
      blocked.length > 0
        ? `Everything your college can cover is done.`
        : `You have finished the major preparation on this agreement.`;
    return {
      tone: 'ready' as Tone,
      line,
      sub:
        blocked.length > 0
          ? `${blocked.length} ${blocked.length === 1 ? 'requirement has' : 'requirements have'} nothing articulated at your college, so ${blocked.length === 1 ? 'it is' : 'they are'} taken after you transfer. Nothing else on this agreement is left.${onYourWord}`
          : `Every requirement on this agreement is covered by what you have entered. Major preparation is only part of transferring, so check the rest with a counselor.${onYourWord}`,
    };
  }

  const ready = schedule.readyAfter ? termLabel(schedule.readyAfter) : null;

  // A target that cannot be met even doing only what the campus itself gates
  // admission on. This is the answer nobody wants and the one that has to be
  // said plainly: no reordering fixes it, so the three levers are the whole
  // of the advice.
  //
  // It is a much narrower test than it used to be. It once turned on every
  // row of the agreement, so a single recommended course the campus never
  // marked as required could produce this sentence for a student who could
  // in fact transfer on time. What it asks now is only the minimum.
  if (target && schedule.transferByTarget === false) {
    // Named as the term a student could start in, not the term the last
    // course falls in. "Not ready until Fall 2028" against a Fall 2028 target
    // reads as a contradiction; the earliest term they could actually start
    // is the answer to the question they asked.
    const earliest = schedule.earliestTransfer ? termLabel(schedule.earliestTransfer) : ready;
    return {
      tone: 'late' as Tone,
      line: `You cannot be ready to transfer by ${termLabel(target)}.`,
      sub: `This is the minimum, not the whole agreement: counting only what admission turns on and what this agreement marks as required for admission, the earliest you could start is ${earliest}. Raising your unit load, adding summer terms, or moving the target are the three ways out.`,
    };
  }

  // On time to transfer, with something left over. The headline is the answer
  // to the question actually asked, and what it costs goes underneath rather
  // than being left for the student to notice.
  //
  // Two different things can land after the target and they are not the same
  // news, so they are said separately: general education that only
  // certification needs, and major preparation this agreement lists without
  // marking it required for admission. The second is what a campus screens
  // on, so it is named with its courses rather than reduced to a unit count.
  if (target && schedule.meetsTarget === false) {
    const late = schedule.majorAfterTarget;
    const geLate = schedule.afterTarget.filter((i) => i.priority === 'certification');
    const left = describeLeftover(geLate);
    const name = pattern ?? 'the general education pattern';

    const geSentence =
      left.courses > 0
        ? ` ${left.courses} ${left.courses === 1 ? 'course' : 'courses'} of ${name}, ${left.units} units across ${left.areas} ${left.areas === 1 ? 'area' : 'areas'}, also falls after. Certification is all or nothing, so leaving those undone means finishing your campus's own general education requirements after you get there instead.`
        : '';

    if (late.length > 0) {
      return {
        tone: 'plan' as Tone,
        line: `You can be ready to transfer by ${termLabel(target)}.`,
        sub: `Everything this agreement marks as required for admission fits in the terms before ${termLabel(target)}. What does not fit is ${unitsOf(late)} units this agreement lists without that mark${courseList(late) ? `: ${courseList(late)}` : ''}. That is preparation a campus reads your application on, so take it if you can, but it is not what admission is refused for.${geSentence}`,
      };
    }

    return {
      tone: 'plan' as Tone,
      line: `You can transfer by ${termLabel(target)}, without finishing ${name}.`,
      sub: `Every requirement on this agreement, and everything admission turns on, fits in the terms before ${termLabel(target)}. What does not fit is ${left.courses} ${left.courses === 1 ? 'course' : 'courses'} of ${name}, ${left.units} units across ${left.areas} ${left.areas === 1 ? 'area' : 'areas'}, which neither system asks for before you transfer. Certification is all or nothing, so leaving those undone means finishing your campus's own general education requirements after you get there instead.`,
    };
  }

  return {
    tone: 'plan' as Tone,
    line: ready
      ? `${remaining.length} ${remaining.length === 1 ? 'requirement' : 'requirements'} left, finishing ${ready}.`
      : `${remaining.length} ${remaining.length === 1 ? 'requirement' : 'requirements'} left.`,
    sub: `${satisfied.length} of ${countable.length} already covered by what you have entered.${
      blocked.length > 0
        ? ` ${blocked.length} more ${blocked.length === 1 ? 'has' : 'have'} nothing articulated here and ${blocked.length === 1 ? 'is' : 'are'} taken after you transfer.`
        : ''
    }${onYourWord}`,
  };
}

export function Verdict({
  plan,
  schedule,
  target,
  generalEducation,
}: {
  plan: Plan;
  schedule: Schedule;
  target: TermRef | null;
  // The pattern's name when general education is in the route, so the finish
  // date is not read as covering major preparation alone.
  generalEducation?: string;
}) {
  const { tone, line, sub } = verdictFor(plan, schedule, target, generalEducation);
  const blocked = plan.statuses.filter((s) => s.state === 'not_articulated').length;
  // Suppressed once the plan misses the target: the sentence above already
  // says what the finish date covers, and repeating it there contradicts it.
  const covers = generalEducation && schedule.terms.length > 0 && schedule.meetsTarget !== false;

  return (
    <section className="verdict" data-tone={tone} aria-live="polite">
      <p className="verdict-line">{line}</p>
      <p className="verdict-sub">
        {sub}
        {covers && (
          <> The finish date covers {generalEducation} as well, not just these requirements.</>
        )}
      </p>
      <div className="verdict-figures">
        {/* Always labelled with the unit system. UC asks for 60 semester or 90
            quarter units, so a bare number here would be ambiguous by
            construction. */}
        <span className="figure">
          <b>{plan.remainingUnits + schedule.addedUnits}</b> semester units to take
          {schedule.addedUnits > 0 && (
            <small>
              {' '}
              {plan.remainingUnits} on the agreement, {schedule.addedUnits} of prerequisites it does
              not mention
            </small>
          )}
        </span>
        <span className="figure">
          <b>{schedule.terms.length}</b> {schedule.terms.length === 1 ? 'term' : 'terms'} of work
        </span>
        {blocked > 0 && (
          <span className="figure">
            <b>{blocked}</b> taken after transfer
          </span>
        )}
        {target && schedule.transferByTarget === true && schedule.meetsTarget === false && (
          <span className="figure">
            <b>{schedule.overflowUnits}</b> units left for after
          </span>
        )}
      </div>
    </section>
  );
}
