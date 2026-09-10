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

export type TermKind = 'Fall' | 'Winter' | 'Spring' | 'Summer';

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
  // What this term was allowed to hold. A winter intersession and a summer
  // session are shorter than a semester, so "over a normal load" has to be
  // asked against the term's own ceiling and not against the student's chosen
  // one. Carried here so nothing downstream has to recompute it.
  budget: number;
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
  // The first term a student could actually start at the university: the term
  // after the last one holding work admission turns on. Distinct from
  // readyToTransfer, which is when the work finishes; a plan whose minimum
  // ends in Fall 2028 does not get the student to a Fall 2028 start, and
  // saying "not ready until Fall 2028" against a Fall 2028 target reads as a
  // contradiction rather than as an answer. Null when nothing is left.
  earliestTransfer: TermRef | null;
  // The last term holding work that has to be done before transferring, as
  // against readyAfter, which is the last term holding any work at all. When
  // a target cannot be met this is the number that helps: it says how far the
  // target would have to move, rather than how long the whole pattern takes.
  // Null when nothing essential is left to schedule.
  readyToTransfer: TermRef | null;
  // Whether everything the campus itself gates admission on fits in the terms
  // before the target. This is the question a student short of time is
  // actually asking, and it is a different question from meetsTarget: a plan
  // can miss the target on units and still get the student admitted on time,
  // with the rest of a general education pattern finished afterwards, or with
  // major preparation the agreement lists but does not require.
  //
  // Deliberately narrower than it once was. It used to turn on the whole
  // agreement, which meant one unmarked recommended course could produce the
  // flat sentence "you cannot be ready to transfer", for a student who could.
  // Null when there is no target.
  transferByTarget: boolean | null;
  // What is scheduled after the target, in the order it falls. Empty when
  // there is no target or when everything fits.
  afterTarget: ScheduleItem[];
  // The part of afterTarget that is major preparation the agreement does not
  // mark as required for admission. Not a reason to call a plan late, and not
  // something to leave unsaid either: it is what a campus screens on, so the
  // verdict names it rather than folding it into a unit count.
  majorAfterTarget: ScheduleItem[];
  // Whether the order was changed to protect the target: general education
  // that certification needs but admission does not was moved behind the work
  // that cannot move. False when nothing needed moving, or when moving it
  // would not have helped.
  reordered: boolean;
};

// Calendar order inside one year. Winter comes first because a winter
// intersession runs in January, before the Spring semester it precedes.
const ORDER: TermKind[] = ['Winter', 'Spring', 'Summer', 'Fall'];

export const termLabel = (ref: TermRef): string => `${ref.kind} ${ref.year}`;

// Ordinal position of a term on a single timeline, so two terms can be
// compared without special-casing the year rollover. Four slots to the year,
// not three, since winter joined them; only the ordering matters, and nothing
// outside this file should depend on the number itself.
export const termIndex = (ref: TermRef): number => ref.year * 4 + ORDER.indexOf(ref.kind);

// The next term on the calendar, skipping the short ones a student has not
// opted into. `includeWinter` is last and defaults to off so a caller that
// predates winter keeps the sequence it had.
export function nextTerm(ref: TermRef, includeSummer: boolean, includeWinter = false): TermRef {
  if (ref.kind === 'Fall')
    return includeWinter
      ? { kind: 'Winter', year: ref.year + 1 }
      : { kind: 'Spring', year: ref.year + 1 };
  if (ref.kind === 'Winter') return { kind: 'Spring', year: ref.year };
  if (ref.kind === 'Spring')
    return includeSummer ? { kind: 'Summer', year: ref.year } : { kind: 'Fall', year: ref.year };
  return { kind: 'Fall', year: ref.year };
}

// The term a student is most likely to be planning from, given today: the next
// one they can still enrol in, not the one already under way.
//
// The boundaries are the terms' own start dates, roughly. A California
// community college opens Spring in mid-January and Fall at the end of August,
// so by March a Spring term is half over and by late September a Fall one is.
// Never a Winter or a Summer: those are short sessions layered onto a plan, not
// the term a student describes themselves as starting in.
export function currentTerm(now = new Date()): TermRef {
  const month = now.getMonth();
  const year = now.getFullYear();
  if (month <= 1) return { kind: 'Spring', year };
  if (month <= 7) return { kind: 'Fall', year };
  return { kind: 'Spring', year: year + 1 };
}

