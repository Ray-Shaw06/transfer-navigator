import type { AreaCoverage } from './ge';
import { areasFor, type AreaRule, type Destination, type Pattern } from './patterns';

// Which general education a student has to have finished to be admitted, as
// opposed to which they have to finish to be certified.
//
// The two are not the same and both systems say so in as many words. CSU names
// four courses in 5 CCR section 40803(a). UC names a seven-course pattern and
// adds, of general education, "You don't need to complete these requirements
// before you transfer." Everything a pattern asks for beyond those is real
// work with a real deadline, but the deadline is not the application.
//
// Nothing here decides that certification does not matter. It decides which
// slots cannot move when a student does not have enough terms for all of
// them, which is the only question this answers and the only place it is read.

// How many of an area's outstanding slots admission needs, and why.
export type AdmissionNeed = {
  count: number;
  // The subarea that makes the slot critical, when the area is larger than
  // the requirement. Set only where the two differ: CSU states quantitative
  // reasoning as B4, one course inside a three-course Area B.
  need?: string;
};

// Courses already applied to an area, capped at what the area asks for. A
// student holding three courses for a two-course area has covered two of it,
// not three, and a quota must not be over-credited by the extra.
const held = (rule: AreaRule, coverage: AreaCoverage | undefined): number =>
  coverage ? Math.min(coverage.done.length + coverage.planned.length, rule.courses) : 0;

const outstanding = (rule: AreaRule, coverage: AreaCoverage | undefined): number =>
  Math.max(0, rule.courses - held(rule, coverage));

export function admissionNeeds(
  pattern: Pattern,
  destination: Destination | null,
  areas: AreaCoverage[],
): Map<string, AdmissionNeed> {
  const needs = new Map<string, AdmissionNeed>();
  if (destination === null) return needs;

  const rules = areasFor(pattern, destination);
  const coverageOf = (id: string) => areas.find((a) => a.id === id);
  const ruleOf = (id: string) => rules.find((r) => r.id === id);

  const mark = (id: string, count: number, need?: string) => {
    const existing = needs.get(id);
    if (existing && existing.count >= count) return;
    needs.set(id, { count, need: need ?? existing?.need });
  };

  if (destination === 'CSU' && pattern.csuGate) {
    // The gate is stated in ASSIST area codes because three of CSU
    // GE-Breadth's four are whole areas and the fourth is a subarea. A code
    // that names a whole area makes all of it critical; a code that names a
    // subarea makes one slot of its parent critical and says which.
    for (const item of pattern.csuGate.items) {
      const whole = ruleOf(item.code);
      if (whole) {
        mark(whole.id, outstanding(whole, coverageOf(whole.id)));
        continue;
      }
      const parent = rules.find((r) => r.from.includes(item.code));
      if (parent) mark(parent.id, Math.min(1, outstanding(parent, coverageOf(parent.id))), item.code);
    }
    return needs;
  }

  if (destination === 'UC' && pattern.ucGate) {
    for (const id of pattern.ucGate.required) {
      const rule = ruleOf(id);
      if (rule) mark(id, outstanding(rule, coverageOf(id)));
    }

    // The breadth half is a quota, not a set of areas: four courses from at
    // least two of the three. Courses the student already holds in those
    // areas count toward it, so only the shortfall has to be scheduled.
    const { areas: pool, courses, leastAreas } = pattern.ucGate.breadth;
    const inPool = pool.map(ruleOf).filter((r): r is AreaRule => r !== undefined);

    let owed = courses - inPool.reduce((sum, r) => sum + held(r, coverageOf(r.id)), 0);
    const touched = new Set(inPool.filter((r) => held(r, coverageOf(r.id)) > 0).map((r) => r.id));

    // Cheapest first, so the quota is met with the least work outstanding.
    // That is the whole point of asking the question: a student short of
    // terms wants the four courses that cost them least, not the four the
    // pattern happens to list first.
    const open = inPool
      .map((rule) => ({ rule, left: outstanding(rule, coverageOf(rule.id)) }))
      .filter((entry) => entry.left > 0)
      .sort((a, b) => a.left - b.left);

    const taken = new Map<string, number>();
    for (const { rule, left } of open) {
      if (owed <= 0) break;
      const take = Math.min(left, owed);
      taken.set(rule.id, take);
      touched.add(rule.id);
      owed -= take;
    }

    // "From at least two" is a separate demand from the count, and a pool
    // whose first area is big enough to swallow the whole quota would meet
    // one and fail the other. Move a slot to an untouched area until the
    // spread holds. Neither Cal-GETC nor IGETC has an area that large, so
    // this does not fire on either of them today; it is here because the
    // rule says it, not because a pattern currently needs it.
    while (touched.size < leastAreas) {
      const donor = [...taken.entries()].sort((a, b) => b[1] - a[1])[0];
      const spare = open.find((entry) => !touched.has(entry.rule.id));
      if (!donor || donor[1] <= 1 || !spare) break;
      taken.set(donor[0], donor[1] - 1);
      taken.set(spare.rule.id, 1);
      touched.add(spare.rule.id);
    }

    for (const [id, count] of taken) mark(id, count);
  }

  return needs;
}
