import { describe, it, expect } from 'vitest';
import {
  buildSchedule,
  currentTerm,
  earliestTerm,
  nextTerm,
  compareOrder,
  courseOrder,
  termIndex,
  termLabel,
  type Priority,
} from '../../src/planner/schedule';
import type { AndGroup } from '../../src/parser/groups';
import { canonicalCourseKey } from '../../src/catalog/normalize';
import type { CoursePrereqs, PrereqIndex } from '../../src/catalog/types';

// Keyed the way the app keys it: by canonical code, with no spaces, so the
// fixture cannot pass on a spelling the real index would not have.
const index = (
  entries: [string, Partial<Omit<CoursePrereqs, 'code'>>][],
): PrereqIndex =>
  new Map(
    entries.map(([code, rest]) => [
      canonicalCourseKey(code),
      {
        code,
        prerequisites: [],
        corequisites: [],
        recommended: [],
        formerly: [],
        placementAlternative: false,
        ...rest,
      },
    ]),
  );

const course = (code: string, units: number) => ({ code, title: code, units });
const group = (...courses: { code: string; title: string; units: number }[]): AndGroup => ({
  kind: 'and',
  courses,
});

const FALL_26 = { kind: 'Fall' as const, year: 2026 };

const base = { start: FALL_26, unitsPerTerm: 15, includeSummer: false };

const area = (id: string, units: number, priority: Priority = 'certification') => ({
  kind: 'area' as const,
  units,
  areaId: id,
  label: `Area ${id}`,
  pattern: 'Cal-GETC',
  priority,
});

describe('term arithmetic', () => {
  it('runs Fall into the next calendar year', () => {
    expect(nextTerm({ kind: 'Fall', year: 2026 }, false)).toEqual({ kind: 'Spring', year: 2027 });
    expect(nextTerm({ kind: 'Spring', year: 2027 }, false)).toEqual({ kind: 'Fall', year: 2027 });
  });

  it('slots summer between Spring and Fall only when asked', () => {
    expect(nextTerm({ kind: 'Spring', year: 2027 }, true)).toEqual({ kind: 'Summer', year: 2027 });
    expect(nextTerm({ kind: 'Summer', year: 2027 }, true)).toEqual({ kind: 'Fall', year: 2027 });
  });

  it('orders terms across a year boundary', () => {
    expect(termIndex({ kind: 'Fall', year: 2026 })).toBeLessThan(termIndex({ kind: 'Spring', year: 2027 }));
    expect(termIndex({ kind: 'Spring', year: 2027 })).toBeLessThan(termIndex({ kind: 'Fall', year: 2027 }));
  });

  it('offers the next term a student can still enrol in', () => {
    expect(currentTerm(new Date('2026-02-10'))).toEqual({ kind: 'Spring', year: 2026 });
    expect(currentTerm(new Date('2026-08-29'))).toEqual({ kind: 'Fall', year: 2026 });
    expect(currentTerm(new Date('2026-11-02'))).toEqual({ kind: 'Spring', year: 2027 });
  });

  it('names a term the way a college does', () => {
    expect(termLabel({ kind: 'Fall', year: 2026 })).toBe('Fall 2026');
  });
});

describe('courseOrder', () => {
  it('reads a subject, a number and a sequence letter', () => {
    expect(courseOrder('MATH 005A')).toEqual({ subject: 'MATH', number: 5, step: 'A' });
    expect(courseOrder('I&C SCI 6B')).toEqual({ subject: 'I&C SCI', number: 6, step: 'B' });
  });

  it('reads a course with no sequence letter, which is most of them', () => {
    // The gap this closes. A bare number used to have no key at all, so CS 002
    // was ordered against nothing and could land in the same term as CS 003A,
    // the course it is a prerequisite for at Pasadena City College.
    expect(courseOrder('CS 002')).toEqual({ subject: 'CS', number: 2, step: '' });
    expect(courseOrder('CS 033')).toEqual({ subject: 'CS', number: 33, step: '' });
  });

  it('ignores the padding, so CS 2 and CS 002 are one course', () => {
    expect(courseOrder('CS 2')).toEqual(courseOrder('CS 002'));
  });

  it('treats a lab as the same rung as its lecture, not a later one', () => {
    expect(courseOrder('CS 003BL')).toEqual(courseOrder('CS 003B'));
  });

  it('treats an honours section as the same course', () => {
    expect(courseOrder('MATH 010H')).toEqual(courseOrder('MATH 010'));
  });

  it('orders by number first, then by sequence letter', () => {
    const codes = ['CS 033', 'CS 003B', 'CS 002', 'CS 008', 'CS 003A'];
    const sorted = [...codes].sort((a, b) => compareOrder(courseOrder(a)!, courseOrder(b)!));
    expect(sorted).toEqual(['CS 002', 'CS 003A', 'CS 003B', 'CS 008', 'CS 033']);
  });
});

