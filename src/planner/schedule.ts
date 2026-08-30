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

export type ScheduledTerm = {
  ref: TermRef;
  label: string;
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

// Two courses look like parts of one sequence when they share a prefix and a
// numeric stem and differ only in what trails it: MATH 005A and MATH 005B,
// CS 003A and CS 003B. This is a reading of how California colleges number
// courses, not something any agreement states, so it only ever spreads a
// sequence across terms and never claims an order is required.
const STEM = /^([A-Z&\s]+?)\s*(\d+)([A-Z]*)$/i;

export function sequenceStem(code: string): string | null {
  const match = STEM.exec(code.trim());
  if (!match) return null;
  const [, prefix, digits, suffix] = match;
  return suffix ? `${prefix.trim().toUpperCase()} ${digits}` : null;
}

const total = (courses: Course[]) => courses.reduce((sum, c) => sum + c.units, 0);

export type ScheduleOptions = {
  start: TermRef;
  unitsPerTerm: number;
  includeSummer: boolean;
  summerUnits?: number;
  target?: TermRef | null;
};

export function buildSchedule(groups: AndGroup[], options: ScheduleOptions): Schedule {
  const { start, unitsPerTerm, includeSummer, target = null } = options;
  // Summer terms are short. Half a normal load, at least one course's worth,
  // unless the caller states otherwise.
  const summerUnits = options.summerUnits ?? Math.max(3, Math.round(unitsPerTerm / 2));

  const budgetFor = (ref: TermRef) => (ref.kind === 'Summer' ? summerUnits : unitsPerTerm);

  const terms: ScheduledTerm[] = [];
  let ref = start;
  let courses: Course[] = [];
  let sequenced: string[] = [];
  // Stems already placed, and the term index they were placed in, so a later
  // part of a sequence never lands in the same term as an earlier one.
  const placedStems = new Map<string, number>();

  const closeTerm = () => {
    terms.push({ ref, label: termLabel(ref), courses, units: total(courses), sequenced });
    ref = nextTerm(ref, includeSummer);
    courses = [];
    sequenced = [];
  };

  // Advance past a term without recording it. Used when a course is too big
  // for a short summer but fits a normal term: the right answer is to take
  // it in the Fall, not to blow through the summer cap or to print an empty
  // summer nobody asked about.
  const skipTerm = () => {
    ref = nextTerm(ref, includeSummer);
  };

  // Flattened deliberately: a requirement's courses are kept adjacent, so
  // they land in one term whenever they fit, but a four-course requirement
  // is not forced past a term boundary as a block.
  const queue = groups.flatMap((g) => g.courses);

  // Bounded so a course larger than a whole term's budget cannot spin
  // forever. Such a course is placed alone in its own term instead.
  let guard = 0;
  const limit = queue.length * 4 + 8;

  for (const course of queue) {
    while (guard++ < limit) {
      const stem = sequenceStem(course.code);
      const clashes = stem !== null && placedStems.get(stem) === terms.length;
      const fits = total(courses) + course.units <= budgetFor(ref);

      if (courses.length > 0 && (clashes || !fits)) {
        closeTerm();
        continue;
      }

      // The term is empty and the course still does not fit. If it would fit
      // a normal term, this is a short summer and the course belongs after
      // it. If it fits nowhere, it goes here alone rather than never being
      // scheduled at all: an honest oversized term beats a silent omission.
      if (courses.length === 0 && !fits && course.units <= unitsPerTerm) {
        skipTerm();
        continue;
      }

      if (stem) placedStems.set(stem, terms.length);
      courses.push(course);
      if (stem) sequenced.push(course.code);
      break;
    }
  }

  if (courses.length > 0) closeTerm();

  // A term whose only note is that one course happened to have a stem is not
  // worth a caveat; only a term that actually held something back is.
  for (const term of terms) {
    term.sequenced = term.sequenced.filter((code) => {
      const stem = sequenceStem(code);
      return stem !== null && queue.filter((c) => sequenceStem(c.code) === stem).length > 1;
    });
  }

  const readyAfter = terms.length > 0 ? terms[terms.length - 1].ref : null;
  const overflow = target
    ? terms.filter((t) => termIndex(t.ref) > termIndex(target)).reduce((sum, t) => sum + t.units, 0)
    : 0;

  return {
    terms,
    totalUnits: terms.reduce((sum, t) => sum + t.units, 0),
    readyAfter,
    meetsTarget: target ? overflow === 0 : null,
    overflowUnits: overflow,
  };
}
