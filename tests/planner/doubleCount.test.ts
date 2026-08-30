import { describe, it, expect } from 'vitest';
import { toGeneralEducation } from '../../src/assist/ge';
import {
  areasCleared,
  betterByDoubleCount,
  buildDoubleCountIndex,
  optionAreas,
} from '../../src/planner/doubleCount';
import { patternFor } from '../../src/planner/patterns';
import type { AssistTransferabilityList } from '../../src/assist/types';
import type { AndGroup } from '../../src/parser/groups';

const list = (
  courses: { prefixCode: string; courseNumber: string; areas: [string, string][] }[],
): AssistTransferabilityList => ({
  listType: 8,
  institutionName: 'Example College',
  academicYear: { code: '2025-2026' },
  courseInformationList: courses.map((c) => ({
    prefixCode: c.prefixCode,
    courseNumber: c.courseNumber,
    courseTitle: `${c.prefixCode} ${c.courseNumber}`,
    minUnits: 3,
    departmentName: c.prefixCode,
    transferAreas: c.areas.map(([code, codeDescription]) => ({ code, codeDescription })),
  })),
});

const ge = toGeneralEducation(
  list([
    { prefixCode: 'MATH', courseNumber: '006A', areas: [['2', 'Maths']] },
    { prefixCode: 'HIST', courseNumber: '001', areas: [['3B', 'Humanities']] },
    { prefixCode: 'ANTH', courseNumber: '002', areas: [['3B', 'Humanities'], ['4', 'Social']] },
  ]),
);

const index = buildDoubleCountIndex(ge, patternFor('CALGETC'), null);

const course = (code: string, units: number) => ({ code, title: code, units });
const option = (...courses: { code: string; title: string; units: number }[]): AndGroup => ({
  kind: 'and',
  courses,
});

describe('areasCleared', () => {
  it('reports the area as the pattern names it, not as ASSIST tags it', () => {
    // ASSIST tags the course 3B; Cal-GETC calls that Area 3.
    expect(areasCleared(index, 'HIST 001')).toEqual(['3']);
  });

  it('matches however the student spells the code', () => {
    expect(areasCleared(index, 'math 6a')).toEqual(['2']);
  });

  it('says nothing for a course the pattern does not certify', () => {
    expect(areasCleared(index, 'CS 002')).toEqual([]);
  });

  it('reports every area a course clears', () => {
    expect(optionAreas(index, option(course('ANTH 002', 3)))).toEqual(['3', '4']);
  });

  it('merges the areas across a multi-course option', () => {
    expect(optionAreas(index, option(course('MATH 006A', 3), course('HIST 001', 3)))).toEqual([
      '2',
      '3',
    ]);
  });
});

describe('betterByDoubleCount', () => {
  it('finds a costlier option that buys back a general education area', () => {
    // The planner suggests CS 002 on units alone. MATH 006A costs one more
    // unit and also clears Area 2, so it saves a three-unit course there.
    const suggested = [course('CS 002', 2)];
    const better = betterByDoubleCount(
      index,
      [option(...suggested), option(course('MATH 006A', 3))],
      suggested,
    );

    expect(better?.option.courses[0].code).toBe('MATH 006A');
    expect(better?.extraUnits).toBe(1);
    expect(better?.gains).toEqual(['2']);
  });

  it('says nothing when the suggested option already clears the area', () => {
    const suggested = [course('MATH 006A', 3)];
    expect(
      betterByDoubleCount(index, [option(...suggested), option(course('CS 002', 9))], suggested),
    ).toBeNull();
  });

  it('says nothing when no alternative clears anything', () => {
    const suggested = [course('CS 002', 3)];
    expect(
      betterByDoubleCount(index, [option(...suggested), option(course('CS 004', 4))], suggested),
    ).toBeNull();
  });

  it('prefers the alternative clearing the most areas, then the cheapest', () => {
    const suggested = [course('CS 002', 3)];
    const better = betterByDoubleCount(
      index,
      [option(...suggested), option(course('MATH 006A', 3)), option(course('ANTH 002', 4))],
      suggested,
    );
    // ANTH 002 clears two areas to MATH 006A's one.
    expect(better?.option.courses[0].code).toBe('ANTH 002');
    expect(better?.gains).toEqual(['3', '4']);
  });

  it('has nothing to say without a general education list', () => {
    const empty = buildDoubleCountIndex(null, patternFor('CALGETC'), null);
    expect(betterByDoubleCount(empty, [option(course('A 1', 3))], [course('A 1', 3)])).toBeNull();
    expect(areasCleared(empty, 'MATH 006A')).toEqual([]);
  });
});
