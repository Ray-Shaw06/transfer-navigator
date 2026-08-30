import { describe, it, expect } from 'vitest';
import { compareAreaCodes, toGeneralEducation } from '../../src/assist/ge';
import { geStatus } from '../../src/planner/ge';
import type { AssistTransferabilityList } from '../../src/assist/types';

const list = (
  courses: {
    prefixCode: string;
    courseNumber: string;
    courseTitle?: string;
    minUnits?: number;
    areas?: [string, string][];
  }[],
): AssistTransferabilityList => ({
  listType: 8,
  institutionName: 'Example College',
  academicYear: { code: '2025-2026' },
  courseInformationList: courses.map((c) => ({
    prefixCode: c.prefixCode,
    courseNumber: c.courseNumber,
    courseTitle: c.courseTitle ?? `${c.prefixCode} ${c.courseNumber}`,
    minUnits: c.minUnits ?? 3,
    transferAreas: (c.areas ?? []).map(([code, codeDescription]) => ({ code, codeDescription })),
  })),
});

describe('compareAreaCodes', () => {
  it('orders areas the way the pattern prints them', () => {
    // A plain string sort puts "10" before "2" and "1A" after both.
    expect(['5C', '2', '1A', '3B', '10', '1B'].sort(compareAreaCodes)).toEqual([
      '1A',
      '1B',
      '2',
      '3B',
      '5C',
      '10',
    ]);
  });
});

describe('toGeneralEducation', () => {
  it('groups a college list into areas', () => {
    const ge = toGeneralEducation(
      list([
        { prefixCode: 'ENGL', courseNumber: '001A', areas: [['1A', 'English Composition']] },
        { prefixCode: 'MATH', courseNumber: '005A', minUnits: 5, areas: [['2', 'Maths']] },
        { prefixCode: 'HIST', courseNumber: '001', areas: [['3B', 'Humanities'], ['4', 'Social Science']] },
      ]),
    );

    expect(ge.areas.map((a) => `${a.code}:${a.courses.length}`)).toEqual(['1A:1', '2:1', '3B:1', '4:1']);
    expect(ge.academicYear).toBe('2025-2026');
  });

  it('lists a course under every area it clears', () => {
    const ge = toGeneralEducation(
      list([{ prefixCode: 'HIST', courseNumber: '001', areas: [['3B', 'Humanities'], ['4', 'Social']] }]),
    );
    expect(ge.byCourse).toEqual([
      { code: 'HIST 001', title: 'HIST 001', units: 3, areas: ['3B', '4'] },
    ]);
  });

  it('leaves out a course certified for nothing', () => {
    // It comes back in the response but is not part of the pattern, so
    // offering it as something that counts would be wrong.
    const ge = toGeneralEducation(list([{ prefixCode: 'PE', courseNumber: '010', areas: [] }]));
    expect(ge.byCourse).toEqual([]);
    expect(ge.areas).toEqual([]);
  });

  it('has nothing to report for a year before the pattern existed', () => {
    const ge = toGeneralEducation({ ...list([]), courseInformationList: [] });
    expect(ge.areas).toEqual([]);
    expect(ge.byCourse).toEqual([]);
  });
});

describe('geStatus', () => {
  const ge = toGeneralEducation(
    list([
      { prefixCode: 'ENGL', courseNumber: '001A', areas: [['1A', 'English Composition']] },
      { prefixCode: 'MATH', courseNumber: '005A', minUnits: 5, areas: [['2', 'Maths']] },
      { prefixCode: 'HIST', courseNumber: '001', areas: [['3B', 'Humanities'], ['4', 'Social']] },
      { prefixCode: 'BIO', courseNumber: '011', areas: [['5B', 'Biological']] },
    ]),
  );

  const course = (code: string, units = 3) => ({ code, title: code, units });

  it('finds the courses that do double duty', () => {
    const status = geStatus(ge, new Set(), [course('MATH 005A', 5), course('CS 002', 4)]);

    // CS 002 clears nothing on the pattern; MATH 005A clears Area 2 for free.
    expect(status.overlap.map((o) => o.course.code)).toEqual(['MATH 005A']);
    expect(status.overlap[0].areas).toEqual(['2']);
    expect(status.overlap[0].finished).toBe(false);
  });

  it('matches a course however the student spells it', () => {
    // The whole point: MATH 5A and MATH 005A are one course.
    const status = geStatus(ge, new Set(['MATH 5A']), []);
    expect(status.overlap.map((o) => o.course.code)).toEqual(['MATH 005A']);
    expect(status.overlap[0].finished).toBe(true);
  });

  it('puts a course clearing two areas first', () => {
    const status = geStatus(ge, new Set(), [course('MATH 005A', 5), course('HIST 001')]);
    expect(status.overlap.map((o) => o.course.code)).toEqual(['HIST 001', 'MATH 005A']);
  });

  it('separates what is finished from what is only planned', () => {
    const status = geStatus(ge, new Set(['ENGL 001A']), [course('MATH 005A', 5)]);
    const byCode = new Map(status.areas.map((a) => [a.code, a]));

    expect(byCode.get('1A')!.done.map((c) => c.code)).toEqual(['ENGL 001A']);
    expect(byCode.get('1A')!.planned).toEqual([]);
    expect(byCode.get('2')!.planned.map((c) => c.code)).toEqual(['MATH 005A']);
    expect(byCode.get('2')!.done).toEqual([]);
  });

  it('names the areas nothing in the plan touches', () => {
    const status = geStatus(ge, new Set(), [course('MATH 005A', 5)]);
    expect(status.untouched.map((a) => a.code)).toEqual(['1A', '3B', '4', '5B']);
  });

  it('reports how many courses the college offers per area', () => {
    const status = geStatus(ge, new Set(), []);
    expect(status.areas.map((a) => `${a.code}:${a.offered}`)).toEqual(['1A:1', '2:1', '3B:1', '4:1', '5B:1']);
  });
});
