import type { Plan } from '../../src/planner/plan';
import type { Schedule, TermRef } from '../../src/planner/schedule';
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

function verdictFor(plan: Plan, schedule: Schedule, target: TermRef | null) {
  const blocked = plan.statuses.filter((s) => s.state === 'not_articulated');
  const satisfied = plan.statuses.filter((s) => s.state === 'satisfied');
  const remaining = plan.statuses.filter((s) => s.state === 'remaining');
  const countable = plan.statuses.filter(
    (s) => s.state !== 'optional' && s.state !== 'alternative',
  );

  // Nothing at this college counts toward anything on this agreement.
  if (remaining.length === 0 && satisfied.length === 0 && blocked.length > 0) {
    return {
      tone: 'blocked' as Tone,
      line: `Your college has nothing articulated for this major.`,
      sub: `ASSIST lists ${blocked.length} ${blocked.length === 1 ? 'requirement' : 'requirements'} for this agreement and none of them can be satisfied at ${plan.statuses.length > 0 ? 'your college' : 'your college'}. That is what the agreement says, not a failure to read it. You would take all of this after transferring, so talk to a counselor about whether this pairing is the right route.`,
    };
  }

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
          ? `${blocked.length} ${blocked.length === 1 ? 'requirement has' : 'requirements have'} nothing articulated at your college, so ${blocked.length === 1 ? 'it is' : 'they are'} taken after you transfer. Nothing else on this agreement is left.`
          : `Every requirement on this agreement is satisfied by courses you have entered. Major preparation is only part of transferring, so check the rest with a counselor.`,
    };
  }

  const ready = schedule.readyAfter ? termLabel(schedule.readyAfter) : null;

  if (target && schedule.meetsTarget === false) {
    return {
      tone: 'late' as Tone,
      line: `This plan runs past ${termLabel(target)}.`,
      sub: `At ${schedule.terms.length} ${schedule.terms.length === 1 ? 'term' : 'terms'} you finish after ${ready}, with ${schedule.overflowUnits} units falling beyond the term you were aiming for. Raising your unit load, adding summer terms, or moving the target are the three ways out.`,
    };
  }

  return {
    tone: 'plan' as Tone,
    line: ready
      ? `${remaining.length} ${remaining.length === 1 ? 'requirement' : 'requirements'} left, finishing ${ready}.`
      : `${remaining.length} ${remaining.length === 1 ? 'requirement' : 'requirements'} left.`,
    sub: `${satisfied.length} of ${countable.length} already satisfied by what you have entered.${
      blocked.length > 0
        ? ` ${blocked.length} more ${blocked.length === 1 ? 'has' : 'have'} nothing articulated here and ${blocked.length === 1 ? 'is' : 'are'} taken after you transfer.`
        : ''
    }`,
  };
}

export function Verdict({
  plan,
  schedule,
  target,
}: {
  plan: Plan;
  schedule: Schedule;
  target: TermRef | null;
}) {
  const { tone, line, sub } = verdictFor(plan, schedule, target);
  const blocked = plan.statuses.filter((s) => s.state === 'not_articulated').length;

  return (
    <section className="verdict" data-tone={tone} aria-live="polite">
      <p className="verdict-line">{line}</p>
      <p className="verdict-sub">{sub}</p>
      <div className="verdict-figures">
        {/* Always labelled with the unit system. UC asks for 60 semester or 90
            quarter units, so a bare number here would be ambiguous by
            construction. */}
        <span className="figure">
          <b>{plan.remainingUnits}</b> semester units to take
        </span>
        <span className="figure">
          <b>{schedule.terms.length}</b> {schedule.terms.length === 1 ? 'term' : 'terms'} of work
        </span>
        {blocked > 0 && (
          <span className="figure">
            <b>{blocked}</b> taken after transfer
          </span>
        )}
      </div>
    </section>
  );
}