describe('buildSchedule', () => {
  it('fills a term to its cap and then opens the next one', () => {
    const schedule = buildSchedule(
      [group(course('AAA 1', 8)), group(course('BBB 2', 8)), group(course('CCC 3', 4))],
      base,
    );

    expect(schedule.terms.map((t) => t.label)).toEqual(['Fall 2026', 'Spring 2027']);
    expect(schedule.terms[0].courses.map((c) => c.code)).toEqual(['AAA 1']);
    expect(schedule.terms[1].courses.map((c) => c.code)).toEqual(['BBB 2', 'CCC 3']);
    expect(schedule.totalUnits).toBe(20);
  });

  it('keeps one requirement together when it fits', () => {
    const schedule = buildSchedule(
      [group(course('AAA 1', 3), course('AAA 1L', 1), course('BBB 2', 3))],
      base,
    );

    expect(schedule.terms).toHaveLength(1);
    expect(schedule.terms[0].courses.map((c) => c.code)).toEqual(['AAA 1', 'AAA 1L', 'BBB 2']);
  });

  it('never puts two parts of one numbered sequence in the same term', () => {
    const schedule = buildSchedule([group(course('MATH 005A', 5), course('MATH 005B', 5))], base);

    expect(schedule.terms).toHaveLength(2);
    expect(schedule.terms[0].courses.map((c) => c.code)).toEqual(['MATH 005A']);
    expect(schedule.terms[1].courses.map((c) => c.code)).toEqual(['MATH 005B']);
    expect(schedule.terms[0].sequenced).toEqual(['MATH 005A']);
  });

  it('keeps a lecture and its own lab in the same term', () => {
    // The bug this exists to prevent: reading the L in CS 003BL as a later
    // sequence step and telling a student to take the lab a term after the
    // lecture it belongs to.
    const schedule = buildSchedule(
      [group(course('CS 003B', 3), course('CS 033', 3), course('CS 003BL', 1))],
      base,
    );

    // The lab sits next to the lecture it belongs to rather than in the order
    // the requirement listed them, because the two are scheduled as one block.
    expect(schedule.terms[0].courses.map((c) => c.code)).toEqual(['CS 003B', 'CS 003BL']);

    // CS 033 is a later rung of the same requirement, so it moves on. That is
    // the prerequisite rule, not the lab rule: what matters here is that it
    // did not take the lab with it.
    expect(schedule.terms[1].courses.map((c) => c.code)).toEqual(['CS 033']);
  });

  it('does not flag a course whose stem it never had to split', () => {
    const schedule = buildSchedule([group(course('MATH 005A', 5), course('BIO 010', 4))], base);
    expect(schedule.terms[0].sequenced).toEqual([]);
  });

  it('separates real sequence steps even across different requirements', () => {
    const schedule = buildSchedule(
      [group(course('CS 003A', 3), course('CS 003AL', 1)), group(course('CS 003B', 3))],
      base,
    );

    expect(schedule.terms).toHaveLength(2);
    expect(schedule.terms[0].courses.map((c) => c.code)).toEqual(['CS 003A', 'CS 003AL']);
    expect(schedule.terms[1].courses.map((c) => c.code)).toEqual(['CS 003B']);
  });

  it('gives summer a smaller load than a full term', () => {
    const schedule = buildSchedule(
      [group(course('AAA 1', 12)), group(course('BBB 2', 4)), group(course('CCC 3', 4))],
      { start: { kind: 'Spring', year: 2027 }, unitsPerTerm: 12, includeSummer: true },
    );

    expect(schedule.terms.map((t) => `${t.label}:${t.units}`)).toEqual([
      'Spring 2027:12',
      'Summer 2027:4',
      'Fall 2027:4',
    ]);
  });

  it('skips summer for a course too big for it rather than overloading it', () => {
    const schedule = buildSchedule([group(course('AAA 1', 12)), group(course('BBB 2', 10))], {
      start: { kind: 'Spring', year: 2027 },
      unitsPerTerm: 12,
      includeSummer: true,
    });

    // No empty Summer term is printed, and the 10-unit course waits for a
    // full-length term instead of blowing through the summer cap.
    expect(schedule.terms.map((t) => t.label)).toEqual(['Spring 2027', 'Fall 2027']);
    expect(schedule.terms[1].units).toBe(10);
  });

  it('places a course larger than a whole term alone rather than looping', () => {
    const schedule = buildSchedule([group(course('BIG 1', 40)), group(course('AAA 2', 3))], base);

    expect(schedule.terms[0].courses.map((c) => c.code)).toEqual(['BIG 1']);
    expect(schedule.terms[1].courses.map((c) => c.code)).toEqual(['AAA 2']);
  });

  it('says plainly when the work does not fit before the target term', () => {
    const schedule = buildSchedule(
      [group(course('AAA 1', 15)), group(course('BBB 2', 15)), group(course('CCC 3', 15))],
      { ...base, target: { kind: 'Spring', year: 2027 } },
    );

    // Spring 2027 is the term the student starts at the university, so it is
    // not a term they can take a course at their college in, and neither is
    // any term after it. Only Fall 2026 is drawn; the other thirty units are
    // reported as left out rather than scheduled into terms the student will
    // not be at their college for.
    expect(schedule.terms.map((t) => t.label)).toEqual(['Fall 2026']);
    expect(schedule.meetsTarget).toBe(false);
    expect(schedule.overflowUnits).toBe(30);
    expect(schedule.afterTarget.map((i) => (i.kind === 'course' ? i.course.code : ''))).toEqual([
      'BBB 2',
      'CCC 3',
    ]);
    expect(termLabel(schedule.readyAfter!)).toBe('Fall 2026');
  });

  it('confirms a plan that does fit', () => {
    const schedule = buildSchedule([group(course('AAA 1', 15)), group(course('BBB 2', 15))], {
      ...base,
      target: { kind: 'Fall', year: 2027 },
    });

    expect(schedule.meetsTarget).toBe(true);
    expect(schedule.overflowUnits).toBe(0);
  });

  it('has nothing to say when nothing is left', () => {
    const schedule = buildSchedule([], base);
    expect(schedule.terms).toEqual([]);
    expect(schedule.readyAfter).toBeNull();
    expect(schedule.totalUnits).toBe(0);
  });
});

describe('buildSchedule with general education', () => {
  const kinds = (schedule: ReturnType<typeof buildSchedule>) =>
    schedule.terms.map((t) => t.items.map((i) => (i.kind === 'course' ? 'C' : 'G')).join(''));

  it('puts general education in the first term, not only the last', () => {
    // The bug this exists to prevent: major preparation filling every early
    // term to the brim and general education all landing at the end, which is
    // not how anybody enrols.
    const schedule = buildSchedule(
      [group(course('AAA 1', 6)), group(course('BBB 2', 6)), group(course('CCC 3', 6))],
      base,
      [area('1A', 3), area('1B', 3), area('2', 3), area('3', 3), area('4', 3), area('5', 3)],
    );

    expect(schedule.terms[0].items.some((i) => i.kind === 'area')).toBe(true);
    expect(schedule.terms[0].items.some((i) => i.kind === 'course')).toBe(true);
  });

  it('gives every term roughly the mix of the whole plan', () => {
    // Half major preparation, half general education, so each term should be
    // about half and half rather than all of one then all of the other.
    const schedule = buildSchedule(
      [group(course('AAA 1', 6)), group(course('BBB 2', 6))],
      base,
      [area('1A', 6), area('1B', 6)],
    );

    for (const term of schedule.terms) {
      expect(term.items.filter((i) => i.kind === 'course')).toHaveLength(1);
      expect(term.items.filter((i) => i.kind === 'area')).toHaveLength(1);
    }
  });

  it('does not take more terms than the same work without the mixing', () => {
    const items = [area('1A', 3), area('1B', 3), area('2', 3)];
    const majorOnly = buildSchedule(
      [group(course('AAA 1', 6)), group(course('BBB 2', 6))],
      base,
      [],
    );
    const mixed = buildSchedule([group(course('AAA 1', 6)), group(course('BBB 2', 6))], base, items);

    // 12 units of major preparation plus 9 of general education is 21, which
    // is two terms at 15. Spreading it must not cost a third.
    expect(majorOnly.terms).toHaveLength(1);
    expect(mixed.terms).toHaveLength(2);
    expect(mixed.totalUnits).toBe(21);
  });

  it('schedules general education alone when there is no major preparation left', () => {
    const schedule = buildSchedule([], base, [area('1A', 3), area('1B', 3)]);
    expect(kinds(schedule)).toEqual(['GG']);
    expect(schedule.totalUnits).toBe(6);
  });

  it('counts an area toward the term load and the total', () => {
    const schedule = buildSchedule([group(course('AAA 1', 4))], base, [area('3', 3)]);
    expect(schedule.terms[0].units).toBe(7);
    expect(schedule.terms[0].courses.map((c) => c.code)).toEqual(['AAA 1']);
    expect(schedule.terms[0].items).toHaveLength(2);
  });

  it('still keeps a numbered sequence apart when general education is mixed in', () => {
    const schedule = buildSchedule(
      [group(course('MATH 005A', 5), course('MATH 005B', 5))],
      base,
      [area('1A', 3), area('1B', 3)],
    );

    const termOf = (code: string) =>
      schedule.terms.findIndex((t) => t.courses.some((c) => c.code === code));
    expect(termOf('MATH 005A')).toBeLessThan(termOf('MATH 005B'));
  });

  it('never separates a lecture from its own lab, even under a tight budget', () => {
    // The regression this exists to catch: reserving room for general
    // education squeezed CS 003BL out of the term holding CS 003B, so the
    // plan told a student to take a lab a term after its lecture. The two are
    // not neighbours in the requirement, so adjacency would not have caught
    // it: the real order is CS 003B, CS 033, CS 003BL.
    const schedule = buildSchedule(
      [group(course('CS 003B', 3), course('CS 033', 3), course('CS 003BL', 1))],
      { start: FALL_26, unitsPerTerm: 12, includeSummer: false },
      [
        { kind: 'area' as const, units: 3, areaId: '1A', label: 'Area 1A', pattern: 'Cal-GETC', priority: 'certification' as const },
        { kind: 'area' as const, units: 3, areaId: '1B', label: 'Area 1B', pattern: 'Cal-GETC', priority: 'certification' as const },
      ],
    );

    const termOf = (code: string) =>
      schedule.terms.findIndex((t) => t.courses.some((c) => c.code === code));
    expect(termOf('CS 003B')).toBe(termOf('CS 003BL'));
    expect(termOf('CS 003B')).toBeGreaterThanOrEqual(0);
  });
});