// The earliest term worth offering at all, counting the short sessions.
//
// Separate from currentTerm because they answer different questions.
// currentTerm picks a default, and a default has to be a term every California
// community college actually runs, which a winter intersession is not. This
// picks the floor of the list, and the floor has to reach back far enough that
// nothing a student might legitimately choose is missing from it: in September,
// currentTerm is next Spring, and a list starting there would have no way to
// say "I am starting in the winter intersession before it".
//
// Typical start dates: a winter intersession opens in the first days of
// January, Spring in the middle of that month, Summer in mid-June, Fall at the
// end of August.
export function earliestTerm(now = new Date()): TermRef {
  const month = now.getMonth();
  const year = now.getFullYear();
  // Never later than currentTerm, or the default would not be in its own list.
  // That is what the January and February cases are doing: a winter
  // intersession has already opened by then, so the earliest term still worth
  // offering is the Spring the default has already picked.
  if (month <= 1) return { kind: 'Spring', year };
  if (month <= 4) return { kind: 'Summer', year };
  if (month <= 7) return { kind: 'Fall', year };
  return { kind: 'Winter', year: year + 1 };
}

// Where a course sits in its subject's own order: CS 002 before CS 003A before
// CS 003B before CS 033.
//
// No articulation agreement carries prerequisites, so this is read from how
// California colleges number their courses and from nothing else. Within one
// subject a lower number comes first, and within one number a lower sequence
// letter comes first. That is a convention rather than a rule, which is why
// the route says in as many words where the ordering came from.
//
// Two suffix letters are not sequence steps and must be stripped first, or
// this does real damage:
//
//   L  a lab. CS 003BL is the lab for CS 003B, taken WITH it, so reading the
//      L as a later step splits a lecture from its own lab and tells a
//      student to take them a term apart.
//   H  an honours section. MATH 010H is MATH 010, not a second part of it.
const STEM = /^([A-Z&\s]+?)\s*(\d+)([A-Z]*)$/i;

// `subject` is the alpha prefix, `number` the numeric part, `step` the
// sequence letter or '' when there is none. Two courses may share a term only
// when all three match, which is exactly the lecture-and-its-lab case.
export type CourseOrder = { subject: string; number: number; step: string };

export function courseOrder(code: string): CourseOrder | null {
  const match = STEM.exec(code.trim());
  if (!match) return null;
  const [, prefix, digits, rawSuffix] = match;

  return {
    subject: prefix.trim().toUpperCase(),
    number: Number(digits),
    step: rawSuffix.toUpperCase().replace(/[LH]+$/, ''),
  };
}

// Ascending within a subject. Only meaningful between two courses that share
// one, which every caller checks first.
export const compareOrder = (a: CourseOrder, b: CourseOrder): number =>
  a.number - b.number || a.step.localeCompare(b.step);

// Whether two courses in the same subject are the same rung of it, and so may
// share a term. A lecture and its lab are; anything else is not.
const sameRung = (a: CourseOrder, b: CourseOrder): boolean =>
  a.number === b.number && a.step === b.step;



const total = (items: { units: number }[]) => items.reduce((sum, i) => sum + i.units, 0);

// One unit of scheduling: a course, or a course and the lab that has to sit
// beside it, carrying the priority of the requirement it came from.
type Block = {
  courses: Course[];
  priority: Priority;
  // Which requirement this came from. Two blocks of the same requirement are
  // the reason a term can be refused: see the clash rule in pack().
  group: number;
};

// What this schedules. `priority` is optional so a caller that has not yet
// made the distinction, including every hand-built group in the tests, keeps
// the old reading where all of it is a minimum.
export type PlannedGroup = AndGroup & { priority?: Priority };

export type ScheduleOptions = {
  start: TermRef;
  unitsPerTerm: number;
  includeSummer: boolean;
  summerUnits?: number;
  // Whether to use the winter intersession between Fall and Spring. Off by
  // default: not every college runs one, and a plan that quietly assumes a
  // term a student cannot enrol in is worse than one that runs a term long.
  includeWinter?: boolean;
  winterUnits?: number;
  target?: TermRef | null;
};

