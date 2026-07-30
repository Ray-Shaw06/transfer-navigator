import type { Agreement, ArticulationRow } from '../parser/document';
import type { AndGroup } from '../parser/groups';
import type { Course } from '../parser/types';

export type RowStatus = {
  receiving: Course[];
  orGroup?: number;
  state: 'satisfied' | 'remaining' | 'not_articulated' | 'unreadable' | 'alternative';
  satisfiedBy: Course[];
  cheapestOption: Course[];
  remainingUnits: number;
};

export type Plan = {
  statuses: RowStatus[];
  remainingUnits: number;
  terms: Course[][];
  notArticulated: Course[];
};

const total = (courses: Course[]) => courses.reduce((sum, c) => sum + c.units, 0);

// The agreement's own text says a single course may be used only once. Two
// rows that both list, say, MATH 022 must not both come out satisfied from
// one completed course, or the plan understates what is actually left.
//
// `consumed` is the running set of course codes already spent by an earlier
// row in this same walk (rows are processed in document order, the closest
// thing to the agreement's own priority). A course only counts toward this
// row when the student has done it and no earlier row has already claimed
// it. When a row is satisfied, every course in the option that satisfied it
// is added to `consumed` so later rows cannot reuse it.
//
// Walking in document order and taking the first row's pick is deliberately
// simple and not globally optimal: it can understate what a student has
// completed (a course spent on an earlier row when a later row had no other
// option), but it can never overstate it, since a course is never claimed by
// more than one row. Understating is the safe direction.
function baseStatus(row: ArticulationRow, done: Set<string>, consumed: Set<string>): RowStatus {
  const base = {
    receiving: row.receiving,
    orGroup: row.orGroup,
    satisfiedBy: [] as Course[],
    cheapestOption: [] as Course[],
    remainingUnits: 0,
  };

  if (row.sending.kind === 'not_articulated') return { ...base, state: 'not_articulated' };
  if (row.sending.kind === 'unreadable') return { ...base, state: 'unreadable' };

  const available = (code: string) => done.has(code) && !consumed.has(code);

  // Among the options the student has fully completed with courses nothing
  // else has claimed yet, prefer the one that consumes the fewest courses.
  // Otherwise a row that happens to run first and has a cheap one-course
  // option could eat a course a later row needed and had no alternative for.
  const viable = row.sending.options.filter((o) =>
    o.courses.every((c) => available(c.code.toUpperCase())),
  );
  if (viable.length > 0) {
    const chosen = [...viable].sort((a, b) => a.courses.length - b.courses.length)[0];
    for (const c of chosen.courses) consumed.add(c.code.toUpperCase());
    return { ...base, state: 'satisfied', satisfiedBy: chosen.courses };
  }

  // Sort on open units, units the student has not already claimed for this
  // row, rather than the option's full unit total. Otherwise a student
  // holding one course of a two-course option can be routed to a costlier
  // single-course option just because its sticker total is lower.
  const openUnits = (option: AndGroup) =>
    total(option.courses.filter((c) => !available(c.code.toUpperCase())));

  const cheapest = [...row.sending.options].sort(
    (a, b) => openUnits(a) - openUnits(b),
  )[0];
  const open = cheapest.courses.filter((c) => !available(c.code.toUpperCase()));

  return {
    ...base,
    state: 'remaining',
    cheapestOption: cheapest.courses,
    remainingUnits: total(open),
  };
}

// Rows sharing an orGroup are routes through one requirement, so exactly one
// of them should count. Losing routes become 'alternative', which keeps them
// visible in the UI without adding units, and keeps a route with nothing
// articulated out of the blocker list when a sibling route is open.
function resolveGroups(statuses: RowStatus[]): void {
  const groups = new Map<number, RowStatus[]>();
  for (const status of statuses) {
    if (status.orGroup === undefined) continue;
    const members = groups.get(status.orGroup) ?? [];
    members.push(status);
    groups.set(status.orGroup, members);
  }

  for (const members of groups.values()) {
    const winner =
      members.find((m) => m.state === 'satisfied') ??
      [...members]
        .filter((m) => m.state === 'remaining')
        .sort((a, b) => a.remainingUnits - b.remainingUnits)[0];

    // No route is achievable. Leave every member as it is so the student sees
    // the real situation rather than an arbitrary pick.
    if (!winner) continue;

    for (const member of members) {
      if (member === winner) continue;
      member.state = 'alternative';
      member.remainingUnits = 0;
    }
  }
}

export function buildPlan(agreement: Agreement, completed: string[], unitsPerTerm = 15): Plan {
  const done = new Set(completed.map((c) => c.toUpperCase()));
  const consumed = new Set<string>();

  const statuses: RowStatus[] = agreement.rows.map((row) => baseStatus(row, done, consumed));
  resolveGroups(statuses);

  const queue = statuses
    .filter((s) => s.state === 'remaining')
    .flatMap((s) => s.cheapestOption.filter((c) => !done.has(c.code.toUpperCase())));

  const terms: Course[][] = [];
  let term: Course[] = [];
  for (const course of queue) {
    if (term.length > 0 && total(term) + course.units > unitsPerTerm) {
      terms.push(term);
      term = [];
    }
    term.push(course);
  }
  if (term.length > 0) terms.push(term);

  return {
    statuses,
    remainingUnits: statuses.reduce((sum, s) => sum + s.remainingUnits, 0),
    terms,
    notArticulated: statuses
      .filter((s) => s.state === 'not_articulated')
      .flatMap((s) => s.receiving),
  };
}
