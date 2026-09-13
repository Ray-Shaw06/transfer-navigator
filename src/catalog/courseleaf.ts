import type { CoursePrereqs } from './types';
import { normalizeCourseCode } from './normalize';
import { codesFromText, formerlyCodes, stripHtml } from './text';

// Reads prerequisites out of a CourseLeaf catalog.
//
// CourseLeaf is one of several platforms California community colleges run
// their catalogs on, and the only one this reads today. Every CourseLeaf site
// answers the same URL with the same shape:
//
//   /ribbit/index.cgi?page=getcourse.rjs&code=CS+003A
//
// which returns a small XML document wrapping the catalog's own HTML for that
// one course. Inside it, each requisite line looks like
//
//   <span><strong>Prerequisite(s):</strong>
//     <a ... onclick="return showCourse(this, 'CS 003A');">CS&#160;003A</a></span>
//
// The onclick carries the code already normalised by the catalog itself,
// which is why it is read from there and not from the link text: the text is
// full of non-breaking spaces and the href is percent-encoded.

// CourseLeaf is one platform but not one template, and colleges lay a requisite
// line out in at least three ways. Pasadena puts it in a span, San Jose City in
// a paragraph among other labelled fields, and Foothill in a table row with the
// label in the header cell and the courses in the cell beside it:
//
//   <span><strong>Prerequisite(s):</strong> <em><a …>CS 002</a></em></span>
//   <p class="courseblockextra">Prerequisite: <a …>CHEM 001A</a> with C or better.</p>
//   <th><strong>Prerequisite:</strong></th><td><a …>MATH 47</a> or <a …>MATH 48C</a></td>
//
// So the label is found on its own and what follows it is taken up to whichever
// comes first: the next label, or the end of the paragraph, row or list item it
// sits in. That spans the </th><td> boundary the table layout needs while still
// stopping before the next field, which on San Jose City's page is a general
// education listing full of things that look like codes and are not.
// The label itself, either wrapped in <strong> or written plainly at the start
// of its own element. San Jose City College writes the second kind:
//
//   <p class="courseblockextra">Prerequisite: <a …>CHEM 001A</a> with C or better.</p>
//
// Anchored to a tag boundary either way, so the word inside a sentence cannot
// match. Mt. San Jacinto's course descriptions contain "core prerequisite
// skills", and reading that as a label would invent a requirement out of prose.
const LABEL =
  /(?:<strong>\s*|>\s*)(Prerequisite|Corequisite|Recommended Preparation|Recommended Prep)(?:\(s\))?[A-Za-z ]{0,12}?\s*:\s*(?:<\/strong>)?/gi;
const END_OF_LINE = /<\/p>|<\/tr>|<\/li>|<\/table>|<strong[\s>]/;
const LINKED_CODE = /showCourse\(this,\s*'([^']+)'\)/g;

// Not every college links the courses it names. San Jose City College writes
// "Prerequisite: CHEM 001A with C or better." as plain text in a run of
// labelled fields, so where a requisite line carries no links at all its codes
// are read from the words instead. See text.ts for how that is bounded.

type Kind = 'prerequisites' | 'corequisites' | 'recommended';

// The catalog's own labels. Matched loosely on purpose: colleges vary between
// "Prerequisite:" and "Prerequisite(s):", and between "Recommended
// Preparation" and "Recommended Preparation:".
function kindOf(label: string): Kind | null {
  const l = label.toLowerCase();
  if (l.startsWith('prerequisite')) return 'prerequisites';
  if (l.startsWith('corequisite')) return 'corequisites';
  if (l.startsWith('recommended')) return 'recommended';
  return null;
}

export function parseCourseLeafCourse(xml: string): CoursePrereqs | null {
  const code = /<course code="([^"]+)"/.exec(xml);
  if (!code) return null;

  const found: CoursePrereqs = {
    code: normalizeCourseCode(code[1]),
    prerequisites: [],
    corequisites: [],
    recommended: [],
    formerly: formerlyCodes(stripHtml(xml)).map(normalizeCourseCode),
  };

  for (const label of xml.matchAll(LABEL)) {
    const kind = kindOf(label[1].trim());
    if (!kind) continue;

    const after = xml.slice(label.index + label[0].length);
    const end = END_OF_LINE.exec(after);
    const section = ['', label[1], after.slice(0, end ? end.index : 600)];
    // Links where there are links, words where there are not. Never both: a
    // college that links its courses has already said exactly which they are,
    // and re-reading the surrounding prose would only add what it chose to
    // leave out.
    const linked = [...section[2].matchAll(LINKED_CODE)].map((m) => m[1]);
    const named = linked.length > 0 ? linked : codesFromText(stripHtml(section[2]));

    for (const raw of named) {
      const course = normalizeCourseCode(raw);
      // A course is not its own prerequisite, and a catalog that says so
      // would deadlock the scheduler rather than order it.
      if (course && course !== found.code && !found[kind].includes(course)) {
        found[kind].push(course);
      }
    }
  }

  return found;
}

export const courseLeafUrl = (host: string, code: string): string =>
  `https://${host}/ribbit/index.cgi?page=getcourse.rjs&code=${encodeURIComponent(code)}`;

