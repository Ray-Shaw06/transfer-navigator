import { describe, it, expect } from 'vitest';
import {
  PATTERNS,
  areasFor,
  patternFor,
  slotsFor,
  totalCourses,
  totalSemesterUnits,
} from '../../src/planner/patterns';

// The transcription check. Every number here is quoted from the cited
// document, so a future edit that mistypes a table fails the build rather than
// quietly changing what students are told to take.

describe('Cal-GETC as ICAS states it', () => {
  const pattern = patternFor('CALGETC');

  it('totals the 11 courses and 34 semester units of the summary table', () => {
    expect(totalCourses(pattern.areas)).toBe(11);
    expect(totalSemesterUnits(pattern.areas)).toBe(34);
    expect(slotsFor(pattern.areas)).toHaveLength(11);
  });

  it('asks for two courses in Arts and Humanities, one from each subarea', () => {
    const three = pattern.areas.find((a) => a.id === '3')!;
    expect(three.courses).toBe(2);
    expect(three.atLeast).toEqual([
      { code: '3A', courses: 1 },
      { code: '3B', courses: 1 },
    ]);
  });

  it('cites the standard it came from', () => {
    expect(pattern.citation).toContain('Cal-GETC Standards 1.4');
    expect(pattern.citationUrl).toContain('icas-ca.org');
  });
});

describe('IGETC as ICAS states it', () => {
  const pattern = patternFor('IGETC');

  it('asks for three courses in Arts and Humanities, not one of each', () => {
    // This is the shape that separates IGETC from Cal-GETC: three courses,
    // at least one Arts and one Humanities, and a third from either.
    const three = pattern.areas.find((a) => a.id === '3')!;
    expect(three.courses).toBe(3);
    expect(three.atLeast).toEqual([
      { code: '3A', courses: 1 },
      { code: '3B', courses: 1 },
    ]);

    const slots = slotsFor([three]);
    expect(slots).toHaveLength(3);
    expect(slots.filter((s) => s.eligible.length === 1)).toHaveLength(2);
    // The third slot takes either.
    expect(slots.filter((s) => s.eligible.length === 2)).toHaveLength(1);
  });

  it('asks for two Social and Behavioral Sciences courses from two disciplines', () => {
    const four = pattern.areas.find((a) => a.id === '4')!;
    expect(four.courses).toBe(2);
    expect(four.caveat).toContain('two academic disciplines');
    // ASSIST tags these with discipline subcodes as well as the bare 4.
    expect(four.from).toContain('4');
    expect(four.from).toContain('4J');
  });

  it('scopes Oral Communication to CSU and Language Other Than English to UC', () => {
    expect(pattern.areas.find((a) => a.id === '1C')!.onlyFor).toBe('CSU');
    expect(pattern.areas.find((a) => a.id === '6A')!.onlyFor).toBe('UC');
  });

  it('drops the other segment’s areas once a destination is known', () => {
    const uc = areasFor(pattern, 'UC').map((a) => a.id);
    const csu = areasFor(pattern, 'CSU').map((a) => a.id);
    expect(uc).toContain('6A');
    expect(uc).not.toContain('1C');
    expect(csu).toContain('1C');
    expect(csu).not.toContain('6A');
  });

  it('does not make Language Other Than English a course slot', () => {
    // It is satisfied by proficiency, which coursework is only one way to
    // show, so counting it as a course to take would invent work.
    const six = pattern.areas.find((a) => a.id === '6A')!;
    expect(six.notCoursework).toBeTruthy();
    expect(slotsFor([six])).toEqual([]);
  });

  it('carries the dual-certification exception ASSIST states', () => {
    expect(pattern.dualCertify?.areas).toContain('6A');
    expect(pattern.dualCertify?.note).toContain('Language Other Than English');
  });

  it('cites the standard it came from', () => {
    expect(pattern.citation).toContain('IGETC Standards 2.4');
  });
});

describe('CSU GE-Breadth as EO 1100 states it', () => {
  const pattern = patternFor('CSUGE');

  it('totals the 39 lower-division units of article 2.2.1, plus Area F', () => {
    // EO 1100 article 2.2.1: campus requirements "shall not exceed the
    // requirements for 39 lower-division and 9 upper-division semester-units".
    // Area F's 3 units come from Education Code 89032, which postdates it.
    expect(totalSemesterUnits(pattern.areas.filter((a) => a.id !== 'F'))).toBe(39);
    expect(totalSemesterUnits(pattern.areas)).toBe(42);
    expect(totalCourses(pattern.areas)).toBe(14);
  });

  it('subtracts the upper-division units from Areas B, C and D', () => {
    // Article 2.2.3 puts 3 upper-division semester units in each of B, C and
    // D. A community college certifies only the lower-division part, so each
    // of those areas is one course smaller here than in the executive order.
    for (const id of ['B', 'C', 'D']) {
      expect(pattern.areas.find((a) => a.id === id)!.courses).toBe(3);
    }
  });

  it('asks for one course in each of the three Area B subareas', () => {
    const b = pattern.areas.find((a) => a.id === 'B')!;
    expect(b.atLeast).toEqual([
      { code: 'B1', courses: 1 },
      { code: 'B2', courses: 1 },
      { code: 'B4', courses: 1 },
    ]);
    expect(b.caveat).toContain('laboratory');
  });

  it('treats the laboratory as part of a science course, not a course', () => {
    // EO 1100 article 4: the laboratory is "associated with B1 or B2".
    expect(pattern.labArea).toBe('B3');
    expect(pattern.areas.some((a) => a.id === 'B3')).toBe(false);
  });

  it('asks for three Social Sciences courses from two disciplines', () => {
    const d = pattern.areas.find((a) => a.id === 'D')!;
    expect(d.courses).toBe(3);
    expect(d.caveat).toContain('two different disciplines');
    expect(d.from).toContain('D9');
  });

  it('cites both documents it needed', () => {
    expect(pattern.citation).toContain('EO 1100');
    expect(pattern.citation).toContain('89032');
  });
});

describe('every pattern', () => {
  it('asks ASSIST for its list by the enum name', () => {
    // A number is silently ignored and returns the CSU transferable list.
    for (const pattern of PATTERNS) {
      expect(pattern.listType).toMatch(/^[A-Z-]+$/);
    }
  });

  it('never generates more slots than it says it takes', () => {
    for (const pattern of PATTERNS) {
      expect(slotsFor(pattern.areas).length).toBe(totalCourses(pattern.areas));
    }
  });

  it('sizes IGETC differently for each destination, which is why totals are derived', () => {
    const igetc = patternFor('IGETC');
    // CSU owes Oral Communication; UC owes a language proficiency that carries
    // no units. A single hardcoded total would be wrong for one of them.
    expect(totalSemesterUnits(areasFor(igetc, 'CSU'))).toBe(37);
    expect(totalSemesterUnits(areasFor(igetc, 'UC'))).toBe(34);
    expect(totalCourses(areasFor(igetc, 'CSU'))).toBe(12);
    expect(totalCourses(areasFor(igetc, 'UC'))).toBe(11);
  });
});
