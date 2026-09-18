import { describe, it, expect } from 'vitest';
import { clampUnits, LEAST_UNITS, limitsFor, TYPICAL } from '../../src/planner/limits';

describe('limitsFor', () => {
  it('gives Pasadena the ceilings its catalog states, and says which', () => {
    // Study Load Regulations, 2026-27 catalog: twenty a semester without a
    // petition, twelve in summer. Winter is not stated there and stays
    // typical, and the answer says so, since a typical figure is a guess the
    // student should check and a read one is a rule.
    const pcc = limitsFor(49);
    expect(pcc.semester).toBe(20);
    expect(pcc.summer).toBe(12);
    expect(pcc.winter).toBe(TYPICAL.winter);
    expect(pcc.verified).toEqual(['semester', 'summer']);
  });

  it('gives an unlisted college typical ceilings and claims none of them', () => {
    const other = limitsFor(999);
    expect(other).toMatchObject({ semester: 18, summer: 8, winter: 6, verified: [] });
    expect(limitsFor(null).verified).toEqual([]);
  });
});

describe('clampUnits', () => {
  it('holds a stored load to the college\'s ceiling and to one course', () => {
    // A load chosen at one college can outlive a change to another with a
    // lower ceiling; the slider and the planner both read the clamped value.
    expect(clampUnits(20, 18)).toBe(18);
    expect(clampUnits(15, 20)).toBe(15);
    expect(clampUnits(0, 18)).toBe(LEAST_UNITS);
    expect(clampUnits(14.6, 18)).toBe(15);
  });
});