describe('a target that cannot hold everything', () => {
  const FALL_28 = { kind: 'Fall' as const, year: 2028 };
  // Fall 26, Spring 27, Fall 27, Spring 28: four terms at 9 units is 36, so a
  // plan larger than that has to give something up. Fall 28 is the term the
  // student starts at the university and is not one of them.
  const tight = { start: FALL_26, unitsPerTerm: 9, includeSummer: false, target: FALL_28 };

  const majorPrep = [
    group(course('AAA 1', 3)),
    group(course('AAA 2', 3)),
    group(course('BBB 1', 3)),
    group(course('BBB 2', 3)),
    group(course('CCC 1', 3)),
    group(course('CCC 2', 3)),
  ];
  // Six areas, three of them the ones admission turns on, interleaved rather
  // than listed first. Real patterns are like this: Cal-GETC puts Oral
  // Communication between the two composition areas and mathematics, and CSU
  // GE-Breadth buries quantitative reasoning inside a three-course Area B.
  // A pattern that happened to list the critical areas first would front-load
  // them by accident and prove nothing.
  const pattern = [
    area('3', 3, 'certification'),
    area('3b', 3, 'certification'),
    area('4', 3, 'certification'),
    area('4b', 3, 'certification'),
    area('5', 3, 'certification'),
    area('1A', 3, 'admission'),
    area('5b', 3, 'certification'),
    area('6', 3, 'certification'),
    area('6b', 3, 'certification'),
    area('7', 3, 'certification'),
    area('1B', 3, 'admission'),
    area('2', 3, 'admission'),
  ];

  // Nothing is drawn at or past the target any more, so what fell past it is
  // exactly what afterTarget holds. Kept as a helper so the tests read as
  // they did.
  const late = (s: ReturnType<typeof buildSchedule>) => s.afterTarget;

  it('puts everything admission turns on inside the target and the rest after', () => {
    const schedule = buildSchedule(majorPrep, tight, pattern);

    // 18 units of major preparation plus 9 of admission general education is
    // 27, which is three of the four terms at 9. The 27 units of
    // certification behind it do not fit before the target, and do not have
    // to.
    expect(schedule.transferByTarget).toBe(true);
    expect(schedule.meetsTarget).toBe(false);
    expect(late(schedule).every((i) => i.priority === 'certification')).toBe(true);
  });

  it('is the target that rescues it, not the order it was already in', () => {
    // The same work with no term to aim at is scheduled in pattern order, and
    // in pattern order the courses admission turns on land after Fall 2028.
    // This is the whole feature in one comparison: naming a target changes
    // what gets a place, not just what gets a warning.
    // No target, so nothing is cut: the terms run on and the courses admission
    // turns on can be seen landing at or after Fall 2028.
    const unaimed = buildSchedule(majorPrep, { ...tight, target: null }, pattern);
    const pastTarget = unaimed.terms
      .filter((t) => termIndex(t.ref) >= termIndex(FALL_28))
      .flatMap((t) => t.items);
    expect(pastTarget.some((i) => i.priority !== 'certification')).toBe(true);

    const aimed = buildSchedule(majorPrep, tight, pattern);
    expect(aimed.reordered).toBe(true);
    expect(late(aimed).some((i) => i.priority !== 'certification')).toBe(false);
  });

  it('reports what fell past the target rather than only that something did', () => {
    const schedule = buildSchedule(majorPrep, tight, pattern);
    expect(schedule.afterTarget.length).toBeGreaterThan(0);
    expect(schedule.overflowUnits).toBe(
      schedule.afterTarget.reduce((sum, i) => sum + i.units, 0),
    );
    // And none of it is drawn as a term: the last term shown is the one
    // before the target.
    expect(schedule.terms.every((t) => termIndex(t.ref) < termIndex(FALL_28))).toBe(true);
  });

  it('says so plainly when even the minimum does not fit', () => {
    // Three times the major preparation, which is the half that cannot be
    // deferred, so no amount of reordering rescues the target.
    const schedule = buildSchedule(
      [...majorPrep, ...majorPrep, ...majorPrep],
      tight,
      pattern,
    );
    expect(schedule.transferByTarget).toBe(false);
    expect(late(schedule).some((i) => i.priority !== 'certification')).toBe(true);
  });

  it('leaves a plan that fits exactly as it was', () => {
    // The even mix is the better plan whenever both are on time, so nothing
    // is reordered when nothing needs to be.
    const roomy = { start: FALL_26, unitsPerTerm: 15, includeSummer: false, target: FALL_28 };
    const schedule = buildSchedule(majorPrep, roomy, pattern);
    expect(schedule.meetsTarget).toBe(true);
    expect(schedule.transferByTarget).toBe(true);
    expect(schedule.reordered).toBe(false);
    expect(schedule.afterTarget).toEqual([]);
  });

  it('does not reorder a plan with no target to reorder against', () => {
    const schedule = buildSchedule(majorPrep, { ...tight, target: null }, pattern);
    expect(schedule.transferByTarget).toBeNull();
    expect(schedule.afterTarget).toEqual([]);
    expect(schedule.reordered).toBe(false);
  });

  it('never buys the target by dropping major preparation', () => {
    // Major preparation is the agreement, which is the thing this tool reads.
    // Deferring it would meet the target by answering a different question.
    const schedule = buildSchedule(majorPrep, tight, pattern);
    const scheduled = schedule.terms.flatMap((t) => t.courses).map((c) => c.code);
    expect(scheduled).toEqual(['AAA 1', 'AAA 2', 'BBB 1', 'BBB 2', 'CCC 1', 'CCC 2']);
    expect(late(schedule).some((i) => i.kind === 'course')).toBe(false);
  });

  it('adds no work by reordering', () => {
    // Moving work about must not add work. With a target the terms shown
    // stop before it, so the comparison is units shown plus units left out
    // against the untargeted plan's total.
    const reordered = buildSchedule(majorPrep, tight, pattern);
    const plain = buildSchedule(majorPrep, { ...tight, target: null }, pattern);
    expect(reordered.totalUnits + reordered.overflowUnits).toBe(plain.totalUnits);
    expect(reordered.terms.length).toBeLessThanOrEqual(plain.terms.length);
  });
});

