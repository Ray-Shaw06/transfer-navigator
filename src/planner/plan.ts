import type { Agreement, ArticulationRow } from '../parser/agreement';
import type { AndGroup } from '../parser/groups';
import type { SectionRule } from '../parser/sections';
import type { Course } from '../parser/types';

export type RowStatus = {
  receiving: Course[];
  // Carried through from the row so the UI can render a named requirement or
  // a GE pattern as what it is rather than as a course with zero units.
  receivingKind?: 'course' | 'requirement' | 'ge_pattern';
  orGroup?: number;
  // Index into Agreement.sections / Plan.sections, carried through from
  // ArticulationRow.section so the UI can group a flat statuses array back
  // under the section headings it came from without needing the Agreement
  // itself. Undefined only for hand-built rows (tests) that never set a
  // section; real parsed agreements always tag one.
  section?: number;
  state: 'satisfied' | 'remaining' | 'not_articulated' | 'unreadable' | 'alternative' | 'optional';
  satisfiedBy: Course[];
  cheapestOption: Course[];
  // Every accepted alternative for this requirement, not just the one the
  // planner suggested. cheapestOption is a single pick optimised for unit
  // count, and unit count is not the same as fit for a student's major; the
  // UI needs the full list so a student can see, and choose among, every
  // option genuinely articulated, not just the cheapest one. Populated
  // straight from the row's own options and never cleared on demotion, so it
  // stays correct even for an 'optional' or 'alternative' row.
  allOptions: AndGroup[];
  // Carried through from a not_articulated requirement so the UI can show
  // the campus's own reason instead of one generic sentence. Undefined for
  // every other state, and for an agreement read from a PDF.
  notArticulatedReason?: string;
  remainingUnits: number;
};

export type SectionStatus = {
  label: string;
  rule: SectionRule;
  // Counted in members, not rows. For every rule except 'choose_route' a
  // member is one row, so these are row counts; for 'choose_route' a member
  // is a whole route and these count routes.
  satisfiedCount: number;
  needed: number;
  // Sending units already covered by the satisfied members. Only a
  // 'choose_units' section is judged on this; it is reported for every
  // section so the UI never has to recompute it.
  satisfiedUnits: number;
  met: boolean;
};

export type Plan = {
  statuses: RowStatus[];
  remainingUnits: number;
  // The work still to do, kept as the option groups it came from rather than
  // flattened into a course list. A group is a set of courses that together
  // satisfy one requirement, so a scheduler that keeps them together packs
  // terms that mean something; one that flattens them cannot tell a
  // three-course requirement from three separate ones.
  remainingGroups: AndGroup[];
  notArticulated: Course[];
  sections: SectionStatus[];
  // Page 1 advisory prose, carried through from Agreement.notes untouched.
  // Nothing in this file reads it: it is not parsed, not matched against
  // anything the student has done, and never influences a status, a unit
  // total, or a term. It exists on Plan purely so the UI can display it.
  notes: string[];
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
    receivingKind: row.receivingKind,
    orGroup: row.orGroup,
    section: row.section,
    satisfiedBy: [] as Course[],
    cheapestOption: [] as Course[],
    // Shared array reference with row.sending.options, not a copy. That lets
    // the UI mark "this is the one the planner chose" by identity
    // (option.courses === status.cheapestOption / satisfiedBy) instead of a
    // second comparison by course code. For not_articulated/unreadable rows
    // there are no options to list.
    allOptions: row.sending.kind === 'options' ? row.sending.options : ([] as AndGroup[]),
    remainingUnits: 0,
  };

  if (row.sending.kind === 'not_articulated')
    return { ...base, state: 'not_articulated', notArticulatedReason: row.sending.reason };
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

// A choose group is a set of members competing to satisfy one quantifier.
// Four things reduce to it: a 'choose' section (pick N rows), a
// 'choose_units' section (pick rows totalling N units), a 'choose_route'
// section (complete one whole route), and the legacy orGroup (a
// receiving-side OR between two single-row routes through one requirement).
//
// `members` is a list of row-index groups rather than a list of row indices.
// A member is satisfied only when every row in it is satisfied, costs the
// sum of its rows' remaining units, and is demoted as a unit. For every case
// except 'choose_route' each member holds exactly one row, which is what the
// orGroup and 'choose' cases were before routes existed, so their behaviour
// is unchanged.
//
// `capWinners` distinguishes an orGroup from a section: an orGroup
// represents exactly one requirement, so even if two of its routes
// independently come out 'satisfied', only one may count, chosen by document
// order. A section has no such cap: two independently satisfied members both
// legitimately count toward its N.
//
// `unitTarget` switches the quantifier from counting members to summing the
// sending units they cover, for 'choose_units'. `least` is then read as a
// unit total rather than a member count.
type ChooseGroup = {
  members: number[][];
  least: number;
  unitTarget: boolean;
  loserState: 'optional' | 'alternative';
  capWinners: boolean;
};

