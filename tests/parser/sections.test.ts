import { describe, it, expect } from 'vitest';
import { parseSectionHeader } from '../../src/parser/sections';

describe('parseSectionHeader', () => {
  it('reads a numbered choose-at-least header', () => {
    expect(parseSectionHeader('2 Complete at least 1 course from the following')).toEqual({
      label: 'Complete at least 1 course from the following',
      rule: { kind: 'choose', least: 1 },
    });
  });

  it('reads a plural choose-at-least header', () => {
    expect(parseSectionHeader('4 Complete at least 2 courses from the following')).toEqual({
      label: 'Complete at least 2 courses from the following',
      rule: { kind: 'choose', least: 2 },
    });
  });

  it('reads a select-between header as choosing one', () => {
    expect(parseSectionHeader('3 Select A or B')).toEqual({
      label: 'Select A or B',
      rule: { kind: 'choose', least: 1 },
    });
  });

  it('reads a required-for-admission header as all required', () => {
    expect(parseSectionHeader('REQUIRED FOR ADMISSION')).toEqual({
      label: 'REQUIRED FOR ADMISSION',
      rule: { kind: 'all' },
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