// A subject's own page in the catalog, the fallback for a course the
// getcourse endpoint will not serve.
//
// At Pasadena that endpoint answers every course except the ones numbered
// under California's new common course numbering, ENGL C1000 and STAT C1000
// and their kin, which are exactly the courses every transfer student takes.
// The catalog's own search knows them and its subject pages list them in the
// same courseblock markup, so the subject page is read and the one block
// picked out. The path is per college, /course-descriptions/stat/ at Pasadena
// and /courses/math/ at Mt. San Jacinto, and half the CourseLeaf colleges
// have no such page at a guessable path, so it is set in the registry only
// where it was seen to work.
export const courseLeafSubjectUrl = (host: string, template: string, code: string): string => {
  const subject = code.trim().split(/[\s-]/)[0].toLowerCase();
  return `https://${host}${template.replace('{subject}', encodeURIComponent(subject))}`;
};

// The course's own block off a subject page, in the shape the course parser
// already reads. Matched on the code the block itself prints, compared with
// spaces and padding removed, since the page writes STAT&#160;C1000 and the
// caller may have MATH 005A where the page has MATH 5A.
const BLOCK = /<div class="courseblock">([\s\S]*?)(?=<div class="courseblock">|<\/main>|<footer|$)/g;
// Where a block prints its own code. Two templates are in use.
//
// The newer one puts the code in a span classed detail-code (Mt. San Jacinto)
// or detail-code_html (Pasadena), and Foothill wraps it in a link to the
// course outline followed by a bullet:
//
//   <span class="detail-code"><strong>STAT&#160;C1000</strong></span>
//   <strong><a href="/course-outlines/ECON-C2001/">ECON C2001</a>&#160;•&#160;</strong>
//
// The older one starts the title with the code and runs the name on after
// it, sometimes with the units in a span in the middle:
//
//   <p class="courseblocktitle"><strong>MATH 0010. Problem Solving</strong></p>
//   <strong>MATH-C2210 <span class="credits">5 Units</span> Calculus I</strong>
//   <strong>MATH 009 C Skills for Math <span class="hours">2 Units</span></strong>
//
// The last is the North Orange County district, whose codes end in a letter
// for the college, C for Cypress and F for Fullerton. That letter cannot be
// told from a title that happens to begin with "A", so both readings are
// offered and the caller matches whichever it asked for.
const DETAIL_CODE =
  /detail-code(?:_html)?[^>]*>\s*<strong>\s*(?:<a[^>]*>)?\s*([^<•]+?)\s*(?:<\/a>)?(?:&#160;|&nbsp;|&#8226;|•|\s)*<\/strong>/;
// The title element whole, since Santa Barbara City writes it with no <strong>
// at all: <p class="courseblocktitle">MATH 074 Pre-algebra Refresher (1 Unit)</p>
const TITLE = /courseblocktitle[^>]*>([\s\S]*?)<\/(?:p|div|h[1-6])>/;
const LEADING_CODE = /^([A-Z][A-Za-z&]{1,9}[ -]?[A-Z]?\d{1,4}[A-Z]{0,2})(?:\s([A-Z]))?(?=[\s.:]|$)/;

function blockCodes(block: string): string[] {
  const detail = DETAIL_CODE.exec(block)?.[1];
  if (detail) return [detail.replace(/&#160;|&nbsp;/g, ' ').trim()];

  const title = TITLE.exec(block)?.[1];
  if (!title) return [];
  const text = title
    .replace(/<span[^>]*>[\s\S]*?<\/span>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#160;|&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const lead = LEADING_CODE.exec(text);
  if (!lead) return [];
  return lead[2] ? [`${lead[1]} ${lead[2]}`, lead[1]] : [lead[1]];
}

const bare = (code: string) =>
  code
    .replace(/&#160;|&nbsp;|[\u00a0\u2007\u202f]/g, ' ')
    .toUpperCase()
    .replace(/[\s-]+/g, '')
    .replace(/(^|[^0-9])0+(\d)/g, '$1$2');

const asCourse = (printed: string, block: string): CoursePrereqs | null => {
  const clean = printed.replace(/&#160;|&nbsp;/g, ' ').trim();
  return parseCourseLeafCourse(
    `<?xml version="1.0"?><courseinfo><course code="${clean}"><![CDATA[<div class="courseblock">${block}</div>]]></course></courseinfo>`,
  );
};

// Every code a subject page lists, first spelling of each. For checking a
// page answers at all, and for finding real codes to check the parser with.
export function subjectPageCodes(html: string): string[] {
  return [...html.matchAll(BLOCK)].flatMap((m) => blockCodes(m[1]).slice(0, 1));
}

export function parseCourseLeafSubjectPage(html: string, code: string): CoursePrereqs | null {
  const want = bare(code);
  const blocks = [...html.matchAll(BLOCK)].map((m) => ({ body: m[1], codes: blockCodes(m[1]) }));

  for (const { body, codes } of blocks) {
    const printed = codes.find((c) => bare(c) === want);
    if (printed) return asCourse(printed, body);
  }

  // Not listed under that code. It may be listed under a new one that says
  // what it was formerly called. The answer is keyed to the code asked about,
  // because that is the code the agreement names and the plan looks up.
  for (const { body, codes } of blocks) {
    if (codes.length === 0) continue;
    const course = asCourse(codes[0], body);
    if (course?.formerly.some((f) => bare(f) === want)) {
      return { ...course, code: normalizeCourseCode(code) };
    }
  }

  return null;
}