describe('when the target can be moved rather than met', () => {
  const FALL_28 = { kind: 'Fall' as const, year: 2028 };

  it('says which term the minimum actually lands in, not which term the pattern does', () => {
    // A student told only that the plan runs to Spring 2030 cannot tell how
    // far the target has to move. The answer they need is the term the work
    // that cannot wait finishes in, which is earlier and is the one that
    // decides whether transferring a term later is enough.
    const schedule = buildSchedule(
      [group(course('AAA 1', 3)), group(course('AAA 2', 3))],
      { start: FALL_26, unitsPerTerm: 3, includeSummer: false, target: FALL_28 },
      [area('1A', 3, 'admission'), area('3', 3, 'certification'), area('4', 3, 'certification')],
    );

    // Three units a term: major, major, admission, then the two that can wait.
    // The minimum lands in Fall 2027. The pattern would run to Fall 2028, the
    // target term itself, which is not drawn: the last term shown is Spring
    // 2028 and the rest is reported as left out.
    expect(termLabel(schedule.readyToTransfer!)).toBe('Fall 2027');
    expect(termLabel(schedule.readyAfter!)).toBe('Spring 2028');
    expect(schedule.afterTarget.map((i) => i.units)).toEqual([3]);
  });

  it('leaves it null when there is nothing that has to be done first', () => {
    const schedule = buildSchedule([], base, [area('3', 3, 'certification')]);
    expect(schedule.readyToTransfer).toBeNull();
    expect(schedule.readyAfter).not.toBeNull();
  });
});

describe('major preparation the agreement does not mark as a minimum', () => {
  const FALL_28 = { kind: 'Fall' as const, year: 2028 };
  // Fall 26, Spring 27, Fall 27, Spring 28: four usable terms at 9 units.
  const tight = { start: FALL_26, unitsPerTerm: 9, includeSummer: false, target: FALL_28 };

  const priced = (code: string, units: number, priority: Priority) => ({
    kind: 'and' as const,
    priority,
    courses: [course(code, units)],
  });

  it('does not make the plan late on its own', () => {
    // 36 units of minimum fills every usable term exactly, and 4 units of
    // unmarked preparation spills past the target. The old reading called
    // that "you cannot be ready to transfer", which was wrong: the campus
    // never said this course was required to apply.
    const schedule = buildSchedule(
      [
        ...Array.from({ length: 12 }, (_, i) => priced(`REQ ${i}`, 3, 'admission')),
        priced('EXTRA 1', 4, 'major'),
      ],
      tight,
    );

    expect(schedule.transferByTarget).toBe(true);
    expect(schedule.meetsTarget).toBe(false);
    expect(schedule.majorAfterTarget.map((i) => (i.kind === 'course' ? i.course.code : i.areaId)))
      .toEqual(['EXTRA 1']);
  });

  it('still makes the plan late when the minimum itself does not fit', () => {
    const schedule = buildSchedule(
      Array.from({ length: 14 }, (_, i) => priced(`REQ ${i}`, 3, 'admission')),
      tight,
    );

    expect(schedule.transferByTarget).toBe(false);
    expect(schedule.majorAfterTarget).toEqual([]);
  });

  it('reads a group with no stated priority as a minimum', () => {
    // Every caller predating the distinction, and every hand-built group in
    // these tests, keeps the old reading where all of it gates the target.
    const schedule = buildSchedule(
      Array.from({ length: 14 }, (_, i) => group(course(`REQ ${i}`, 3))),
      tight,
    );

    expect(schedule.transferByTarget).toBe(false);
  });

  it('counts the minimum as done in the last term before the target, not in it', () => {
    const schedule = buildSchedule([priced('REQ 1', 3, 'admission')], {
      ...tight,
      start: { kind: 'Spring', year: 2028 },
    });

    // Spring 2028 is the last term a student can enrol in before starting at
    // the university in Fall 2028.
    expect(termLabel(schedule.readyToTransfer!)).toBe('Spring 2028');
    expect(schedule.transferByTarget).toBe(true);
  });
});

describe('the earliest term a student could start', () => {
  it('is the term after the minimum finishes, not the term it finishes in', () => {
    // A plan whose last minimum course falls in Fall 2028 does not get the
    // student to a Fall 2028 start. Reporting the finish term against a Fall
    // 2028 target read as "you cannot transfer by Fall 2028, you would not be
    // ready until Fall 2028", which answers nothing.
    const schedule = buildSchedule(
      Array.from({ length: 5 }, (_, i) => group(course(`REQ ${i}`, 15))),
      { ...base, target: { kind: 'Fall', year: 2028 } },
    );

    expect(termLabel(schedule.readyToTransfer!)).toBe('Fall 2028');
    expect(termLabel(schedule.earliestTransfer!)).toBe('Spring 2029');
  });

  it('is null when there is nothing left to take', () => {
    expect(buildSchedule([], base).earliestTransfer).toBeNull();
  });
});

