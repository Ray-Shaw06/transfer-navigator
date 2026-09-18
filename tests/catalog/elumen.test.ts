import { describe, it, expect } from 'vitest';
import {
  elumenCourseUrl,
  elumenCourseUrls,
  elumenSlug,
  parseElumenCourse,
  parseElumenSite,
} from '../../src/catalog/elumen';

// The shapes below are real, trimmed. Two colleges' templates are represented
// because they differ in everything but the words: Mission College wraps the
// requisite in a card under an accordion, Antelope Valley writes it inline
// after the title with a <br /> in the middle.

const mission = (requisites: string) => `
<header class="header l-body"><h2>BIO 001B - General Biology: Organisms</h2>
<h3 class="header-x-meta">5.0 Units</h3></header>
<div class="accordion"><h4 class="accordionheader-x-text">Course Advisory and Requisites</h4>
<div class="accordionheader-x-nested"><div class="infocard">
<p>${requisites}</p>
</div></div></div>`;

const antelope = (requisites: string) => `
<div><span class="title">Calculus and Analytic Geometry</span> <b>MATH 150:</b> 5.0 Units
${requisites}<br /> This course is for the student planning to major in mathematics.</div>`;

describe('parseElumenCourse', () => {
  it('reads an either/or prerequisite out of a card', () => {
    const parsed = parseElumenCourse(mission('Prerequisite: BIO 001A or BIO 001AH'), 'BIO 001B');

    expect(parsed).toEqual({
      code: 'BIO 1B',
      prerequisites: ['BIO 1A', 'BIO 1AH'],
      corequisites: [],
      recommended: [],
      formerly: [],
      units: 5,
      title: 'General Biology: Organisms',
      placementAlternative: false,
    });
  });

  it('reads a prerequisite written inline in a different template', () => {
    const parsed = parseElumenCourse(
      antelope('Prerequisite: Completion of MATH 140 or MATH 149 or placement by multiple measures.'),
      'MATH 150',
    );

    expect(parsed?.prerequisites).toEqual(['MATH 140', 'MATH 149']);
  });

  it('takes every code out of a nested either/or, and ignores the prose', () => {
    // Mission's BIO 001A, as written. Alternatives are not resolved: the
    // planner only asks whether a course already in the plan has to come
    // first, and "Intermediate Algebra skills" names no course at all.
    const parsed = parseElumenCourse(
      mission(
        'Prerequisite: (BIO 010 or BIO 011) and (CHM 001A or CHM 001AH) and Intermediate Algebra skills',
      ),
      'BIO 001A',
    );

    expect(parsed?.prerequisites).toEqual(['BIO 10', 'BIO 11', 'CHM 1A', 'CHM 1AH']);
  });

  it('keeps an advisory apart from a prerequisite, and credits each its own codes', () => {
    // eLumen's "Advisory" is advice, the same thing CourseLeaf colleges call
    // recommended preparation. Read up to the next label, so the advisory's
    // course is not credited to the prerequisite.
    const parsed = parseElumenCourse(
      mission('Prerequisite: CHM 001A Advisory: MATH 000D'),
      'CHM 001B',
    );

    expect(parsed?.prerequisites).toEqual(['CHM 1A']);
    // MATH 000D keeps one zero: the number really is zero, and both sides of a
    // comparison normalise it the same way, which is all matching needs.
    expect(parsed?.recommended).toEqual(['MATH 0D']);
  });

  it('reads "None" as nothing', () => {
    const parsed = parseElumenCourse(mission('Prerequisite: None'), 'BIO 010');
    expect(parsed?.prerequisites).toEqual([]);
  });

  it('returns nothing for an empty body, which is how eLumen says not found', () => {
    expect(parseElumenCourse('', 'ZZZ 999')).toBeNull();
    expect(parseElumenCourse('   \n  ', 'ZZZ 999')).toBeNull();
  });

  it('never lets a course be its own prerequisite', () => {
    const parsed = parseElumenCourse(mission('Prerequisite: BIO 001B or BIO 001A'), 'BIO 001B');
    expect(parsed?.prerequisites).toEqual(['BIO 1A']);
  });
});

