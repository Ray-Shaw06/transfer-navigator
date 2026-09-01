import type { AndGroup } from '../parser/groups';
import type { Course } from '../parser/types';

// Turns the work a plan says is left into named terms a student can actually
// register against: Fall 2026, Spring 2027, and so on.
//
// What this knows and what it does not, stated once because the whole value
// of the output depends on it. It knows unit counts and it knows which
// courses ASSIST groups together as one requirement. It does not know
// prerequisites: no articulation agreement carries them, so nothing here can
// promise an order is registrable. The one ordering rule below is a reading
// of course numbering, clearly labelled as such wherever it is shown.

export type TermKind = 'Fall' | 'Spring' | 'Summer';

// `year` is the calendar year the term begins in, so Spring 2027 follows
// Fall 2026.
export type TermRef = { kind: TermKind; year: number };

// A term holds two kinds of thing. ASSIST names the exact course that
// satisfies a major requirement, so those are scheduled as courses. It cannot
// do that for general education: an area like Humanities has a hundred and
// more certified courses at a single college and nothing says which one a
// student will take. Those are scheduled as the area, carrying the units the
// pattern says it takes, and the student picks the course.
// What a student loses by not getting to this before they transfer.
//
//   admission      the destination system will not consider an application
//                  without it, so it cannot move
//   major          the agreement's own preparation. Not an admission minimum
//                  at either system, but it is what a campus screens on, and
//                  it is the thing this tool was built to read
//   certification  the rest of the general education pattern. Both systems
//                  say in as many words that it does not have to be finished
//                  before transferring
//
// Nothing here is a judgement about what matters to a student. It is a
// reading of which of the three a published rule actually gates admission on,
// and it is used for one thing: deciding what gets a place in the terms
// before a target when there are not enough of them for everything.
export type Priority = 'admission' | 'major' | 'certification';

export type ScheduleItem =
  | { kind: 'course'; units: number; course: Course; priority: Priority }
  | {
      kind: 'area';
      units: number;
      areaId: string;
      label: string;
      pattern: string;
      priority: Priority;
      // The subarea that makes this slot admission-critical, when the area it
      // belongs to is larger than the requirement. CSU GE-Breadth states
      // quantitative reasoning as B4, one course inside a three-course Area
      // B, so the slot has to say which of the three it is.
      need?: string;
    };

export type ScheduledTerm = {
  ref: TermRef;
  label: string;
  items: ScheduleItem[];
  // The course items alone, in order. Kept because most of what reads a term
  // wants the real courses and should not have to filter for them.
  courses: Course[];
  units: number;
  // Courses held back from an earlier term only because they look like a
  // later part of a sequence. Named so the UI can say why, since this is the
  // one place the schedule acts on a guess.
  sequenced: string[];
};

export type Schedule = {
  terms: ScheduledTerm[];
  totalUnits: number;
  // The last term with work in it: the term after which a student would have
  // finished the major preparation on this agreement. Null when nothing is
  // left to schedule.
  readyAfter: TermRef | null;
  // Whether everything fits on or before the term the student is aiming at.
  // Null when they have not named one.
  meetsTarget: boolean | null;
  // Units that did not fit before that target. Zero when there is no target
  // or when the plan fits.
  overflowUnits: number;
  // The last term holding work that has to be done before transferring, as
  // against readyAfter, which is the last term holding any work at all. When
  // a target cannot be met this is the number that helps: it says how far the
  // target would have to move, rather than how long the whole pattern takes.
  // Null when nothing essential is left to schedule.
  readyToTransfer: TermRef | null;
  // Whether everything admission turns on, plus the agreement's own major
  // preparation, fits on or before the target. This is the question a student
  // short of time is actually asking, and it is a different question from
  // meetsTarget: a plan can miss the target on units and still get the
  // student admitted on time, with the rest of a general education pattern
  // finished afterwards. Null when there is no target.
  transferByTarget: boolean | null;
  // What is scheduled after the target, in the order it falls. Empty when
  // there is no target or when everything fits.
  afterTarget: ScheduleItem[];
  // Whether the order was changed to protect the target: general education
  // that certification needs but admission does not was moved behind the work
  // that cannot move. False when nothing needed moving, or when moving it
  // would not have helped.
  reordered: boolean;
};

