import { describe, it, expect } from 'vitest';
import { readPlanUrl, writePlanUrl } from '../../app/lib/urlState';

const settings = {
  start: { kind: 'Fall' as const, year: 2026 },
  unitsPerTerm: 15,
  includeSummer: true,
  includeWinter: true,
  target: { kind: 'Spring' as const, year: 2028 },
};

const KEY = '76/49/to/120/Major/7752acca-2b16-46d0-fb90-08dda2ee8889';

describe('plan URL state', () => {
  it('round trips a whole plan', () => {
    const url = writePlanUrl({
      college: 49,
      campus: 120,
      year: 76,
      major: KEY,
      completed: new Set(['CS 003B', 'MATH 005A']),
      cleared: new Set(['MATH 2A', 'I&C SCI 31+I&C SCI 32+I&C SCI 33']),
      settings,
      pattern: 'IGETC',
    });

    const back = readPlanUrl(url);
    expect(back.college).toBe(49);
    expect(back.campus).toBe(120);
    expect(back.year).toBe(76);
    expect(back.major).toBe(KEY);
    expect([...back.completed].sort()).toEqual(['CS 003B', 'MATH 005A']);
    // A row key joins its receiving codes with '+', which is the one
    // character a query string will happily turn into a space. If this ever
    // goes green as ['I&C SCI 31 I&C SCI 32 I&C SCI 33'], the link silently
    // clears nothing.
    expect([...back.cleared].sort()).toEqual([
      'I&C SCI 31+I&C SCI 32+I&C SCI 33',
      'MATH 2A',
    ]);
    expect(back.settings).toEqual(settings);
    expect(back.pattern).toBe('IGETC');
  });

  it('carries a chosen short-term load, and only a chosen one', () => {
    // An unset summer or winter load is the planner's own default, and a link
    // must not pin a number the student never picked.
    const chosen = writePlanUrl({
      college: 49, campus: 120, year: 76, major: KEY, completed: new Set(), cleared: new Set(),
      settings: { ...settings, summerUnits: 9, winterUnits: 4 }, pattern: null,
    });
    expect(chosen).toContain('summerLoad=9');
    expect(chosen).toContain('winterLoad=4');
    expect(readPlanUrl(chosen).settings).toMatchObject({ summerUnits: 9, winterUnits: 4 });

    const unset = writePlanUrl({
      college: 49, campus: 120, year: 76, major: KEY, completed: new Set(), cleared: new Set(),
      settings, pattern: null,
    });
    expect(unset).not.toContain('summerLoad');
    expect(readPlanUrl(unset).settings?.summerUnits).toBeUndefined();
  });

  it('leaves the pattern out unless it was chosen explicitly', () => {
    // Null means the catalog year decides, which is the usual case, and a
    // link should not pin a choice the student never made.
    const url = writePlanUrl({
      college: 49,
      campus: 120,
      year: 76,
      major: KEY,
      completed: new Set(),
      cleared: new Set(),
      settings,
      pattern: null,
    });
    expect(url).not.toContain('pattern=');
    expect(readPlanUrl(url).pattern).toBeNull();
  });

  it('refuses a pattern it does not know', () => {
    expect(readPlanUrl('?pattern=NOPE').pattern).toBeNull();
    expect(readPlanUrl('?pattern=CSUGE').pattern).toBe('CSUGE');
  });

  it('leaves settings out until there is a major to apply them to', () => {
    const url = writePlanUrl({
      college: 49,
      campus: null,
      year: null,
      major: null,
      completed: new Set(),
      cleared: new Set(),
      settings,
      pattern: null,
    });
    expect(url).toBe('?college=49');
  });

  it('refuses a major key that is not an ASSIST key', () => {
    // A hand-edited link must not be able to point the server at another path.
    expect(readPlanUrl('?major=../../etc/passwd').major).toBeNull();
    expect(readPlanUrl('?major=76/49/to/120/Major/not-a-uuid').major).toBeNull();
  });

  it('ignores nonsense in every field rather than throwing', () => {
    // 'Quarter' is not a term kind. Winter is, since colleges run a winter
    // intersession, so it cannot stand in for a rejected one here.
    const back = readPlanUrl('?college=abc&campus=-4&year=0&start=Quarter-2026&load=x&target=Fall-1900');
    expect(back.college).toBeNull();
    expect(back.campus).toBeNull();
    expect(back.year).toBeNull();
    expect(back.settings).toBeNull();
  });

  it('accepts a winter term in a link', () => {
    expect(readPlanUrl('?start=Winter-2027').settings?.start).toEqual({
      kind: 'Winter',
      year: 2027,
    });
  });

  it('uppercases completed courses so a hand-typed link still matches', () => {
    expect([...readPlanUrl('?done=cs 003b,math 5a').completed]).toEqual(['CS 003B', 'MATH 5A']);
  });

  it('reads an empty query as an empty plan', () => {
    const back = readPlanUrl('');
    expect(back.college).toBeNull();
    expect(back.completed.size).toBe(0);
    expect(back.settings).toBeNull();
  });
});
