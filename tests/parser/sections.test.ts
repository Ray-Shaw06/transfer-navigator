import { describe, it, expect } from 'vitest';
import { marksAdmission, marksAnyAdmission, parseSectionHeader } from '../../src/parser/sections';

describe('parseSectionHeader', () => {
  it('reads a numbered choose-at-least header', () => {
    expect(parseSectionHeader('2 Complete at least 1 course from the following')).toEqual({
      label: 'Complete at least 1 course from the following',
      rule: { kind: 'choose', least: 1 },
      admission: false,
    });
  });

  it('reads a plural choose-at-least header', () => {
    expect(parseSectionHeader('4 Complete at least 2 courses from the following')).toEqual({
      label: 'Complete at least 2 courses from the following',
      rule: { kind: 'choose', least: 2 },
      admission: false,
    });
  });

  it('reads a select-between header as choosing one', () => {
    expect(parseSectionHeader('3 Select A or B')).toEqual({
      label: 'Select A or B',
      rule: { kind: 'choose', least: 1 },
      admission: false,
    });
  });

  it('reads a required-for-admission header as all required', () => {
    expect(parseSectionHeader('REQUIRED FOR ADMISSION')).toEqual({
      label: 'REQUIRED FOR ADMISSION',
      rule: { kind: 'all' },
      admission: true,
    });
  });

  it('returns null for a page header, a footer, or prose', () => {
    expect(parseSectionHeader('7/28/26, 12:25 PM 2025-2026 Computer Science, B.S. Agreement')).toBeNull();
    expect(parseSectionHeader('https://assist.org/transfer/results?year=76')).toBeNull();
    expect(parseSectionHeader('Minimum grade required: B or better')).toBeNull();
    expect(parseSectionHeader('END OF AGREEMENT')).toBeNull();
    expect(parseSectionHeader('A')).toBeNull();
  });
});

describe('marksAdmission', () => {
  // The mark decides whether a requirement can make a plan late, so it is read
  // from the campus's own words and nowhere else. These two labels are the
  // real ones off the UCI Computer Science agreement, and the difference
  // between them is the whole distinction.
  it('reads the phrase wherever it falls in the campus label', () => {
    expect(
      marksAdmission('MAJOR PREPARATION COURSES REQUIRED FOR TRANSFER — REQUIRED FOR ADMISSION'),
    ).toBe(true);
    expect(marksAdmission('ADDITIONAL APPROVED COURSES FOR THE MAJOR — REQUIRED FOR ADMISSION')).toBe(
      true,
    );
    expect(marksAdmission('ADDITIONAL APPROVED COURSES FOR THE MAJOR')).toBe(false);
  });
});

describe('marksAnyAdmission', () => {
  const section = (label: string, admission: boolean) => ({
    label,
    rule: { kind: 'all' as const },
    admission,
  });

  it('is false for an agreement that never draws the distinction', () => {
    // The planner reads this as "assume all of it is a minimum". An agreement
    // that says nothing must not have its requirements quietly demoted.
    expect(marksAnyAdmission([section('MAJOR PREPARATION', false)])).toBe(false);
  });

  it('is true as soon as one section is marked', () => {
    expect(
      marksAnyAdmission([
        section('MAJOR PREPARATION — REQUIRED FOR ADMISSION', true),
        section('ADDITIONAL APPROVED COURSES FOR THE MAJOR', false),
      ]),
    ).toBe(true);
  });
});