const ORDER: TermKind[] = ['Spring', 'Summer', 'Fall'];

export const termLabel = (ref: TermRef): string => `${ref.kind} ${ref.year}`;

// Ordinal position of a term on a single timeline, so two terms can be
// compared without special-casing the year rollover.
export const termIndex = (ref: TermRef): number => ref.year * 3 + ORDER.indexOf(ref.kind);

export function nextTerm(ref: TermRef, includeSummer: boolean): TermRef {
  if (ref.kind === 'Fall') return { kind: 'Spring', year: ref.year + 1 };
  if (ref.kind === 'Spring') return includeSummer ? { kind: 'Summer', year: ref.year } : { kind: 'Fall', year: ref.year };
  return { kind: 'Fall', year: ref.year };
}

// The term a student is most likely to be planning from, given today. Before
// October, the coming Spring; after, the coming Fall. Deliberately the next
// term they can still enrol in rather than the one already under way.
export function currentTerm(now = new Date()): TermRef {
  const month = now.getMonth();
  const year = now.getFullYear();
  if (month <= 3) return { kind: 'Spring', year };
  if (month <= 8) return { kind: 'Fall', year };
  return { kind: 'Spring', year: year + 1 };
}

// Two courses are parts of one sequence when they share a prefix and a number
// and carry DIFFERENT sequence letters: MATH 005A then MATH 005B. This is a
// reading of how California colleges number courses, not something any
// agreement states, so it only ever spreads a sequence across terms and never
// claims an order is required.
//
// Two suffix letters are not sequence steps and must be stripped first, or
// this rule does real damage:
//
//   L  a lab. CS 003BL is the lab for CS 003B, normally taken WITH it, so
//      reading the L as a later step splits a lecture from its own lab and
//      tells a student to take them a term apart.
//   H  an honours section. MATH 010H is MATH 010, not a second part of it.
const STEM = /^([A-Z&\s]+?)\s*(\d+)([A-Z]*)$/i;

export type SequenceKey = { stem: string; step: string };

export function sequenceKey(code: string): SequenceKey | null {
  const match = STEM.exec(code.trim());
  if (!match) return null;
  const [, prefix, digits, rawSuffix] = match;

  // Strip lab and honours markers wherever they trail, then whatever letters
  // remain are the actual sequence step.
  const step = rawSuffix.toUpperCase().replace(/[LH]+$/, '');
  if (!step) return null;

  return { stem: `${prefix.trim().toUpperCase()} ${digits}`, step };
}

const total = (items: { units: number }[]) => items.reduce((sum, i) => sum + i.units, 0);

export type ScheduleOptions = {
  start: TermRef;
  unitsPerTerm: number;
  includeSummer: boolean;
  summerUnits?: number;
  target?: TermRef | null;
};