export function buildSchedule(
  groups: PlannedGroup[],
  options: ScheduleOptions,
  // General education still to be scheduled, in the order it should be taken.
  // Spread across the terms in proportion to how much of the whole plan it
  // is, rather than filling the gaps major preparation leaves.
  generalEducation: ScheduleItem[] = [],
): Schedule {
  const { start, unitsPerTerm, includeSummer, includeWinter = false, target = null } = options;
  // Summer terms are short. Half a normal load, at least one course's worth,
  // unless the caller states otherwise.
  const summerUnits = options.summerUnits ?? Math.max(3, Math.round(unitsPerTerm / 2));
  // A winter intersession is shorter still: five or six weeks against a
  // summer's eight. In practice it holds exactly one course, so it is budgeted
  // as one course rather than as a fraction of a load. Five units admits the
  // largest single course a student normally meets, a five-unit calculus, and
  // refuses any two together, which is the behaviour wanted.
  //
  // A fraction would have been wrong in a way that hid itself: a quarter of a
  // twelve-unit load is three units, and a three-unit ceiling silently rejects
  // every four- and five-unit course, so winter would appear to be on and then
  // never take a STEM course.
  const winterUnits = options.winterUnits ?? Math.min(5, Math.max(3, unitsPerTerm));

  const budgetFor = (ref: TermRef) => {
    if (ref.kind === 'Summer') return summerUnits;
    if (ref.kind === 'Winter') return winterUnits;
    return unitsPerTerm;
  };

  // A course and the lab belonging to it are one thing to schedule. They
  // share a sequence key, so they go into a block and are placed together or
  // not at all: a term with the lecture and not its lab is not a term anybody
  // can enrol in. Everything else is its own block, so a four-course
  // requirement is still allowed to straddle a term boundary.
  //
  // Blocks rather than adjacency because the two are not always neighbours:
  // one real requirement lists CS 003B, CS 033, CS 003BL in that order, and a
  // run of adjacent courses would not catch it.
  const queue = groups.flatMap((group, groupIndex) => {
    // A group with no stated priority is a minimum. Hand-built groups in
    // tests and any caller predating the distinction keep the old behaviour,
    // where every requirement gated the target.
    const priority: Priority = group.priority ?? 'admission';
    const blocks: Block[] = [];
    const byKey = new Map<string, Block>();

    for (const course of group.courses) {
      const order = courseOrder(course.code);
      // A code this cannot parse is its own block. Nothing is ordered against
      // it, which is the safe reading of a code the convention does not cover.
      const id = order ? `${order.subject}|${order.number}|${order.step}` : null;
      if (id === null) {
        blocks.push({ courses: [course], priority, group: groupIndex });
        continue;
      }
      const existing = byKey.get(id);
      if (existing) {
        existing.courses.push(course);
        continue;
      }
      const block: Block = { courses: [course], priority, group: groupIndex };
      byKey.set(id, block);
      blocks.push(block);
    }

    return blocks;
  });

  // Put each subject's blocks into its own ascending order, in place.
  //
  // In place, rather than sorting the whole queue, because the order the
  // agreement lists its requirements in is meaningful and this has no business
  // rewriting it. Only the slots a subject already occupies are rewritten, so
  // CS blocks land in CS slots and every other requirement stays where the
  // agreement put it.
  //
  // Without this the packer places blocks in document order, and the real UCI
  // agreement lists CS 003A, CS 002, CS 003AL as one requirement, which put
  // CS 002 in the same term as the course it is a prerequisite for.
  const bySubject = new Map<string, number[]>();
  queue.forEach((block, i) => {
    const order = courseOrder(block.courses[0].code);
    if (!order) return;
    bySubject.set(order.subject, [...(bySubject.get(order.subject) ?? []), i]);
  });
  for (const slots of bySubject.values()) {
    if (slots.length < 2) continue;
    const sorted = slots
      .map((i) => queue[i])
      .sort((a, b) => compareOrder(courseOrder(a.courses[0].code)!, courseOrder(b.courses[0].code)!));
    slots.forEach((slot, k) => {
      queue[slot] = sorted[k];
    });
  }

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
    // For each subject, which rung of it was placed in which term. A course
    // clashes only with a DIFFERENT rung of the same subject in the same term,
    // so a lecture and its lab still sit together.
    const placed = new Map<string, { order: CourseOrder; term: number; group: number }[]>();

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
        budget: budgetFor(ref),
        sequenced,
      });
      ref = nextTerm(ref, includeSummer, includeWinter);
      items = [];
      sequenced = [];
    };

    // Advance past a term without recording it. Used when a course is too big
    // for a short summer but fits a normal term: the right answer is to take
    // it in the Fall, not to blow through the summer cap or to print an empty
    // summer nobody asked about.
    const skipTerm = () => {
      ref = nextTerm(ref, includeSummer, includeWinter);
    };

    // Every term aims for the same mix as the whole plan. Filling major
    // preparation first and letting general education take the leftovers puts
    // all of it at the end, which is not how anybody actually enrols: a student
    // with 22 units of major preparation and 31 of general education does not
    // spend two years on one and then two on the other.
    const majorUnits = queue.reduce((sum, block) => sum + total(block.courses), 0);
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
        const block = queue[next].courses;
        // Two readings of the same evidence, and a course clashes with anything
        // already in this term that either one catches.
        //
        // The first is the numbering itself: MATH 005A and MATH 005B are two
        // parts of one course and the second follows the first, wherever the
        // agreement happens to list them. Same number, different letter.
        //
        // The second is ASSIST's own grouping. Listing CS 003A, CS 002 and
        // CS 003AL as ONE requirement is the campus saying those courses go
        // together, and courses that go together in one subject at one college
        // are a chain: CS 002 is the prerequisite for CS 003A. So a different
        // rung of the same requirement is a different term, lowest first.
        //
        // What is deliberately NOT read is a pair of different numbers in
        // different requirements. Most such pairs are siblings rather than a
        // chain, and treating them as one stretched twenty-two units of real
        // work across four terms of four to eight units each: a full-time
        // student told they needed two years for one year of work. The cost of
        // that reading is a plan the student cannot act on, which is worse than
        // the gap it closes. The gap is stated on the route instead.
        const clashes = block.some((course) => {
          const order = courseOrder(course.code);
          if (order === null) return false;
          return (placed.get(order.subject) ?? []).some((p) => {
            if (p.term !== terms.length) return false;
            if (sameRung(p.order, order)) return false;
            return p.order.number === order.number || p.group === queue[next].group;
          });
        });
        if (clashes || total(items) + total(block) > budget) break;

        for (const course of block) {
          const order = courseOrder(course.code);
          if (order) {
            placed.set(order.subject, [
              ...(placed.get(order.subject) ?? []),
              { order, term: terms.length, group: queue[next].group },
            ]);
            sequenced.push(course.code);
          }
          items.push({ kind: 'course', units: course.units, course, priority: queue[next].priority });
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
        const upNext =
          next < queue.length ? total(queue[next].courses) : (pendingGe[0]?.units ?? 0);
        if (upNext <= unitsPerTerm) {
          skipTerm();
          continue;
        }
        if (next < queue.length && total(queue[next].courses) > unitsPerTerm) {
          for (const course of queue[next].courses) {
            items.push({ kind: 'course', units: course.units, course, priority: queue[next].priority });
          }
          next++;
        } else if (pendingGe.length > 0) {
          items.push(pendingGe.shift()!);
        }
      }

      closeTerm();
    }

    // Only a course that actually has something waiting behind it deserves the
    // caveat, since the caveat says the rest sits in later terms. A course in
    // the last term of its own subject was ordered against nothing that
    // follows, so naming it there is noise, and on the final term it is a note
    // that contradicts itself.
    const later = (termIdx: number, order: CourseOrder) =>
      terms.slice(termIdx + 1).some((t) =>
        t.courses.some((c) => {
          const other = courseOrder(c.code);
          return other !== null && other.subject === order.subject && compareOrder(order, other) < 0;
        }),
      );

    terms.forEach((term, i) => {
      term.sequenced = term.sequenced.filter((code) => {
        const order = courseOrder(code);
        return order !== null && later(i, order);
      });
    });

    return terms;
  };

  // Everything except the part of a general education pattern that only
  // certification needs. This is what the ordering pass tries to protect: a
  // student wants their major preparation inside the terms they have, marked
  // a minimum or not.
  const essential = (item: ScheduleItem) => item.priority !== 'certification';

  // The narrower question, and the only one a yes-or-no verdict may turn on:
  // what the campus itself says an application is refused without. Major
  // preparation the agreement lists but does not mark is not that, and
  // failing a student's whole timeline on it is how this told a student on an
  // ordinary two-year plan they could not transfer at all.
  const gating = (item: ScheduleItem) => item.priority === 'admission';

  // Terms at or after the target are not terms a student can enrol in. You
  // transfer IN the target term, so the last usable one is the term before
  // it: the Spring before a Fall start, or the Summer between where the
  // student takes one.
  const lateItems = (terms: ScheduledTerm[]): ScheduleItem[] =>
    target === null
      ? []
      : terms.filter((t) => termIndex(t.ref) >= termIndex(target)).flatMap((t) => t.items);

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
  const lastGating = terms.filter((t) => t.items.some(gating)).pop();

  return {
    terms,
    totalUnits: terms.reduce((sum, t) => sum + t.units, 0),
    readyAfter,
    readyToTransfer: lastGating?.ref ?? null,
    earliestTransfer: lastGating ? nextTerm(lastGating.ref, includeSummer, includeWinter) : null,
    meetsTarget: target ? overflow === 0 : null,
    overflowUnits: overflow,
    transferByTarget: target ? afterTarget.every((i) => !gating(i)) : null,
    afterTarget,
    majorAfterTarget: afterTarget.filter((i) => i.priority === 'major'),
    reordered,
  };
}