describe('the winter intersession', () => {
  it('falls between Fall and the Spring after it, not inside a year', () => {
    // The ordering trap. Winter 2027 runs in January 2027, after Fall 2026 and
    // before Spring 2027, so a naive "sort by year then season" that put it
    // beside the other 2027 terms would place it after Summer 2027.
    expect(nextTerm({ kind: 'Fall', year: 2026 }, false, true)).toEqual({
      kind: 'Winter',
      year: 2027,
    });
    expect(nextTerm({ kind: 'Winter', year: 2027 }, false, true)).toEqual({
      kind: 'Spring',
      year: 2027,
    });
    expect(termIndex({ kind: 'Fall', year: 2026 })).toBeLessThan(
      termIndex({ kind: 'Winter', year: 2027 }),
    );
    expect(termIndex({ kind: 'Winter', year: 2027 })).toBeLessThan(
      termIndex({ kind: 'Spring', year: 2027 }),
    );
  });

  it('is skipped entirely unless asked for', () => {
    expect(nextTerm({ kind: 'Fall', year: 2026 }, false)).toEqual({ kind: 'Spring', year: 2027 });
    expect(nextTerm({ kind: 'Fall', year: 2026 }, true)).toEqual({ kind: 'Spring', year: 2027 });
  });

  it('interleaves with summer when both are on', () => {
    const schedule = buildSchedule(
      Array.from({ length: 8 }, (_, i) => group(course(`AAA ${i}`, 4))),
      { start: FALL_26, unitsPerTerm: 12, includeSummer: true, includeWinter: true },
    );


    expect(schedule.terms.map((t) => t.label)).toEqual([
      'Fall 2026',
      'Winter 2027',
      'Spring 2027',
      'Summer 2027',
    ]);
  });

  it('holds one course, not a semester', () => {
    // Five or six weeks against a semester's sixteen. A winter term packed to
    // a student's chosen load would be a plan nobody could actually take.
    const schedule = buildSchedule(
      Array.from({ length: 6 }, (_, i) => group(course(`AAA ${i}`, 4))),
      { start: FALL_26, unitsPerTerm: 12, includeSummer: false, includeWinter: true },
    );

    const winter = schedule.terms.find((t) => t.ref.kind === 'Winter')!;
    expect(winter.items).toHaveLength(1);
    expect(winter.units).toBe(4);
  });

  it('admits a five-unit course, which a fraction of the load would not', () => {
    // The bug this pins. Budgeting winter as a quarter of a twelve-unit load
    // gives three units, and three units silently refuses every four- and
    // five-unit course, so winter reads as on and then takes nothing but the
    // occasional three-unit elective.
    for (const units of [3, 4, 5]) {
      // Fall is filled exactly, so the next course is the first thing the
      // winter after it is offered.
      const schedule = buildSchedule(
        [group(course('AAA 1', 12)), group(course('BBB 2', units))],
        { start: FALL_26, unitsPerTerm: 12, includeSummer: false, includeWinter: true },
      );
      const winter = schedule.terms.find((t) => t.ref.kind === 'Winter');
      expect(winter?.courses.map((c) => c.code)).toEqual(['BBB 2']);
    }
  });

  it('refuses two courses however small they are', () => {
    const schedule = buildSchedule(
      [group(course('AAA 1', 12)), group(course('BBB 2', 3)), group(course('CCC 3', 3))],
      { start: FALL_26, unitsPerTerm: 12, includeSummer: false, includeWinter: true },
    );
    const winter = schedule.terms.find((t) => t.ref.kind === 'Winter')!;
    expect(winter.items).toHaveLength(1);
  });

  it('is skipped rather than printed empty when nothing fits it', () => {
    // A 10-unit course does not fit a winter intersession but fits a normal
    // term. The right answer is the Spring, not a blown budget and not an
    // empty Winter row.
    const schedule = buildSchedule([group(course('AAA 1', 6)), group(course('BIG 2', 10))], {
      start: FALL_26,
      unitsPerTerm: 12,
      includeSummer: false,
      includeWinter: true,
    });

    expect(schedule.terms.map((t) => t.label)).toEqual(['Fall 2026', 'Spring 2027']);
  });

  it('shortens a plan that a target could not otherwise hold', () => {
    // The reason to offer it at all: four semesters at 9 units is 36, and 40
    // units of minimum does not fit. Three winters buy the terms back.
    const work = Array.from({ length: 14 }, (_, i) => group(course(`REQ ${i}`, 3)));
    const target = { kind: 'Fall' as const, year: 2028 };

    const without = buildSchedule(work, {
      start: FALL_26,
      unitsPerTerm: 9,
      includeSummer: false,
      target,
    });
    const withWinter = buildSchedule(work, {
      start: FALL_26,
      unitsPerTerm: 9,
      includeSummer: false,
      includeWinter: true,
      target,
    });

    expect(without.transferByTarget).toBe(false);
    expect(withWinter.transferByTarget).toBe(true);
  });
});

describe('the term a student is planning from', () => {
  // The next term they can still enrol in, not the one already under way. A
  // California community college opens Spring in mid-January and Fall at the
  // end of August.
  const on = (iso: string) => currentTerm(new Date(iso));

  it('offers Spring only while Spring is still startable', () => {
    expect(on('2026-01-05T00:00:00Z')).toEqual({ kind: 'Spring', year: 2026 });
    expect(on('2026-02-20T00:00:00Z')).toEqual({ kind: 'Spring', year: 2026 });
  });

  it('moves to Fall once Spring is under way', () => {
    // March, not May. By March a Spring term is half over, and offering it as
    // the term to plan from is offering a term nobody can join.
    expect(on('2026-03-02T00:00:00Z')).toEqual({ kind: 'Fall', year: 2026 });
    expect(on('2026-08-20T00:00:00Z')).toEqual({ kind: 'Fall', year: 2026 });
  });

  it('moves to next Spring once Fall is under way', () => {
    // September, not October. Fall opens at the end of August.
    expect(on('2026-09-09T00:00:00Z')).toEqual({ kind: 'Spring', year: 2027 });
    expect(on('2026-12-20T00:00:00Z')).toEqual({ kind: 'Spring', year: 2027 });
  });

  it('never defaults to a short session, since not every college runs one', () => {
    for (const month of ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']) {
      const kind = on(`2026-${month}-15T00:00:00Z`).kind;
      expect(['Fall', 'Spring']).toContain(kind);
    }
  });
});

describe('the earliest term worth offering', () => {
  const on = (iso: string) => earliestTerm(new Date(iso));

  it('reaches back to the short session the default skips over', () => {
    // The gap this closes. In September the default is next Spring, and a term
    // list starting there has no Winter in it at all, so a student planning to
    // start in the January intersession could not say so.
    expect(on('2026-09-09T00:00:00Z')).toEqual({ kind: 'Winter', year: 2027 });
    expect(currentTerm(new Date('2026-09-09T00:00:00Z'))).toEqual({
      kind: 'Spring',
      year: 2027,
    });
  });

  it('never sits after the default, or the default would fall off the list', () => {
    for (const month of ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']) {
      const now = new Date(`2026-${month}-15T00:00:00Z`);
      expect(termIndex(earliestTerm(now))).toBeLessThanOrEqual(termIndex(currentTerm(now)));
    }
  });

  it('offers the summer ahead of a Fall default', () => {
    expect(on('2026-04-01T00:00:00Z')).toEqual({ kind: 'Summer', year: 2026 });
    expect(currentTerm(new Date('2026-04-01T00:00:00Z'))).toEqual({ kind: 'Fall', year: 2026 });
  });
});