export function buildSchedule(
  groups: AndGroup[],
  options: ScheduleOptions,
  // General education still to be scheduled, in the order it should be taken.
  // Spread across the terms in proportion to how much of the whole plan it
  // is, rather than filling the gaps major preparation leaves.
  generalEducation: ScheduleItem[] = [],
): Schedule {
  const { start, unitsPerTerm, includeSummer, target = null } = options;
  // Summer terms are short. Half a normal load, at least one course's worth,
  // unless the caller states otherwise.
  const summerUnits = options.summerUnits ?? Math.max(3, Math.round(unitsPerTerm / 2));

  const budgetFor = (ref: TermRef) => (ref.kind === 'Summer' ? summerUnits : unitsPerTerm);

  // A course and the lab belonging to it are one thing to schedule. They
  // share a sequence key, so they go into a block and are placed together or
  // not at all: a term with the lecture and not its lab is not a term anybody
  // can enrol in. Everything else is its own block, so a four-course
  // requirement is still allowed to straddle a term boundary.
  //
  // Blocks rather than adjacency because the two are not always neighbours:
  // one real requirement lists CS 003B, CS 033, CS 003BL in that order, and a
  // run of adjacent courses would not catch it.
  const queue = groups.flatMap((group) => {
    const blocks: Course[][] = [];
    const byKey = new Map<string, Course[]>();

    for (const course of group.courses) {
      const key = sequenceKey(course.code);
      const id = key ? `${key.stem}|${key.step}` : null;
      if (id === null) {
        blocks.push([course]);
        continue;
      }
      const existing = byKey.get(id);
      if (existing) {
        existing.push(course);
        continue;
      }
      const block = [course];
      byKey.set(id, block);
      blocks.push(block);
    }

    return blocks;
  });

  // One pass of the packer.
  //
  // `order` is the general education to place, in the order it should be
  // taken. `reserveFor` is the subset whose share of each term is held back
  // before major preparation fills it: normally all of it, and in a
  // prioritised pass only the part that cannot wait.
  const pack = (order: ScheduleItem[], reserveFor: ScheduleItem[]): ScheduledTerm[] => {
    const terms: ScheduledTerm[] = [];
    let ref = start;
    let items: ScheduleItem[] = [];
    let sequenced: string[] = [];
    const pendingGe = [...order];
    // For each stem, which sequence step was placed in which term. A course
    // clashes only with a DIFFERENT step of the same stem in the same term, so
    // a lecture and its lab still sit together.
    const placed = new Map<string, { step: string; term: number }[]>();

    const reserved = new Set(reserveFor);

    // Add general education up to a ceiling on this term's units. Walks the
    // list rather than stopping at the first thing too big, so a three-unit
    // area can still land in a term with three units left even when a
    // four-unit one is next in line.
    //
    // `onlyReserved` limits it to the general education the reservation was
    // sized for. Without it the reservation leaks: in a prioritised pass it
    // is sized for the areas admission needs, but the walk would hand the
    // room to whatever came next in the list, and a certification area taken
    // there can push a major preparation block into the following term. That
    // is the exact thing a prioritised pass exists to prevent.
    const fillGeUpTo = (ceiling: number, onlyReserved = false) => {
      for (let i = 0; i < pendingGe.length; ) {
        const eligible = !onlyReserved || reserved.has(pendingGe[i]);
        if (eligible && total(items) + pendingGe[i].units <= ceiling) {
          items.push(pendingGe[i]);
          pendingGe.splice(i, 1);
        } else {
          i++;
        }
      }
    };

    const closeTerm = () => {
      terms.push({
        ref,
        label: termLabel(ref),
        items,
        courses: items.filter((i) => i.kind === 'course').map((i) => i.course),
        units: total(items),
        sequenced,
      });
      ref = nextTerm(ref, includeSummer);
      items = [];
      sequenced = [];
    };

    // Advance past a term without recording it. Used when a course is too big
    // for a short summer but fits a normal term: the right answer is to take
    // it in the Fall, not to blow through the summer cap or to print an empty
    // summer nobody asked about.
    const skipTerm = () => {
      ref = nextTerm(ref, includeSummer);
    };

    // Every term aims for the same mix as the whole plan. Filling major
    // preparation first and letting general education take the leftovers puts
    // all of it at the end, which is not how anybody actually enrols: a student
    // with 22 units of major preparation and 31 of general education does not
    // spend two years on one and then two on the other.
    const majorUnits = queue.reduce((sum, block) => sum + total(block), 0);
    const reservedUnits = total(reserveFor);
    const geShare =
      majorUnits + reservedUnits > 0 ? reservedUnits / (majorUnits + reservedUnits) : 0;

    let next = 0;
    let guard = 0;
    // Bounded so an item larger than a whole term cannot spin forever. Such an
    // item is placed alone in its own term instead.
    const limit = (queue.length + order.length) * 4 + 16;

    while ((next < queue.length || pendingGe.length > 0) && guard++ < limit) {
      const budget = budgetFor(ref);

      // General education goes in first, up to its share of the term. It is the
      // half with no sequences to respect, so it is the half that can be moved,
      // and taking its share up front is what stops it being squeezed to the
      // end.
      fillGeUpTo(Math.round(budget * geShare), true);

      // Then major preparation, which owns the rest of the term.
      while (next < queue.length) {
        const block = queue[next];
        const clashes = block.some((course) => {
          const key = sequenceKey(course.code);
          return (
            key !== null &&
            (placed.get(key.stem) ?? []).some((p) => p.term === terms.length && p.step !== key.step)
          );
        });
        if (clashes || total(items) + total(block) > budget) break;

        for (const course of block) {
          const key = sequenceKey(course.code);
          if (key) {
            placed.set(key.stem, [
              ...(placed.get(key.stem) ?? []),
              { step: key.step, term: terms.length },
            ]);
            sequenced.push(course.code);
          }
          items.push({ kind: 'course', units: course.units, course, priority: 'major' });
        }
        next++;
      }

      // Then anything else that fits, so a term is not left part empty because
      // the reservation was a round number.
      fillGeUpTo(budget);

      if (items.length === 0) {
        // Nothing fitted an empty term. Either this is a short summer and the
        // next thing belongs after it, or one item is larger than any term and
        // goes in alone: an honest oversized term beats a silent omission.
        const upNext = next < queue.length ? total(queue[next]) : (pendingGe[0]?.units ?? 0);
        if (upNext <= unitsPerTerm) {
          skipTerm();
          continue;
        }
        if (next < queue.length && total(queue[next]) > unitsPerTerm) {
          for (const course of queue[next]) {
            items.push({ kind: 'course', units: course.units, course, priority: 'major' });
          }
          next++;
        } else if (pendingGe.length > 0) {
          items.push(pendingGe.shift()!);
        }
      }

      closeTerm();
    }

    // Only a term that actually held something back deserves the caveat. A
    // course whose stem has just one step in the whole plan was never split, so
    // saying so would be noise.
    for (const term of terms) {
      term.sequenced = term.sequenced.filter((code) => {
        const key = sequenceKey(code);
        if (!key) return false;
        const steps = new Set(
          queue
            .flat()
            .map((c) => sequenceKey(c.code))
            .filter((k): k is SequenceKey => k !== null && k.stem === key.stem)
            .map((k) => k.step),
        );
        return steps.size > 1;
      });
    }

    return terms;
  };

  // Everything except the part of a general education pattern that only
  // certification needs. This is what a target has to make room for.
  const essential = (item: ScheduleItem) => item.priority !== 'certification';

  const lateItems = (terms: ScheduledTerm[]): ScheduleItem[] =>
    target === null
      ? []
      : terms.filter((t) => termIndex(t.ref) > termIndex(target)).flatMap((t) => t.items);

  const lateEssentialUnits = (terms: ScheduledTerm[]) =>
    total(lateItems(terms).filter(essential));

  let terms = pack(generalEducation, generalEducation);
  let reordered = false;

  // The second pass, and the only reason any of this is two passes.
  //
  // A student who names a term they want to transfer by, and whose plan does
  // not fit in it, has been told until now that the plan runs long and given
  // three ways to shorten it. That is the wrong answer when the thing running
  // long is a general education pattern neither system requires before
  // transferring. The right answer is to put what admission turns on inside
  // the terms they have, and say plainly what is left over.
  //
  // Only taken when it demonstrably helps: if moving certification back does
  // not put more of the essential work inside the target, the first pass is
  // kept, because its even mix is the better plan whenever both are on time.
  if (target !== null && lateEssentialUnits(terms) > 0) {
    const canWait = generalEducation.filter((i) => !essential(i));
    if (canWait.length > 0) {
      const cannot = generalEducation.filter(essential);
      const attempt = pack([...cannot, ...canWait], cannot);
      if (lateEssentialUnits(attempt) < lateEssentialUnits(terms)) {
        terms = attempt;
        reordered = true;
      }
    }
  }

  const readyAfter = terms.length > 0 ? terms[terms.length - 1].ref : null;
  const afterTarget = lateItems(terms);
  const overflow = total(afterTarget);
  const lastEssential = terms.filter((t) => t.items.some(essential)).pop();

  return {
    terms,
    totalUnits: terms.reduce((sum, t) => sum + t.units, 0),
    readyAfter,
    readyToTransfer: lastEssential?.ref ?? null,
    meetsTarget: target ? overflow === 0 : null,
    overflowUnits: overflow,
    transferByTarget: target ? afterTarget.every((i) => !essential(i)) : null,
    afterTarget,
    reordered,
  };
}