describe('parseElumenSite', () => {
  it('reads the site id off the bar URL', () => {
    // Whatever the college named it: "24-25" at Mission, "2026-27" at
    // Antelope Valley, "catalog" at Santiago Canyon. Never guessed.
    expect(parseElumenSite('{"barUrl":"24-25/cataloghome","title":"Catalog 24-25"}')).toBe('24-25');
    expect(parseElumenSite('{"barUrl":"catalog/home"}')).toBe('catalog');
  });

  it('returns nothing for a tenant that is not publishing', () => {
    expect(parseElumenSite('{"barUrl":""}')).toBeNull();
    expect(parseElumenSite('not json')).toBeNull();
    expect(parseElumenSite('{}')).toBeNull();
  });
});

describe('the eLumen slug and URL', () => {
  it('is the code in lower case with the spaces taken out', () => {
    expect(elumenSlug('CIS 007')).toBe('cis007');
    expect(elumenSlug('BIO 001AH')).toBe('bio001ah');
    expect(elumenSlug('  MATH  150 ')).toBe('math150');
  });

  it('addresses the shared API with the tenant, the site and the slug', () => {
    expect(elumenCourseUrl('mission.elumenapp.com', '24-25', 'CIS 007')).toBe(
      'https://api-prod.elumenapp.com/catalog/sites/publish/content/24-25,course,cis007?tenant=mission.elumenapp.com',
    );
  });
});

describe('templates that drop the punctuation', () => {
  it('reads a label with no colon and a code with no space', () => {
    // Contra Costa, as written: "Prerequisite MATH120 - Intermediate Algebra".
    const parsed = parseElumenCourse(
      '<div>General College Chemistry I CHEM 120: 5.0 Units Prerequisite MATH120 - Intermediate Algebra Or equivalent. Advisory ENGL001A - Composition and Reading</div>',
      'CHEM 120',
    );

    expect(parsed?.prerequisites).toEqual(['MATH 120']);
    expect(parsed?.recommended).toEqual(['ENGL 1A']);
  });

  it('reads the statewide composition code', () => {
    const parsed = parseElumenCourse('<p>Advisory: ENGL C1000 or equivalent</p>', 'PHIL 001');
    expect(parsed?.recommended).toEqual(['ENGL C1000']);
  });
});

describe('a title that ends in a Roman numeral', () => {
  it('does not leak into the code after it', () => {
    // Diablo Valley, as written. Without a floor on the subject length this
    // read "I MATH 192" as a second, imaginary prerequisite.
    const parsed = parseElumenCourse(
      '<div>Prerequisite MATH192 - Analytic Geometry and Calculus I MATH-192 or equivalent Course Note: None</div>',
      'MATH 193',
    );

    expect(parsed?.prerequisites).toEqual(['MATH 192']);
  });
});

describe('a revised course', () => {
  it('is looked for under its versioned slugs after the plain one', () => {
    // Porterville publishes ACCT P120 only as acctp120v2.
    const urls = elumenCourseUrls('porterville.elumenapp.com', 'firstcatalog', 'ACCT P120');
    expect(urls.map((u) => /course,([a-z0-9]+)\?/.exec(u)?.[1])).toEqual([
      'acctp120',
      'acctp120v2',
      'acctp120v3',
      'acctp120v4',
    ]);
  });
});

describe('the course\'s own honours section', () => {
  it('is not a prerequisite of the course', () => {
    const parsed = parseElumenCourse(mission('Prerequisite: BIO 001A or BIO 001BH'), 'BIO 001B');
    expect(parsed?.prerequisites).toEqual(['BIO 1A']);
  });
});

describe('what a prerequisite needs to become a course in the plan', () => {
  it('reads the title from the heading and the units from the page', () => {
    const parsed = parseElumenCourse(mission('Prerequisite: BIO 001A'), 'BIO 001B');
    expect(parsed?.title).toBe('General Biology: Organisms');
    expect(parsed?.units).toBe(5);
  });

  it('reads a title written before the code', () => {
    const parsed = parseElumenCourse(
      antelope('Prerequisite: Completion of MATH 140 or MATH 149 or placement by multiple measures.'),
      'MATH 150',
    );
    expect(parsed?.title).toBe('Calculus and Analytic Geometry');
    expect(parsed?.units).toBe(5);
    expect(parsed?.placementAlternative).toBe(true);
  });
});
