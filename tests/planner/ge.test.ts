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
    departmentName?: string;
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
    departmentName: c.departmentName ?? c.prefixCode,
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
      { code: 'HIST 001', title: 'HIST 001', units: 3, areas: ['3B', '4'], department: 'HIST' },
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


describe('progress against the ICAS standard', () => {
  const pattern = toGeneralEducation(
    list([
      { prefixCode: 'ENGL', courseNumber: '001A', areas: [['1A', 'English Composition']] },
      { prefixCode: 'ENGL', courseNumber: '001B', areas: [['1B', 'Critical Thinking']] },
      { prefixCode: 'COMM', courseNumber: '001', areas: [['1C', 'Oral Communication']] },
      { prefixCode: 'MATH', courseNumber: '005A', areas: [['2', 'Maths']] },
      { prefixCode: 'ART', courseNumber: '001', areas: [['3A', 'Arts']] },
      { prefixCode: 'HIST', courseNumber: '001', areas: [['3B', 'Humanities']] },
      { prefixCode: 'PSYC', courseNumber: '001', departmentName: 'Psychology', areas: [['4', 'Social']] },
      { prefixCode: 'PSYC', courseNumber: '002', departmentName: 'Psychology', areas: [['4', 'Social']] },
      { prefixCode: 'SOC', courseNumber: '001', departmentName: 'Sociology', areas: [['4', 'Social']] },
      { prefixCode: 'CHEM', courseNumber: '001', areas: [['5A', 'Physical']] },
      { prefixCode: 'CHEM', courseNumber: '001L', areas: [['5A', 'Physical'], ['5C', 'Laboratory']] },
      { prefixCode: 'BIO', courseNumber: '011', areas: [['5B', 'Biological']] },
      { prefixCode: 'ETHN', courseNumber: '001', areas: [['6', 'Ethnic Studies']] },
    ]),
  );

  const status = (done: string[]) => geStatus(pattern, new Set(done), []);

  it('states how many courses the whole pattern takes', () => {
    const s = status([]);
    expect(s.coursesRequired).toBe(11);
    expect(s.unitsRequired).toBe(34);
    expect(s.coursesDone).toBe(0);
  });

  it('marks an area met only once its own count is reached', () => {
    const s = status(['PSYC 001']);
    const four = s.areas.find((a) => a.code === '4')!;
    expect(four.required).toBe(2);
    expect(four.met).toBe(false);

    const both = status(['PSYC 001', 'SOC 001']).areas.find((a) => a.code === '4')!;
    expect(both.met).toBe(true);
  });

  it('does not count a surplus course as progress', () => {
    // Three Area 4 courses is real work, but the requirement asks for two and
    // the third is not progress against the pattern.
    const s = status(['PSYC 001', 'PSYC 002', 'SOC 001']);
    expect(s.coursesDone).toBe(2);
  });

  it('applies a course listed in two areas to only one of them', () => {
    // The standard: "Courses listed in more than one area can only be applied
    // in one area." Crediting HIST 001 to both 3B and 4 would tell a student
    // they had finished two requirements with one course.
    const s = status(['HIST 001']);
    expect(s.coursesDone).toBe(1);
    const filled = s.areas.filter((a) => a.done.length > 0).map((a) => a.code);
    expect(filled).toHaveLength(1);
    expect(['3B', '4']).toContain(filled[0]);
  });

  it('assigns dual-area courses so the most requirements are met', () => {
    // ART 001 only fits 3A. HIST 001 fits 3B or 4. A greedy pass that puts
    // HIST in 4 leaves 3B short when nothing else can fill it, so the
    // assignment has to look ahead.
    const s = status(['HIST 001', 'SOC 001', 'PSYC 001']);
    const byCode = new Map(s.areas.map((a) => [a.code, a]));
    expect(byCode.get('4')!.met).toBe(true);
    expect(byCode.get('3B')!.met).toBe(true);
    expect(s.coursesDone).toBe(3);
  });

  it('lets an Area 5 course carry the laboratory as well, which is the one exception', () => {
    // CHEM 001L is listed 5A and 5C. It is applied to 5A, and the laboratory
    // rides along rather than consuming a second slot.
    const s = status(['CHEM 001L', 'BIO 011']);
    expect(s.coursesDone).toBe(2);
    expect(s.lab).toBe(true);
  });

  it('never requires a course for the laboratory', () => {
    const lab = status([]).areas.find((a) => a.code === '5C')!;
    expect(lab.required).toBe(0);
    expect(lab.met).toBe(false);
  });

  it('has no answer on the laboratory until Area 5 is finished', () => {
    expect(status(['CHEM 001']).lab).toBeNull();
  });

  it('sees the laboratory when an Area 5 course carries one', () => {
    expect(status(['CHEM 001L', 'BIO 011']).lab).toBe(true);
  });

  it('says the laboratory is missing when neither Area 5 course carries one', () => {
    expect(status(['CHEM 001', 'BIO 011']).lab).toBe(false);
  });

  it('flags two Area 4 courses from one department', () => {
    // The rule asks for two academic disciplines. A department is a weaker
    // signal, so this is raised as a doubt rather than enforced.
    expect(status(['PSYC 001', 'PSYC 002']).areaFourOneDepartment).toBe(true);
    expect(status(['PSYC 001', 'SOC 001']).areaFourOneDepartment).toBe(false);
  });

  it('never counts one course toward the total twice', () => {
    // Every course here is listed in exactly one area except HIST 001, so the
    // total must be the course count, not the tag count.
    const s = status(['ENGL 001A', 'HIST 001', 'CHEM 001L']);
    expect(s.coursesDone).toBe(3);
  });

  it('counts a full pattern as complete', () => {
    const s = status([
      'ENGL 001A', 'ENGL 001B', 'COMM 001', 'MATH 005A', 'ART 001', 'HIST 001',
      'PSYC 001', 'SOC 001', 'CHEM 001L', 'BIO 011', 'ETHN 001',
    ]);
    expect(s.coursesDone).toBe(11);
    expect(s.lab).toBe(true);
    expect(s.areas.filter((a) => a.required > 0).every((a) => a.met)).toBe(true);
  });

  it('cites the standard it applied', () => {
    expect(status([]).citation).toContain('Cal-GETC Standards 1.4');
  });
});
