import { describe, it, expect } from 'vitest';
import {
  buildSchedule,
  currentTerm,
  nextTerm,
  sequenceStem,
  termIndex,
  termLabel,
} from '../../src/planner/schedule';
import type { AndGroup } from '../../src/parser/groups';

const course = (code: string, units: number) => ({ code, title: code, units });
const group = (...courses: { code: string; title: string; units: number }[]): AndGroup => ({
  kind: 'and',
  courses,
});

const FALL_26 = { kind: 'Fall' as const, year: 2026 };

const base = { start: FALL_26, unitsPerTerm: 15, includeSummer: false };

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

describe('sequenceStem', () => {
  it('finds the stem only when a suffix distinguishes courses', () => {
    expect(sequenceStem('MATH 005A')).toBe('MATH 005');
    expect(sequenceStem('CS 003BL')).toBe('CS 003');
    expect(sequenceStem('MATH 010')).toBeNull();
    expect(sequenceStem('I&C SCI 6B')).toBe('I&C SCI 6');
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

  it('does not flag a course whose stem it never had to split', () => {
    const schedule = buildSchedule([group(course('MATH 005A', 5), course('BIO 010', 4))], base);
    expect(schedule.terms[0].sequenced).toEqual([]);
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

    expect(schedule.terms).toHaveLength(3);
    expect(schedule.meetsTarget).toBe(false);
    expect(schedule.overflowUnits).toBe(15);
    expect(termLabel(schedule.readyAfter!)).toBe('Fall 2027');
  });

  it('confirms a plan that does fit', () => {
    const schedule = buildSchedule([group(course('AAA 1', 15)), group(course('BBB 2', 15))], {
      ...base,
      target: { kind: 'Spring', year: 2027 },
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
