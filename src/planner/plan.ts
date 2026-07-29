import type { Agreement, ArticulationRow } from '../parser/document';
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

function baseStatus(row: ArticulationRow, done: Set<string>): RowStatus {
  const base = {
    receiving: row.receiving,
    orGroup: row.orGroup,
    satisfiedBy: [] as Course[],
    cheapestOption: [] as Course[],
    remainingUnits: 0,
  };

  if (row.sending.kind === 'not_articulated') return { ...base, state: 'not_articulated' };
  if (row.sending.kind === 'unreadable') return { ...base, state: 'unreadable' };

  const met = row.sending.options.find((o) =>
    o.courses.every((c) => done.has(c.code.toUpperCase())),
  );
  if (met) return { ...base, state: 'satisfied', satisfiedBy: met.courses };

  const cheapest = [...row.sending.options].sort(
    (a, b) => total(a.courses) - total(b.courses),
  )[0];
  const open = cheapest.courses.filter((c) => !done.has(c.code.toUpperCase()));

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

  const statuses: RowStatus[] = agreement.rows.map((row) => baseStatus(row, done));
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