describe('prerequisite order', () => {
  const g = (...cs: { code: string; title: string; units: number }[]) => group(...cs);

  it('puts CS 2 before the CS 3A it is a prerequisite for', () => {
    // The case reported against Pasadena City College. ASSIST lists CS 003A,
    // CS 002 and CS 003AL as one requirement, in that order, and the packer
    // took them in that order, which put CS 002 in the same term as the course
    // it has to come before.
    const schedule = buildSchedule(
      [g(course('CS 003A', 3), course('CS 002', 3), course('CS 003AL', 1))],
      base,
    );

    expect(schedule.terms.map((t) => t.courses.map((c) => c.code))).toEqual([
      ['CS 002'],
      ['CS 003A', 'CS 003AL'],
    ]);
  });

  it('runs the whole chain in order across requirements', () => {
    const schedule = buildSchedule(
      [
        g(course('CS 003A', 3), course('CS 002', 3), course('CS 003AL', 1)),
        g(course('CS 003B', 3), course('CS 033', 3), course('CS 003BL', 1)),
      ],
      base,
    );

    expect(schedule.terms.map((t) => t.courses.map((c) => c.code))).toEqual([
      ['CS 002'],
      ['CS 003A', 'CS 003AL'],
      ['CS 003B', 'CS 003BL'],
      ['CS 033'],
    ]);
  });

  it('separates two parts of one numbered course wherever they are listed', () => {
    // Same number, different letter, in two separate requirements. The
    // numbering alone settles this one: MATH 005B follows MATH 005A.
    const schedule = buildSchedule(
      [g(course('MATH 005B', 5)), g(course('MATH 005A', 5))],
      base,
    );

    expect(schedule.terms.map((t) => t.courses.map((c) => c.code))).toEqual([
      ['MATH 005A'],
      ['MATH 005B'],
    ]);
  });

  it('lets separate requirements in one subject share a term', () => {
    // The limit of what the numbering can say, and the reason it stops here.
    // CS 008 and CS 033 both follow CS 003B and neither follows the other, so
    // reading every pair of numbers as a chain would spread a term's work over
    // three terms for nothing.
    const schedule = buildSchedule(
      [g(course('CS 008', 3)), g(course('CS 033', 3)), g(course('CS 045', 3))],
      base,
    );

    expect(schedule.terms).toHaveLength(1);
    expect(schedule.terms[0].courses.map((c) => c.code).sort()).toEqual([
      'CS 008',
      'CS 033',
      'CS 045',
    ]);
  });

  it('keeps a lab with its lecture even inside a chained requirement', () => {
    const schedule = buildSchedule(
      [g(course('CS 002', 3), course('CS 003B', 3), course('CS 003BL', 1))],
      base,
    );

    const withLecture = schedule.terms.find((t) => t.courses.some((c) => c.code === 'CS 003B'))!;
    expect(withLecture.courses.map((c) => c.code)).toEqual(['CS 003B', 'CS 003BL']);
  });
});

describe('the note that says why a term was split', () => {
  it('names a course only while something of its subject still follows', () => {
    // The note reads "the rest of it sits in later terms", so on the last term
    // of a subject it contradicts itself.
    const schedule = buildSchedule(
      [group(course('CS 002', 3), course('CS 003A', 3)), group(course('MATH 010', 4))],
      base,
    );

    expect(schedule.terms[0].sequenced).toEqual(['CS 002']);
    expect(schedule.terms[1].sequenced).toEqual([]);
  });

  it('says nothing at all when no subject was ordered', () => {
    const schedule = buildSchedule([group(course('CS 008', 3)), group(course('ENGL 001A', 3))], base);
    expect(schedule.terms.flatMap((t) => t.sequenced)).toEqual([]);
  });
});

describe('prerequisites read from the college catalog', () => {
  const g = (...cs: { code: string; title: string; units: number }[]) => group(...cs);

  // Pasadena City College's real catalog, for the courses this agreement uses.
  // Three of these contradict what reading the numbers alone would guess, which
  // is the whole reason the catalog is worth fetching.
  const pcc = index([
    ['CS 2', { prerequisites: [], corequisites: [], recommended: [] }],
    ['CS 3A', { prerequisites: ['CS 2'], corequisites: ['CS 3AL'], recommended: [] }],
    ['CS 3AL', { prerequisites: [], corequisites: ['CS 3A'], recommended: [] }],
    // No prerequisite at all: CS 003B is Java where CS 003A is C++, so they are
    // parallel and not a sequence.
    ['CS 3B', { prerequisites: [], corequisites: ['CS 3BL'], recommended: ['CS 1'] }],
    ['CS 3BL', { prerequisites: [], corequisites: ['CS 3B'], recommended: [] }],
    // Follows CS 003A, not CS 003B.
    ['CS 8', { prerequisites: ['CS 3A'], corequisites: [], recommended: [] }],
    ['CS 33', { prerequisites: ['CS 3B'], corequisites: [], recommended: [] }],
  ]);

  const termOf = (s: ReturnType<typeof buildSchedule>, code: string) =>
    s.terms.findIndex((t) => t.courses.some((c) => c.code === code));

  it('puts a stated prerequisite in a strictly earlier term', () => {
    const schedule = buildSchedule(
      [g(course('CS 003A', 3), course('CS 002', 3), course('CS 003AL', 1))],
      { ...base, prereqs: pcc },
    );

    expect(termOf(schedule, 'CS 002')).toBeLessThan(termOf(schedule, 'CS 003A'));
  });

  it('follows the catalog where the numbering would have guessed wrong', () => {
    // CS 008 follows CS 003A. Reading the numbers put CS 008 beside CS 003B,
    // which is a term a student cannot register for.
    const schedule = buildSchedule(
      [
        g(course('CS 003A', 3), course('CS 002', 3), course('CS 003AL', 1)),
        g(course('CS 008', 3)),
      ],
      { ...base, prereqs: pcc },
    );

    expect(termOf(schedule, 'CS 003A')).toBeLessThan(termOf(schedule, 'CS 008'));
  });

  it('stops separating two courses the catalog says are not a sequence', () => {
    // CS 003A and CS 003B share a number and differ by a letter, so reading the
    // numbers chains them. The catalog says CS 003B has no prerequisite: it is
    // the Java course where CS 003A is the C++ one. With the catalog in hand
    // they may share a term, and the plan is a term shorter for it.
    // CS 002 is held, or the plan would add it ahead of CS 003A and the point
    // here, that 3A and 3B may share a term, would be lost in the noise.
    const withCatalog = buildSchedule(
      [g(course('CS 003A', 3)), g(course('CS 003B', 3))],
      { ...base, prereqs: pcc, held: ['CS 002'] },
    );
    const guessing = buildSchedule([g(course('CS 003A', 3)), g(course('CS 003B', 3))], base);

    expect(withCatalog.terms).toHaveLength(1);
    expect(guessing.terms).toHaveLength(2);
  });

  it('keeps a corequisite in the same term, from the catalog rather than the code', () => {
    const schedule = buildSchedule(
      [g(course('CS 003B', 3)), g(course('CS 003BL', 1))],
      { ...base, prereqs: pcc },
    );

    expect(termOf(schedule, 'CS 003B')).toBe(termOf(schedule, 'CS 003BL'));
  });

  it('ignores a prerequisite this plan does not schedule', () => {
    // CS 002's own prerequisite at Pasadena is a mathematics course the
    // student has already done, so it is not in the plan. Ordering against a
    // course that is not being taken would stall the plan forever.
    const outside = new Map(pcc);
    outside.set(canonicalCourseKey('CS 2'), {
      code: 'CS 2',
      prerequisites: ['MATH 8'],
      corequisites: [],
      recommended: [],
      formerly: [],
      placementAlternative: false,
    });

    const schedule = buildSchedule([g(course('CS 002', 3))], { ...base, prereqs: outside });
    expect(schedule.terms).toHaveLength(1);
    expect(schedule.terms[0].courses.map((c) => c.code)).toEqual(['CS 002']);
  });

  it('never drops a course, even if the catalog states a cycle', () => {
    // A catalog should never say this, and if one does the scheduler must not
    // spin or quietly lose the courses.
    const cyclic = index([
      ['AAA 1', { prerequisites: ['AAA 2'], corequisites: [], recommended: [] }],
      ['AAA 2', { prerequisites: ['AAA 1'], corequisites: [], recommended: [] }],
    ]);

    const schedule = buildSchedule(
      [g(course('AAA 1', 3)), g(course('AAA 2', 3))],
      { ...base, prereqs: cyclic },
    );

    expect(schedule.terms.flatMap((t) => t.courses.map((c) => c.code)).sort()).toEqual([
      'AAA 1',
      'AAA 2',
    ]);
  });

  it('steps over a blocked course rather than leaving the term empty', () => {
    // CS 008 is waiting on CS 003A, which is no reason to leave the rest of
    // the term unused when something unrelated fits.
    const schedule = buildSchedule(
      [g(course('CS 008', 3)), g(course('CS 003A', 3)), g(course('BIO 001', 4))],
      { ...base, prereqs: pcc, held: ['CS 002'] },
    );

    expect(schedule.terms[0].courses.map((c) => c.code).sort()).toEqual(['BIO 001', 'CS 003A']);
    expect(termOf(schedule, 'CS 008')).toBe(1);
  });
});

