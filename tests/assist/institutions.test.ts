import { describe, it, expect } from 'vitest';
import { currentName } from '../../src/assist/institutions';

// The three real cases are CSU campuses, because they are the ones that have
// renamed: Humboldt State became Cal Poly Humboldt in 2021, CSU Hayward became
// CSU East Bay in 2005, and California Maritime Academy became CSU Maritime
// Academy in 2015. ASSIST still lists the old name first.
describe('currentName', () => {
  it('takes the newest name rather than the first one listed', () => {
    expect(
      currentName([
        { name: 'Humboldt State University' },
        { name: 'California Polytechnic University, Humboldt', fromYear: 2021 },
      ]),
    ).toBe('California Polytechnic University, Humboldt');
  });

  it('keeps the only name a school has ever had', () => {
    expect(currentName([{ name: 'San Diego State University' }])).toBe('San Diego State University');
  });

  it('ignores names ASSIST flags as not for listing', () => {
    expect(
      currentName([
        { name: 'Example College' },
        { name: 'Example College (do not use)', fromYear: 2030, hideInList: true },
      ]),
    ).toBe('Example College');
  });

  it('walks past an older rename to the newest one', () => {
    expect(
      currentName([
        { name: 'First Name' },
        { name: 'Second Name', fromYear: 1994 },
        { name: 'Third Name', fromYear: 2016 },
      ]),
    ).toBe('Third Name');
  });

  it('is null when there is nothing showable', () => {
    expect(currentName([])).toBeNull();
    expect(currentName(undefined)).toBeNull();
    expect(currentName([{ name: 'Hidden', hideInList: true }])).toBeNull();
  });
});
