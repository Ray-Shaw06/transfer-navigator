import { describe, it, expect } from 'vitest';
import { codesFromText, stripHtml } from '../../src/catalog/text';

describe('codesFromText', () => {
  it('reads a Title-case subject, as College of Marin writes them', () => {
    expect(codesFromText('Math 104 and Math 105, or Math 109, or completion of Precalculus')).toEqual([
      'MATH 104',
      'MATH 105',
      'MATH 109',
    ]);
  });

  it('refuses the assembly bill that half the state cites', () => {
    // "placement based on AB705 mandates" is in a great many prerequisite
    // lines. Reading it as a course would order a plan around a bill.
    expect(codesFromText('Completion of Intermediate Algebra or placement based on AB705 mandates')).toEqual([]);
    expect(codesFromText('CHEM 114, or placement per AB 1705')).toEqual(['CHEM 114']);
  });

  it('refuses a term name or an ordinary word next to a number', () => {
    expect(codesFromText('Effective Fall 2025, this course requires ENGL C1000')).toEqual(['ENGL C1000']);
    expect(codesFromText('a Grade 12 reading level or MATH 55')).toEqual(['MATH 55']);
  });

  it('reads a four-digit course number whole', () => {
    // College of the Siskiyous numbers courses MFG 1020. Without the fourth
    // digit this split as subject "MF", number "G1020".
    expect(codesFromText('MFG1020 or MFG 1010')).toEqual(['MFG 1020', 'MFG 1010']);
  });

  it('still reads the statewide letter-and-four-digit form', () => {
    expect(codesFromText('ENGL C1000 or ENGL 1A')).toEqual(['ENGL C1000', 'ENGL 1A']);
  });

  it('stops at the end of the sentence', () => {
    expect(codesFromText('CHEM 001A with C or better. Cal-GETC: 5A,5C District GE: 5A')).toEqual([
      'CHEM 1A'.replace('1A', '001A'),
    ]);
  });
});

describe('stripHtml', () => {
  it('turns a line break into a space rather than gluing words', () => {
    expect(stripHtml('MATH 140<br />or MATH 149')).toBe('MATH 140 or MATH 149');
  });
});