describe('a prerequisite the plan does not contain', () => {
  const g = (...cs: { code: string; title: string; units: number }[]) => group(...cs);
  const pcc = index([
    ['CS 8', { prerequisites: ['CS 3A'], corequisites: [], recommended: [] }],
    ['CS 3A', { prerequisites: ['CS 2'], corequisites: [], recommended: [] }],
    ['MATH 5B', { prerequisites: ['MATH 5A', 'MATH 5AH'], corequisites: [], recommended: [] }],
  ]);

  it('reports the course a student would be turned away for, when it cannot name it', () => {
    // The real case. ASSIST says Pasadena's CS 008 satisfies UCI's I&C SCI 46,
    // and says nothing about CS 003A, which Pasadena requires first. With no
    // agreement or pattern to name CS 003A from, it is reported.
    const schedule = buildSchedule([g(course('CS 008', 3))], { ...base, prereqs: pcc });

    // Nothing here can name CS 003A as a course, so it cannot be added; it is
    // reported as a requirement to check.
    expect(schedule.addedPrerequisites).toEqual([]);
    expect(schedule.missingPrereqs).toEqual([{ course: 'CS 008', needs: ['CS 3A'], reason: 'unlisted' }]);
  });

  it('says nothing when the prerequisite is in the plan', () => {
    const schedule = buildSchedule([g(course('CS 008', 3)), g(course('CS 003A', 3))], {
      ...base,
      prereqs: pcc,
    });

    expect(schedule.missingPrereqs.map((m) => m.course)).toEqual(['CS 003A']);
  });

  it('says nothing when the student has already done it', () => {
    const schedule = buildSchedule([g(course('CS 008', 3))], {
      ...base,
      prereqs: pcc,
      held: ['CS 003A'],
    });

    expect(schedule.missingPrereqs).toEqual([]);
  });

  it('takes either side of an either/or as covering it', () => {
    // "MATH 005A or MATH 005AH" is satisfied by one of them, so holding one is
    // not something to warn about.
    const schedule = buildSchedule([g(course('MATH 005B', 5))], {
      ...base,
      prereqs: pcc,
      held: ['MATH 005AH'],
    });

    expect(schedule.missingPrereqs).toEqual([]);
  });

  it('warns about nothing at a college whose catalog cannot be read', () => {
    // Nothing is known there, and a warning invented from nothing is worse
    // than no warning.
    const schedule = buildSchedule([g(course('CS 008', 3))], base);
    expect(schedule.missingPrereqs).toEqual([]);
  });
});

describe('a catalog that spells a code without its space', () => {
  it('still orders the agreement\'s course behind it', () => {
    // Solano's own catalog writes PSYCC1000 where ASSIST prints PSYC C1000.
    // Where the space falls cannot be recovered without knowing the subject,
    // so every comparison drops spaces on both sides instead.
    const solano = index([
      ['PSYCC1000', { prerequisites: [], corequisites: [], recommended: [] }],
      ['PSYC 4', { prerequisites: ['PSYCC1000'], corequisites: [], recommended: [] }],
    ]);

    const schedule = buildSchedule(
      [group(course('PSYC 004', 3)), group(course('PSYC C1000', 3))],
      { ...base, prereqs: solano },
    );

    const at = (code: string) => schedule.terms.findIndex((t) => t.courses.some((c) => c.code === code));
    expect(at('PSYC C1000')).toBeLessThan(at('PSYC 004'));
    expect(schedule.missingPrereqs).toEqual([]);
  });
});

