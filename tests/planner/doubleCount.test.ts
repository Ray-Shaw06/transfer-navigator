import { describe, it, expect } from 'vitest';
import { toGeneralEducation } from '../../src/assist/ge';
import {
  areasCleared,
  betterByDoubleCount,
  buildDoubleCountIndex,
  geScheduleItems,
  optionAreas,
  splitUnits,
} from '../../src/planner/doubleCount';
import { geStatus } from '../../src/planner/ge';
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

describe('splitUnits', () => {
  it('splits evenly when it divides', () => {
    expect(splitUnits(6, 2)).toEqual([3, 3]);
    expect(splitUnits(9, 3)).toEqual([3, 3, 3]);
  });

  it('gives the remainder to the first, which is the laboratory course', () => {
    // Cal-GETC Area 5 is seven units over two courses because one carries a
    // one-unit lab. Four then three, not three and a half each.
    expect(splitUnits(7, 2)).toEqual([4, 3]);
  });

  it('has nothing to split for an area that takes no courses', () => {
    expect(splitUnits(0, 0)).toEqual([]);
  });
});

describe('geScheduleItems', () => {
  const status = geStatus(ge, patternFor('CALGETC'), null, new Set(), []);

  it('schedules every outstanding area at the units the pattern states', () => {
    const items = geScheduleItems(status);
    const area5 = items.filter((i) => i.kind === 'area' && i.areaId === '5');
    expect(area5.map((i) => i.units)).toEqual([4, 3]);
    // Eleven courses in the pattern, none done.
    expect(items).toHaveLength(11);
  });

  it('does not schedule an area the route already covers', () => {
    // MATH 006A is in the route and clears Area 2, so Area 2 must not appear
    // again as something to take: that is the double counting working.
    const covered = geStatus(ge, patternFor('CALGETC'), null, new Set(), [
      { code: 'MATH 006A', title: 'Calculus', units: 3 },
    ]);
    expect(geScheduleItems(covered).some((i) => i.kind === 'area' && i.areaId === '2')).toBe(false);
  });

  it('does not schedule an area already finished', () => {
    const done = geStatus(ge, patternFor('CALGETC'), null, new Set(['MATH 006A']), []);
    expect(geScheduleItems(done).some((i) => i.kind === 'area' && i.areaId === '2')).toBe(false);
  });

  it('schedules only what is left of a part-finished area', () => {
    const partial = geStatus(ge, patternFor('CALGETC'), null, new Set(['HIST 001']), []);
    const area3 = geScheduleItems(partial).filter((i) => i.kind === 'area' && i.areaId === '3');
    expect(area3).toHaveLength(1);
  });
});
