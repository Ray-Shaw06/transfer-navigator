import { describe, it, expect } from 'vitest';
import { semesterToQuarter } from '../../src/planner/units';

describe('semesterToQuarter', () => {
  it('multiplies by one and a half', () => {
    expect(semesterToQuarter(4)).toBe(6);
    expect(semesterToQuarter(3)).toBe(4.5);
  });

  it('rounds to two decimals rather than carrying float noise', () => {
    expect(semesterToQuarter(1.1)).toBe(1.65);
  });
});