// Which section rules create a group at all. 'all' and 'advisory' do not:
// every row under them is required, an advisory section deliberately so.
const QUANTIFIED = new Set(['choose', 'choose_units', 'choose_route']);

// Sections subsume orGroup rather than sitting beside it: a row already
// grouped by a quantified section is not also grouped by its legacy
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
    if (!section || !QUANTIFIED.has(section.rule.kind)) return;
    const rows = bySection.get(row.section) ?? [];
    rows.push(i);
    bySection.set(row.section, rows);
    handled.add(i);
  });

  for (const [sectionIndex, rows] of bySection) {
    const rule = agreement.sections[sectionIndex].rule;

    // One member per route. A row in a 'choose_route' section with no route
    // tag is its own single-row route rather than being dropped: an
    // untagged row must still be reachable, and a route of one is the
    // conservative reading of a row that claims no companions.
    if (rule.kind === 'choose_route') {
      const byRoute = new Map<number, number[]>();
      let synthetic = -1;
      for (const i of rows) {
        const key = agreement.rows[i].route ?? synthetic--;
        const route = byRoute.get(key) ?? [];
        route.push(i);
        byRoute.set(key, route);
      }
      groups.push({
        members: [...byRoute.values()],
        least: 1,
        unitTarget: false,
        loserState: 'alternative',
        capWinners: false,
      });
      continue;
    }

    if (rule.kind === 'choose' || rule.kind === 'choose_units') {
      groups.push({
        members: rows.map((i) => [i]),
        least: rule.least,
        unitTarget: rule.kind === 'choose_units',
        loserState: 'optional',
        capWinners: false,
      });
    }
  }

  const byOrGroup = new Map<number, number[]>();
  agreement.rows.forEach((row, i) => {
    if (row.orGroup === undefined || handled.has(i)) return;
    const rows = byOrGroup.get(row.orGroup) ?? [];
    rows.push(i);
    byOrGroup.set(row.orGroup, rows);
  });
  for (const rows of byOrGroup.values()) {
    groups.push({
      members: rows.map((i) => [i]),
      least: 1,
      unitTarget: false,
      loserState: 'alternative',
      capWinners: true,
    });
  }

  return groups;
}

type Member = {
  rows: number[];
  statuses: RowStatus[];
  // Satisfied only when every row in the member is. A route half-finished is
  // not a route the student can stop working on.
  satisfied: boolean;
  // Sending units still open across the whole member, the cost of choosing
  // it. Zero for a satisfied member.
  cost: number;
  // Units this member covers once complete, which is what a 'choose_units'
  // quantifier counts. Read from the option the planner picked, so it is the
  // units actually being credited rather than a sticker total.
  units: number;
  // False when any row is not_articulated or unreadable, meaning the student
  // cannot finish this member at their college however much they want to.
  achievable: boolean;
};

const memberUnits = (statuses: RowStatus[]) =>
  statuses.reduce(
    (sum, s) => sum + total(s.state === 'satisfied' ? s.satisfiedBy : s.cheapestOption),
    0,
  );

function describeMember(rows: number[], statuses: RowStatus[]): Member {
  const own = rows.map((i) => statuses[i]);
  return {
    rows,
    statuses: own,
    satisfied: own.every((s) => s.state === 'satisfied'),
    cost: own.reduce((sum, s) => sum + s.remainingUnits, 0),
    units: memberUnits(own),
    achievable: own.every((s) => s.state === 'satisfied' || s.state === 'remaining'),
  };
}

