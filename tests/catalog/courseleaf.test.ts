import { describe, it, expect } from 'vitest';
import {
  courseLeafSubjectUrl,
  parseCourseLeafCourse,
  parseCourseLeafSubjectPage,
} from '../../src/catalog/courseleaf';
import {
  canonicalCourseKey,
  catalogSpellings,
  normalizeCourseCode,
  padCourseCode,
  sameCourse,
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
      formerly: [],
      units: undefined,
      title: undefined,
      placementAlternative: false,
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

describe('parseCourseLeafSubjectPage', () => {
  // Pasadena's /course-descriptions/stat/ page, trimmed to two blocks. The
  // course endpoint will not serve STAT C1000 at all; this page does.
  const page = `
<main>
<div class="courseblock"><div class="cols noindent"><span class="text detail-code_html margin--tiny text--semibold text--big"><strong>STAT 018</strong></span>&#160;&#160;<span class="text col-9 detail-title"><strong>STATISTICS FOR BEHAVIORAL SCIENCES</strong></span></div>
<div class="noindent"><div class="section"><div class="section__content"><span><strong>Prerequisite(s):</strong> <em>${link('MATH 131')}</em></span></div></div></div></div>
<div class="courseblock"><div class="cols noindent"><span class="text detail-code_html margin--tiny text--semibold text--big"><strong>STAT&#160;C1000</strong></span>&#160;&#160;<span class="text col-9 detail-title"><strong>INTRODUCTION TO STATISTICS</strong></span></div>
<div class="noindent"><div class="section"><div class="section__content"><span><strong>Prerequisite(s):</strong> <em>Placement as determined by assessment, or ${link('MATH 131')} or ${link('MATH 134')}</em></span></div></div></div></div>
</main>`;

  it('picks the one block for the code asked about', () => {
    const parsed = parseCourseLeafSubjectPage(page, 'STAT C1000');
    expect(parsed?.code).toBe('STAT C1000');
    expect(parsed?.prerequisites).toEqual(['MATH 131', 'MATH 134']);
  });

  it('matches the code however the page or the caller spaced it', () => {
    // The page prints STAT&#160;C1000 with a non-breaking space and the
    // agreement may print MATH 005A where the page has MATH 5A.
    expect(parseCourseLeafSubjectPage(page, 'STATC1000')?.code).toBe('STAT C1000');
    expect(parseCourseLeafSubjectPage(page, 'STAT 018')?.prerequisites).toEqual(['MATH 131']);
    expect(parseCourseLeafSubjectPage(page, 'STAT 18')?.prerequisites).toEqual(['MATH 131']);
  });

  it('returns nothing for a course the page does not list', () => {
    expect(parseCourseLeafSubjectPage(page, 'STAT 999')).toBeNull();
  });

  it('builds the page address from the subject alone', () => {
    expect(courseLeafSubjectUrl('curriculum.pasadena.edu', '/course-descriptions/{subject}/', 'STAT C1000')).toBe(
      'https://curriculum.pasadena.edu/course-descriptions/stat/',
    );
    expect(courseLeafSubjectUrl('catalog.msjc.edu', '/courses/{subject}/', 'MATH-105')).toBe(
      'https://catalog.msjc.edu/courses/math/',
    );
  });
});

describe('the spellings ASSIST forces on a catalog lookup', () => {
  it('repairs a hyphen-and-space code to the one the catalog answers to', () => {
    // ASSIST prints Mt. San Jacinto's courses as "BIOL- 150". The catalog
    // answers to BIOL-150 and to nothing with a space after the hyphen.
    expect(catalogSpellings('BIOL- 150')).toContain('BIOL-150');
    expect(catalogSpellings('BIOL- 150')).toContain('BIOL 150');
  });

  it('falls back to the base course for an honours section', () => {
    const spellings = catalogSpellings('BIOL A282H');
    expect(spellings[0]).toBe('BIOL A282H');
    expect(spellings).toContain('BIOL A282');
    expect(catalogSpellings('PSYC C1000H')).toContain('PSYC C1000');
  });

  it('tries the three separators for every padding', () => {
    const s = catalogSpellings('MATH 5A');
    for (const want of ['MATH 5A', 'MATH 005A', 'MATH-5A', 'MATH-005A', 'MATH5A', 'MATH005A']) {
      expect(s).toContain(want);
    }
  });
});

describe('a subject page that links each code to its outline', () => {
  it('reads the code out of the link, as Foothill writes it', () => {
    const page = `<div class="courseblock"><section><h2 class="cols noindent"><span class="text col-3 detail-code margin--tiny text--semibold text--huge">
      <strong><a href="/course-outlines/ECON-C2001/">
        ECON C2001
      </a>&#160;•&#160;</strong></span></h2>
      <table><tr><th><strong>Prerequisite:</strong></th><td>${link('MATH 105')}</td></tr></table></section></div>`;
    const parsed = parseCourseLeafSubjectPage(page, 'ECON C2001');
    expect(parsed?.code).toBe('ECON C2001');
    expect(parsed?.prerequisites).toEqual(['MATH 105']);
  });
});

describe('a course the agreement still names by its old number', () => {
  const page = `
<div class="courseblock"><div class="cols noindent"><span class="text detail-code margin--tiny text--semibold text--huge"><strong>ECON C2001</strong></span></div>
<div class="noindent"><div class="section"><div class="section__content"><span><strong>Prerequisite(s):</strong> <em>${link('MATH 105')}</em></span></div></div></div>
<div class="courseblockextra noindent">Formerly: ECON 1B An introductory course using microeconomic models.</div></div>
<div class="courseblock"><div class="cols noindent"><span class="text detail-code margin--tiny text--semibold text--huge"><strong>ECON C2002</strong></span></div>
<div class="courseblockextra noindent">An introductory course using models of the domestic economy. Formerly ECON 1A.</div></div>`;

  it('is found under the new number and answered under the old one', () => {
    // Foothill labels it "Formerly:" on its own line; Victor Valley writes it
    // into the last sentence of the description. Keyed to the code asked
    // about, since that is what the plan will look up.
    const micro = parseCourseLeafSubjectPage(page, 'ECON 1B');
    expect(micro?.code).toBe('ECON 1B');
    expect(micro?.prerequisites).toEqual(['MATH 105']);

    const macro = parseCourseLeafSubjectPage(page, 'ECON 1A');
    expect(macro?.code).toBe('ECON 1A');
  });

  it('prefers the course actually listed under a code over one formerly called it', () => {
    expect(parseCourseLeafSubjectPage(page, 'ECON C2001')?.code).toBe('ECON C2001');
  });
});

describe('the older subject-page template', () => {
  // The code starts the title and the name runs on after it, sometimes with
  // the units in a span in the middle. Sierra, Napa Valley and Cypress, as
  // written.
  const block = (title: string, requisite: string) =>
    `<div class="courseblock"><p class="courseblocktitle noindent"><strong>${title}</strong></p>
     <p class="courseblockextra noindent"><em><strong>Prerequisite(s): </strong></em>${requisite}</p></div>`;

  it('reads a code followed by a full stop and the title', () => {
    const page = block('MATH 0010. Problem Solving', 'MATH 0009 or placement');
    expect(parseCourseLeafSubjectPage(page, 'MATH 10')?.prerequisites).toEqual(['MATH 9']);
  });

  it('reads a code with the units in a span before the title', () => {
    const page = block('MATH-C2210 <span class="credits">5 Units</span> Calculus I', link('MATH 120'));
    expect(parseCourseLeafSubjectPage(page, 'MATH C2210')?.prerequisites).toEqual(['MATH 120']);
  });

  it('reads a North Orange County code with its college letter, or without', () => {
    // MATH 151 F is Fullerton's; the letter cannot be told from a title that
    // begins with "A", so the block answers to both spellings.
    const page = block('MATH 151 F Calculus I <span class="hours">4 Units</span>', link('MATH 141 F'));
    expect(parseCourseLeafSubjectPage(page, 'MATH 151 F')?.prerequisites).toEqual(['MATH 141 F']);
    expect(parseCourseLeafSubjectPage(page, 'MATH 151F')?.prerequisites).toEqual(['MATH 141 F']);
    expect(parseCourseLeafSubjectPage(page, 'MATH 151')?.prerequisites).toEqual(['MATH 141 F']);
  });

  it('does not take the first word of a title as a college letter', () => {
    const page = block('MATH 100 A Survey of Mathematics', 'MATH 55');
    expect(parseCourseLeafSubjectPage(page, 'MATH 100')?.prerequisites).toEqual(['MATH 55']);
  });
});

describe('a title with no strong element', () => {
  it('still yields the code, as Santa Barbara City writes it', () => {
    const page = `<div class="courseblock"><p class="courseblocktitle noindent" font-weight="bold">MATH 137 College Algebra (4 Units)</p>
      <p class="courseblockextra noindent">Prerequisite: MATH 107 or placement</p></div>`;
    expect(parseCourseLeafSubjectPage(page, 'MATH 137')?.prerequisites).toEqual(['MATH 107']);
  });
});

describe('the course\'s own honours section', () => {
  it('is not read as a prerequisite when the catalog names it in the next block', () => {
    // Pasadena's MATH 005B, as served: the requisite line is one block, and
    // the description that follows says "No credit given if taken after
    // MATH 005BH". Reading past the block took that as a prerequisite.
    const xml = course(
      'MATH 005B',
      section('Prerequisite(s)', `${link('MATH 005A')} or ${link('MATH 005AH')}`) +
        `<div class="noindent"><div class="courseblockextra noindent">Differentiation and integration. No credit given if taken after ${link('MATH 005BH')}.</div></div>`,
    );

    expect(parseCourseLeafCourse(xml)?.prerequisites).toEqual(['MATH 5A', 'MATH 5AH']);
  });

  it('is dropped even when a catalog lists it on the requisite line itself', () => {
    const xml = course(
      'MATH 005B',
      section('Prerequisite(s)', `${link('MATH 005A')} or ${link('MATH 005BH')}`),
    );
    expect(parseCourseLeafCourse(xml)?.prerequisites).toEqual(['MATH 5A']);

    // And the other way about: the base course is not a prerequisite for its
    // own honours section.
    const honours = course('MATH 005BH', section('Prerequisite(s)', `${link('MATH 005B')} or ${link('MATH 005A')}`));
    expect(parseCourseLeafCourse(honours)?.prerequisites).toEqual(['MATH 5A']);
  });
});

describe('sameCourse', () => {
  it('counts an honours section as its base course', () => {
    expect(sameCourse('MATH 005B', 'MATH 5BH')).toBe(true);
    expect(sameCourse('MATH 005BH', 'MATH 5B')).toBe(true);
    expect(sameCourse('MATH 5B', 'MATH 5A')).toBe(false);
    // A trailing H that is part of a sequence letter pair, not honours, still
    // compares as itself.
    expect(sameCourse('CHEM 1AH', 'CHEM 1A')).toBe(true);
    expect(sameCourse('CHEM 1A', 'CHEM 1B')).toBe(false);
  });
});

describe('what a prerequisite needs to become a course in the plan', () => {
  it('reads the units and title off the newer template', () => {
    const xml = course(
      'MATH 005A',
      `<div class="noindent"><span class="text detail-title margin--tiny"><strong>SINGLE VARIABLE CALCULUS I</strong></span></div>
       <div class="noindent"><span class="text detail-hours_html"><strong>5 unit</strong></span></div>` +
        section('Prerequisite(s)', `${link('MATH 008')} or ${link('MATH 009')}, or placement based on the Math assessment process`),
    );
    const parsed = parseCourseLeafCourse(xml);
    expect(parsed?.units).toBe(5);
    expect(parsed?.title).toBe('SINGLE VARIABLE CALCULUS I');
    // Placement can stand in for MATH 008, so a student who placed into
    // calculus does not owe it. Said, so the planner reports rather than adds.
    expect(parsed?.placementAlternative).toBe(true);
  });

  it('reads them off the older template too, and knows a hard prerequisite from a soft one', () => {
    const page = `<div class="courseblock"><p class="courseblocktitle"><strong>MATH 0016A. Calculus I</strong></p>
      <p class="courseblockdesc"><i>Units: 4</i><br/>Prerequisite: Completion of MATH 0012 with grade of "C" or better</p></div>`;
    const parsed = parseCourseLeafSubjectPage(page, 'MATH 16A');
    expect(parsed?.units).toBe(4);
    expect(parsed?.title).toBe('Calculus I');
    expect(parsed?.placementAlternative).toBe(false);
  });
});