describe('prerequisites the agreement never named', () => {
  const g = (...cs: { code: string; title: string; units: number }[]) => group(...cs);
  const at = (s: ReturnType<typeof buildSchedule>, code: string) =>
    s.terms.findIndex((t) => t.courses.some((c) => c.code === code));

  // Pasadena's mathematics chain, as its catalog states it. 005B requires
  // 005A outright; 005A requires MATH 008 or 009 OR placement.
  const pcc = index([
    ['MATH 5B', { prerequisites: ['MATH 5A', 'MATH 5AH'] }],
    ['MATH 5A', { prerequisites: ['MATH 8', 'MATH 9'], placementAlternative: true }],
    ['MATH 5AH', { prerequisites: ['MATH 8', 'MATH 9'], placementAlternative: true }],
    ['MATH 8', {}],
  ]);

  // What the agreement and the general education pattern can name. MATH 005A
  // is Cal-GETC Area 2; MATH 008 is intermediate algebra and on neither.
  const named: Record<string, { code: string; title: string; units: number }> = {
    MATH5A: { code: 'MATH 005A', title: 'SINGLE VARIABLE CALCULUS I', units: 5 },
    MATH5AH: { code: 'MATH 005AH', title: 'HONORS CALCULUS I', units: 5 },
  };
  const courseInfo = (code: string) => named[canonicalCourseKey(code)] ?? null;

  it('puts MATH 005A into the plan, in a term before MATH 005B', () => {
    // The whole reason. A plan that schedules 005B alone sends a student to
    // registration without the course 005B needs; here that student is the
    // one who asked for this.
    const schedule = buildSchedule([g(course('MATH 005B', 5))], { ...base, prereqs: pcc, courseInfo });

    expect(schedule.addedPrerequisites.map((a) => [a.course.code, a.neededFor])).toEqual([
      ['MATH 005A', 'MATH 005B'],
    ]);
    expect(at(schedule, 'MATH 005A')).toBeLessThan(at(schedule, 'MATH 005B'));
    expect(schedule.addedUnits).toBe(5);
    expect(schedule.addedPrerequisites[0].course.title).toBe('SINGLE VARIABLE CALCULUS I');
  });

  it('prefers the ordinary section over the honours one', () => {
    const schedule = buildSchedule([g(course('MATH 005B', 5))], { ...base, prereqs: pcc, courseInfo });
    expect(schedule.addedPrerequisites[0].course.code).toBe('MATH 005A');
  });

  it('reports rather than adds a prerequisite placement can stand in for', () => {
    // MATH 005A's own prerequisite. A student who placed into calculus owes
    // no MATH 008, and adding it would put a course most transfer students
    // never take into every plan. So it is named, with the reason.
    const schedule = buildSchedule([g(course('MATH 005B', 5))], { ...base, prereqs: pcc, courseInfo });

    expect(schedule.addedPrerequisites.map((a) => a.course.code)).not.toContain('MATH 8');
    expect(schedule.missingPrereqs).toEqual([
      { course: 'MATH 005A', needs: ['MATH 8', 'MATH 9'], reason: 'placement' },
    ]);
  });

  it('keeps a pre-transfer course out even when the catalog does not mention placement', () => {
    // Pasadena's CS 002 states "MATH 008 or MATH 009" and nothing about
    // placement. MATH 008 is on no agreement and no transfer pattern, so it
    // cannot be named, and a course that cannot be named is reported rather
    // than scheduled. That is what keeps intermediate algebra out of a
    // calculus plan.
    const cs = index([['CS 2', { prerequisites: ['MATH 8', 'MATH 9'] }], ['MATH 8', {}]]);
    const schedule = buildSchedule([g(course('CS 002', 4))], { ...base, prereqs: cs, courseInfo });

    expect(schedule.addedPrerequisites).toEqual([]);
    expect(schedule.missingPrereqs).toEqual([
      { course: 'CS 002', needs: ['MATH 8', 'MATH 9'], reason: 'unlisted' },
    ]);
  });

  it('treats a course as placement-level wherever the college has said it is', () => {
    // MATH 009, precalculus, is on the Cal-GETC pattern and so can be named.
    // Pasadena says "MATH 008 or MATH 009, or placement" for MATH 005A and
    // just "MATH 008 or MATH 009" for CS 002. The college has already said
    // what kind of course MATH 009 is; a student on a calculus track has
    // placed past it, and it must not be added ahead of CS 002 on the
    // strength of one line that left the clause out.
    const withPrecalc = index([
      ['MATH 5B', { prerequisites: ['MATH 5A'] }],
      ['MATH 5A', { prerequisites: ['MATH 8', 'MATH 9'], placementAlternative: true }],
      ['CS 2', { prerequisites: ['MATH 8', 'MATH 9'] }],
      ['MATH 9', {}],
    ]);
    const info = (code: string) =>
      ({
        MATH5A: { code: 'MATH 005A', title: 'CALCULUS I', units: 5 },
        MATH9: { code: 'MATH 009', title: 'PRECALCULUS', units: 5 },
      })[canonicalCourseKey(code)] ?? null;

    const schedule = buildSchedule([g(course('MATH 005B', 5)), g(course('CS 002', 4))], {
      ...base,
      prereqs: withPrecalc,
      courseInfo: info,
    });

    expect(schedule.addedPrerequisites.map((a) => a.course.code)).toEqual(['MATH 005A']);
    expect(schedule.missingPrereqs.map((m) => [m.course, m.reason]).sort()).toEqual([
      ['CS 002', 'placement'],
      ['MATH 005A', 'placement'],
    ]);
  });

  it('adds nothing the student already holds', () => {
    const schedule = buildSchedule([g(course('MATH 005B', 5))], {
      ...base,
      prereqs: pcc,
      courseInfo,
      held: ['MATH 005AH'],
    });
    expect(schedule.addedPrerequisites).toEqual([]);
    expect(schedule.missingPrereqs).toEqual([]);
  });

  it('follows a chain, and carries the priority of the course that needs it', () => {
    const chain = index([
      ['CS 8', { prerequisites: ['CS 3A'] }],
      ['CS 3A', { prerequisites: ['CS 2'] }],
      ['CS 2', {}],
    ]);
    const agreement: Record<string, { code: string; title: string; units: number }> = {
      CS3A: { code: 'CS 003A', title: 'FUNDAMENTALS II', units: 3 },
      CS2: { code: 'CS 002', title: 'FUNDAMENTALS I', units: 4 },
    };
    const info = (code: string) => agreement[canonicalCourseKey(code)] ?? null;

    const schedule = buildSchedule(
      [{ kind: 'and', priority: 'admission', courses: [course('CS 008', 3)] }],
      { ...base, prereqs: chain, courseInfo: info },
    );
    expect(schedule.addedPrerequisites.map((a) => [a.course.code, a.neededFor])).toEqual([
      ['CS 003A', 'CS 008'],
      ['CS 002', 'CS 003A'],
    ]);
    expect(at(schedule, 'CS 002')).toBeLessThan(at(schedule, 'CS 003A'));
    expect(at(schedule, 'CS 003A')).toBeLessThan(at(schedule, 'CS 008'));
    // Added for an admission-required course, so it gates the target too.
    const aimed = buildSchedule(
      [{ kind: 'and', priority: 'admission', courses: [course('CS 008', 3)] }],
      { ...base, prereqs: chain, courseInfo: info, target: { kind: 'Fall', year: 2027 } },
    );
    // Three terms of chain against two before Fall 2027: cannot be met.
    expect(aimed.transferByTarget).toBe(false);
  });

  it('never runs away on a catalog that states a cycle', () => {
    const cyclic = index([
      ['AAA 1', { prerequisites: ['AAA 2'] }],
      ['AAA 2', { prerequisites: ['AAA 1'] }],
    ]);
    const info = (code: string) => ({ code, title: code, units: 3 });
    const schedule = buildSchedule([g(course('AAA 1', 3))], { ...base, prereqs: cyclic, courseInfo: info });
    expect(schedule.addedPrerequisites.length).toBeLessThanOrEqual(12);
    expect(schedule.terms.flatMap((t) => t.courses.map((c) => c.code))).toContain('AAA 1');
  });
});
