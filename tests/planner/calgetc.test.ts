import { describe, it, expect } from 'vitest';
import {
  LAB_AREA,
  REQUIREMENTS,
  TOTAL_COURSES,
  TOTAL_SEMESTER_UNITS,
  requirementFor,
} from '../../src/planner/calgetc';

// These assertions are the transcription check. Every number here is quoted
// from ICAS Cal-GETC Standards 1.4 section 2 and its summary table, so if a
// future edit mistypes the table, this fails rather than quietly changing what
// students are told to take.
describe('the Cal-GETC pattern as ICAS states it', () => {
  it('totals the 11 courses the standard totals', () => {
    expect(TOTAL_COURSES).toBe(11);
  });

  it('totals 34 semester units', () => {
    // 11 courses at 3 semester units, plus the one-unit laboratory.
    expect(TOTAL_SEMESTER_UNITS).toBe(34);
    expect(REQUIREMENTS.reduce((sum, r) => sum + r.courses * 3, 0) + 1).toBe(TOTAL_SEMESTER_UNITS);
  });

  it('asks for one course in every area except Social and Behavioral Sciences', () => {
    for (const requirement of REQUIREMENTS) {
      expect(requirement.courses).toBe(requirement.code === '4' ? 2 : 1);
    }
  });

  it('covers exactly the areas ASSIST tags courses with, minus the laboratory', () => {
    expect(REQUIREMENTS.map((r) => r.code)).toEqual([
      '1A',
      '1B',
      '1C',
      '2',
      '3A',
      '3B',
      '4',
      '5A',
      '5B',
      '6',
    ]);
  });

  it('does not treat the laboratory as a course of its own', () => {
    // The standard makes it a property of one Area 5 course, not a twelfth
    // course. Requiring it separately would invent work.
    expect(requirementFor(LAB_AREA)).toBeUndefined();
  });

  it('carries the wording Area 4 asks for beyond a count', () => {
    expect(requirementFor('4')?.caveat).toContain('two academic disciplines');
  });
});
