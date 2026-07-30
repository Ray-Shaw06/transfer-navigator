import type { Agreement, ArticulationRow } from '../parser/document';
import type { AndGroup } from '../parser/groups';
import type { SectionRule } from '../parser/sections';
import type { Course } from '../parser/types';

export type RowStatus = {
  receiving: Course[];
  orGroup?: number;
  state: 'satisfied' | 'remaining' | 'not_articulated' | 'unreadable' | 'alternative' | 'optional';
  satisfiedBy: Course[];
  cheapestOption: Course[];
  remainingUnits: number;
};

export type SectionStatus = {
  label: string;
  rule: SectionRule;
  satisfiedCount: number;
  needed: number;
  met: boolean;
};

export type Plan = {
  statuses: RowStatus[];
  remainingUnits: number;
  terms: Course[][];
  notArticulated: Course[];
  sections: SectionStatus[];
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

// A choose group is either an explicit section with rule 'choose', or the
// legacy orGroup (a receiving-side OR between two routes through one
// requirement). Both reduce to the same question: of these members, do
// enough already count, and if not, which of the rest are worth pursuing.
// `capWinners` is what distinguishes them: an orGroup represents exactly one
// requirement, so even if two of its routes independently come out
// 'satisfied', only one may count, chosen by document order the same way it
// always was. A 'choose' section has no such cap: two independently
// satisfied members both legitimately count toward its N.
type ChooseGroup = {
  indices: number[];
  least: number;
  loserState: 'optional' | 'alternative';
  capWinners: boolean;
};

// Sections subsume orGroup rather than sitting beside it: a row already
// grouped by an explicit 'choose' section is not also grouped by its legacy
// orGroup, so the two mechanisms never compete over the same row. On the
// real agreement this matters for the linear algebra requirement, which
// carries both an orGroup (from the receiving-column OR) and a 'choose'
// section tag (from "3 Select A or B"); the section wins and orGroup is
// simply not consulted for it.
function buildGroups(agreement: Agreement): ChooseGroup[] {
  const groups: ChooseGroup[] = [];
  const handled = new Set<number>();

  const bySection = new Map<number, number[]>();
  agreement.rows.forEach((row, i) => {
    if (row.section === undefined) return;
    const section = agreement.sections[row.section];
    if (!section || section.rule.kind !== 'choose') return;
    const members = bySection.get(row.section) ?? [];
    members.push(i);
    bySection.set(row.section, members);
    handled.add(i);
  });
  for (const [sectionIndex, indices] of bySection) {
    const rule = agreement.sections[sectionIndex].rule;
    if (rule.kind !== 'choose') continue;
    groups.push({ indices, least: rule.least, loserState: 'optional', capWinners: false });
  }

  const byOrGroup = new Map<number, number[]>();
  agreement.rows.forEach((row, i) => {
    if (row.orGroup === undefined || handled.has(i)) return;
    const members = byOrGroup.get(row.orGroup) ?? [];
    members.push(i);
    byOrGroup.set(row.orGroup, members);
  });
  for (const indices of byOrGroup.values()) {
    groups.push({ indices, least: 1, loserState: 'alternative', capWinners: true });
  }

  return groups;
}

// Resolves one choose group in place against `statuses`, and returns the
// indices of any member demoted away from 'satisfied' so buildPlan can
// release the courses it had claimed.
//
// The rule, folded into one pass: members already 'satisfied' count first
// (capped at one, in document order, for a capWinners group where more than
// one route happened to be independently complete). If that is already
// enough to reach `least`, every member not counted is demoted. Otherwise
// the cheapest `remaining` members needed to reach `least` are kept too, and
// everything else is demoted. If there are not enough achievable members to
// reach `least` at all, nothing is touched: a real not_articulated blocker
// must surface as one rather than being hidden behind an unmeetable quantifier.
function resolveChooseGroup(group: ChooseGroup, statuses: RowStatus[], demoted: number[]): void {
  const members = group.indices.map((i) => ({ i, status: statuses[i] }));

  let satisfied = members.filter((m) => m.status.state === 'satisfied');
  if (group.capWinners && satisfied.length > 1) {
    for (const loser of satisfied.slice(1)) {
      loser.status.state = group.loserState;
      loser.status.satisfiedBy = [];
      loser.status.remainingUnits = 0;
      demoted.push(loser.i);
    }
    satisfied = satisfied.slice(0, 1);
  }

  const needed = Math.max(group.least - satisfied.length, 0);
  const cheapestRemaining = members
    .filter((m) => m.status.state === 'remaining')
    .sort((a, b) => a.status.remainingUnits - b.status.remainingUnits)
    .slice(0, needed);

  if (cheapestRemaining.length < needed) return;

  const keep = new Set([...satisfied.map((m) => m.i), ...cheapestRemaining.map((m) => m.i)]);
  for (const m of members) {
    if (keep.has(m.i)) continue;
    m.status.state = group.loserState;
    m.status.remainingUnits = 0;
  }
}

function resolveSections(
  agreement: Agreement,
  statuses: RowStatus[],
): { sections: SectionStatus[]; demoted: number[] } {
  const demoted: number[] = [];
  for (const group of buildGroups(agreement)) {
    resolveChooseGroup(group, statuses, demoted);
  }

  const sections: SectionStatus[] = agreement.sections.map((section, index) => {
    const members = statuses.filter((_, i) => agreement.rows[i].section === index);
    const satisfiedCount = members.filter((m) => m.state === 'satisfied').length;
    const needed = section.rule.kind === 'choose' ? section.rule.least : members.length;
    return { label: section.label, rule: section.rule, satisfiedCount, needed, met: satisfiedCount >= needed };
  });

  return { sections, demoted };
}

export function buildPlan(agreement: Agreement, completed: string[], unitsPerTerm = 15): Plan {
  const done = new Set(completed.map((c) => c.toUpperCase()));

  // A row in `excluded` keeps whatever status `fixed` already gave it
  // (baseStatus is not re-run for it, and it claims nothing from `consumed`
  // this pass) rather than being recomputed. That is what lets a demoted
  // route's courses actually become available again: simply removing them
  // from a shared `consumed` set after the fact would not undo the rows that
  // already ran and found them taken, since baseStatus commits `consumed`
  // as it walks. Skipping the demoted row entirely on the next walk is what
  // frees the course for whatever later row wants it.
  const computeStatuses = (excluded: Set<number>, fixed: RowStatus[]): RowStatus[] => {
    const consumed = new Set<string>();
    return agreement.rows.map((row, i) => (excluded.has(i) ? fixed[i] : baseStatus(row, done, consumed)));
  };

  // resolveSections can demote a member that baseStatus had already marked
  // 'satisfied' (see resolveChooseGroup's capWinners cap). That releases the
  // courses it claimed, so the whole document is walked again with that
  // member excluded, letting a later row claim them. A newly satisfied row
  // from that recompute could itself belong to another group, so the loop
  // repeats until a pass demotes nothing new. `excluded` only grows and is
  // bounded by the row count, so this always terminates.
  let excluded = new Set<number>();
  let statuses = computeStatuses(excluded, []);
  let resolved = resolveSections(agreement, statuses);

  for (let i = 0; i < agreement.rows.length && resolved.demoted.some((d) => !excluded.has(d)); i++) {
    for (const d of resolved.demoted) excluded.add(d);
    statuses = computeStatuses(excluded, statuses);
    resolved = resolveSections(agreement, statuses);
  }

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
    sections: resolved.sections,
  };
}
