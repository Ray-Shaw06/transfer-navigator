import { describe, it, expect } from 'vitest';
import {
  bySubject,
  compareCourseCodes,
  normalizeCode,
  sendingCourses,
  subjectOf,
} from '../../src/planner/catalog';
import type { Agreement } from '../../src/parser/agreement';

const course = (code: string, units = 3) => ({ code, title: `${code} title`, units });

const agreement = (rows: Agreement['rows']): Agreement => ({
  academicYear: '2025-2026',
  major: 'Widgetry, B.S.',
  receivingInstitution: 'Example University',
  sendingInstitution: 'Example College',
  sections: [],
  rows,
});

describe('compareCourseCodes', () => {
  it('sorts by number, not by string', () => {
    // A plain string compare puts MATH 010 before MATH 005A, which is exactly
    // backwards from how a catalog reads.
    expect(['MATH 010', 'MATH 005A', 'MATH 002'].sort(compareCourseCodes)).toEqual([
      'MATH 002',
      'MATH 005A',
      'MATH 010',
    ]);
  });

  it('sorts by subject first', () => {
    expect(['MATH 001', 'CS 100', 'BIO 050'].sort(compareCourseCodes)).toEqual([
      'BIO 050',
      'CS 100',
      'MATH 001',
    ]);
  });

  it('keeps suffixed courses in order', () => {
    expect(['CS 003BL', 'CS 003A', 'CS 003B'].sort(compareCourseCodes)).toEqual([
      'CS 003A',
      'CS 003B',
      'CS 003BL',
    ]);
  });
});

describe('subjectOf', () => {
  it('reads the subject off a code, including a spaced one', () => {
    expect(subjectOf('MATH 005A')).toBe('MATH');
    expect(subjectOf('I&C SCI 31')).toBe('I&C SCI');
  });
});

describe('normalizeCode', () => {
  it('reduces a printed code to what a student would type', () => {
    // The college prints MATH 005A; everyone writes MATH 5A. A filter that
    // cannot see those as the same reproduces the exact mismatch the chooser
    // was built to remove.
    expect(normalizeCode('MATH 005A')).toBe('math5a');
    expect(normalizeCode('math 5a')).toBe('math5a');
    expect(normalizeCode('CS 008L')).toBe('cs8l');
    expect(normalizeCode('I&C SCI 31')).toBe('i&csci31');
  });

  it('leaves an unpadded number alone', () => {
    expect(normalizeCode('MATH 10')).toBe('math10');
    expect(normalizeCode('MATH 010')).toBe('math10');
  });
});

describe('sendingCourses', () => {
  it('collects every course from every option, not just the suggested one', () => {
    const a = agreement([
      {
        receiving: [course('RECV 10')],
        sending: {
          kind: 'options',
          options: [
            { kind: 'and', courses: [course('SEND 1'), course('SEND 1L', 1)] },
            { kind: 'and', courses: [course('SEND 9', 5)] },
          ],
        },
      },
    ]);

    expect(sendingCourses(a).map((c) => c.code)).toEqual(['SEND 1', 'SEND 1L', 'SEND 9']);
  });

  it('lists a course once however many requirements accept it', () => {
    const shared = { kind: 'and' as const, courses: [course('MATH 022', 4)] };
    const a = agreement([
      { receiving: [course('RECV 10')], sending: { kind: 'options', options: [shared] } },
      { receiving: [course('RECV 20')], sending: { kind: 'options', options: [shared] } },
    ]);

    expect(sendingCourses(a).map((c) => c.code)).toEqual(['MATH 022']);
  });

  it('has nothing to offer when the agreement articulates nothing', () => {
    const a = agreement([
      { receiving: [course('RECV 10')], sending: { kind: 'not_articulated' } },
      { receiving: [course('RECV 20')], sending: { kind: 'unreadable', text: [] } },
    ]);

    expect(sendingCourses(a)).toEqual([]);
  });

  it('returns them in catalog order', () => {
    const a = agreement([
      {
        receiving: [course('RECV 10')],
        sending: {
          kind: 'options',
          options: [
            { kind: 'and', courses: [course('MATH 010'), course('BIO 002')] },
            { kind: 'and', courses: [course('MATH 005A')] },
          ],
        },
      },
    ]);

    expect(sendingCourses(a).map((c) => c.code)).toEqual(['BIO 002', 'MATH 005A', 'MATH 010']);
  });
});

describe('bySubject', () => {
  it('groups courses under their subject in order', () => {
    expect(
      bySubject([course('MATH 005A'), course('BIO 002'), course('MATH 010')]).map(([s, list]) => [
        s,
        list.map((c) => c.code),
      ]),
    ).toEqual([
      ['BIO', ['BIO 002']],
      ['MATH', ['MATH 005A', 'MATH 010']],
    ]);
  });
});
