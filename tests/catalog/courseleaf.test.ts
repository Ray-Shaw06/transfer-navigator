import { describe, it, expect } from 'vitest';
import { parseCourseLeafCourse } from '../../src/catalog/courseleaf';
import {
  canonicalCourseKey,
  catalogSpellings,
  normalizeCourseCode,
  padCourseCode,
} from '../../src/catalog/normalize';

// The shapes below are the real ones, trimmed. Every variant here was seen in
// Pasadena City College's live catalog while this was written: a single
// prerequisite, an either/or, a corequisite lab, advice that names no course
// at all, and a line of prose with one code buried in it.
const link = (code: string) =>
  `<a href="/search/?P=${encodeURIComponent(code)}" class="bubblelink code" onclick="return showCourse(this, '${code}');">${code.replace(' ', '&#160;')}</a>`;

const course = (code: string, ...sections: string[]) =>
  `<?xml version="1.0"?><courseinfo><course code="${code}"><![CDATA[<div class="courseblock">${sections.join('')}</div>]]></course></courseinfo>`;

const section = (label: string, body: string) =>
  `<div class="section"><div class="section__content"><span><strong>${label}:</strong> <em>${body}</em></span></div></div>`;

describe('parseCourseLeafCourse', () => {
  it('reads a single prerequisite and a corequisite lab', () => {
    const parsed = parseCourseLeafCourse(
      course(
        'CS 003A',
        section('Prerequisite(s)', link('CS 002')),
        section('Corequisite(s)', link('CS 003AL')),
      ),
    );

    expect(parsed).toEqual({
      code: 'CS 3A',
      prerequisites: ['CS 2'],
      corequisites: ['CS 3AL'],
      recommended: [],
    });
  });

  it('flattens an either/or rather than trying to resolve it', () => {
    // A student holds one side of an either/or and never both, so requiring
    // whichever of them is in their plan to come first is the same answer as
    // resolving the alternative, with none of the parsing.
    const parsed = parseCourseLeafCourse(
      course(
        'MATH 005B',
        section('Prerequisite(s)', `${link('MATH 005A')} or ${link('MATH 005AH')}`),
      ),
    );

    expect(parsed?.prerequisites).toEqual(['MATH 5A', 'MATH 5AH']);
  });

  it('keeps recommended preparation apart from a real prerequisite', () => {
    // The distinction that matters most here. Recommended preparation is
    // advice, and scheduling around it would push work later for no reason.
    const parsed = parseCourseLeafCourse(
      course(
        'CS 003B',
        section('Corequisite(s)', link('CS 003BL')),
        section('Recommended Preparation', link('CS 001')),
      ),
    );

    expect(parsed?.prerequisites).toEqual([]);
    expect(parsed?.corequisites).toEqual(['CS 3BL']);
    expect(parsed?.recommended).toEqual(['CS 1']);
  });

  it('takes the one code out of a line that is mostly prose', () => {
    const parsed = parseCourseLeafCourse(
      course(
        'CHEM 001A',
        section(
          'Prerequisite(s)',
          `(1) Intermediate Algebra or placement into any MATH course numbered 001-099 and (2) ${link('CHEM 022')}`,
        ),
      ),
    );

    expect(parsed?.prerequisites).toEqual(['CHEM 22']);
  });

  it('finds nothing to schedule around in a placement rule', () => {
    // "Placement as determined by the college's assessment process" names no
    // course, so there is nothing to order against and nothing is invented.
    const parsed = parseCourseLeafCourse(
      course(
        'ENGL 001A',
        section('Prerequisite(s)', 'Placement as determined by the assessment process'),
      ),
    );

    expect(parsed?.prerequisites).toEqual([]);
  });

  it('never lets a course be its own prerequisite', () => {
    // A catalog that says so would deadlock the scheduler rather than order
    // it, so the self-reference is dropped where it is read.
    const parsed = parseCourseLeafCourse(
      course('CS 002', section('Prerequisite(s)', `${link('CS 002')} or ${link('CS 001')}`)),
    );

    expect(parsed?.prerequisites).toEqual(['CS 1']);
  });

  it('returns nothing for a course the catalog does not have', () => {
    expect(parseCourseLeafCourse('<?xml version="1.0"?><courseinfo></courseinfo>')).toBeNull();
  });
});

describe('normalizeCourseCode', () => {
  it('makes one spelling of the padding the two sources disagree on', () => {
    // ASSIST prints MATH 005A, a catalog link carries MATH 5A, and the
    // catalog's own prose puts a non-breaking space in the middle.
    expect(normalizeCourseCode('MATH 005A')).toBe('MATH 5A');
    expect(normalizeCourseCode('math 5a')).toBe('MATH 5A');
    expect(normalizeCourseCode('CS 003BL')).toBe('CS 3BL');
    expect(normalizeCourseCode('  I&C  SCI   31 ')).toBe('I&C SCI 31');
  });

  it('leaves a code that is already bare alone', () => {
    expect(normalizeCourseCode('CS 33')).toBe('CS 33');
    expect(normalizeCourseCode('ENGL C1000')).toBe('ENGL C1000');
  });
});

describe('padCourseCode', () => {
  it('writes a code the way a college and an agreement both write it', () => {
    // A warning that says CS 008 needs CS 3A reads like two different systems
    // talking. Both sides are shown the way the student sees them on a
    // schedule of classes.
    expect(padCourseCode('CS 3A')).toBe('CS 003A');
    expect(padCourseCode('MATH 5AH')).toBe('MATH 005AH');
    expect(padCourseCode('CS 33')).toBe('CS 033');
  });

  it('leaves alone what is already padded, and what is not a plain number', () => {
    expect(padCourseCode('CS 003A')).toBe('CS 003A');
    expect(padCourseCode('ENGL C1000')).toBe('ENGL C1000');
  });
});

describe('the spellings a catalog might answer to', () => {
  it('covers the ways colleges disagree about a code', () => {
    // Pasadena writes MATH 005A, Foothill writes MATH 12, Mt. San Jacinto
    // writes MATH-105. A catalog answers to its own spelling and to no other,
    // so all of them are tried.
    expect(catalogSpellings('MATH 5A')).toContain('MATH 005A');
    expect(catalogSpellings('MATH 005A')).toContain('MATH 5A');
    expect(catalogSpellings('MATH 105')).toContain('MATH-105');
  });

  it('reads a hyphenated code as the same course as a spaced one', () => {
    expect(normalizeCourseCode('MATH-105')).toBe(normalizeCourseCode('MATH 105'));
  });
});

describe('canonicalCourseKey', () => {
  it('makes every spelling of one course compare equal', () => {
    const same = ['PSYC C1000', 'PSYCC1000', 'psyc c1000', 'PSYC-C1000', 'PSYC  C1000'];
    const keys = new Set(same.map(canonicalCourseKey));
    expect(keys.size).toBe(1);
    expect(canonicalCourseKey('MATH 005A')).toBe(canonicalCourseKey('MATH5A'));
    expect(canonicalCourseKey('ACCT P110')).toBe(canonicalCourseKey('ACCTP110'));
  });
});