// Resolves one choose group in place against `statuses`, and returns the
// indices of any row demoted away from 'satisfied' so buildPlan can release
// the courses it had claimed.
//
// The rule, folded into one pass: members already satisfied count first
// (capped at one, in document order, for a capWinners group where more than
// one route happened to be independently complete). If that is already
// enough to meet the quantifier, every member not counted is demoted.
// Otherwise the cheapest achievable members needed to meet it are kept too,
// and everything else is demoted. If the quantifier cannot be met at all,
// nothing is touched: a real not_articulated blocker must surface as one
// rather than being hidden behind an unmeetable quantifier.
function resolveChooseGroup(group: ChooseGroup, statuses: RowStatus[], demoted: number[]): void {
  const members = group.members.map((rows) => describeMember(rows, statuses));

  const demote = (m: Member, releaseSatisfied: boolean) => {
    for (const [k, status] of m.statuses.entries()) {
      if (releaseSatisfied && status.state === 'satisfied') demoted.push(m.rows[k]);
      status.state = group.loserState;
      status.satisfiedBy = [];
      status.remainingUnits = 0;
    }
  };

  let satisfied = members.filter((m) => m.satisfied);
  if (group.capWinners && satisfied.length > 1) {
    for (const loser of satisfied.slice(1)) demote(loser, true);
    satisfied = satisfied.slice(0, 1);
  }

  // A unit quantifier counts what the satisfied members actually cover; a
  // member quantifier counts the members themselves. Both then ask the same
  // question of the rest: how much more is still owed.
  const covered = group.unitTarget
    ? satisfied.reduce((sum, m) => sum + m.units, 0)
    : satisfied.length;

  const candidates = members
    .filter((m) => !m.satisfied && m.achievable)
    .sort((a, b) => a.cost - b.cost);

  const keep = new Set<Member>(satisfied);
  let running = covered;
  for (const m of candidates) {
    if (running >= group.least) break;
    keep.add(m);
    running += group.unitTarget ? m.units : 1;
  }

  // Not enough achievable members exist to meet the quantifier. Demoting
  // anything here would hide the shortfall behind a tidier-looking plan, so
  // every member keeps the state it already has and the blockers stay
  // visible.
  if (running < group.least) return;

  for (const m of members) {
    if (keep.has(m)) continue;
    demote(m, true);
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
    const rows = agreement.rows
      .map((row, i) => (row.section === index ? i : -1))
      .filter((i) => i >= 0);

    // A 'choose_route' section is counted in routes, everything else in
    // rows, so that "1 of 2" means one of two routes and not one of the
    // five rows those routes happen to contain.
    const groupRows =
      section.rule.kind === 'choose_route'
        ? [...rows.reduce((map, i) => {
            const key = agreement.rows[i].route ?? -1 - i;
            map.set(key, [...(map.get(key) ?? []), i]);
            return map;
          }, new Map<number, number[]>()).values()]
        : rows.map((i) => [i]);

    const members = groupRows.map((r) => describeMember(r, statuses));
    const satisfied = members.filter((m) => m.satisfied);
    const satisfiedCount = satisfied.length;
    const satisfiedUnits = satisfied.reduce((sum, m) => sum + m.units, 0);

    let needed: number;
    let met: boolean;
    if (section.rule.kind === 'choose') {
      needed = section.rule.least;
      met = satisfiedCount >= needed;
    } else if (section.rule.kind === 'choose_units') {
      // A unit target has no fixed member count, so `needed` reports how
      // many members it currently takes to get there and `met` is judged on
      // the units alone.
      needed = satisfiedCount;
      met = satisfiedUnits >= section.rule.least;
    } else if (section.rule.kind === 'choose_route') {
      needed = 1;
      met = satisfiedCount >= 1;
    } else {
      needed = members.length;
      met = satisfiedCount >= needed;
    }

    return { label: section.label, rule: section.rule, satisfiedCount, needed, satisfiedUnits, met };
  });

  return { sections, demoted };
}

export function buildPlan(agreement: Agreement, completed: string[]): Plan {
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

  // A requirement whose receiving side is a named area or a GE pattern rather
  // than a course still has real sending courses behind it, so it schedules
  // normally; it is only its receiving label that cannot be treated as a
  // course.
  const remainingGroups: AndGroup[] = statuses
    .filter((s) => s.state === 'remaining')
    .map((s) => ({
      kind: 'and' as const,
      courses: s.cheapestOption.filter((c) => !done.has(c.code.toUpperCase())),
    }))
    .filter((g) => g.courses.length > 0);

  return {
    statuses,
    remainingUnits: statuses.reduce((sum, s) => sum + s.remainingUnits, 0),
    remainingGroups,
    notArticulated: statuses
      .filter((s) => s.state === 'not_articulated')
      .flatMap((s) => s.receiving),
    sections: resolved.sections,
    // Passed through, not read. agreement.notes is optional on the type only
    // because hand-built test fixtures predate it; parseAgreement always
    // populates it for a real agreement.
    notes: agreement.notes ?? [],
  };
}
