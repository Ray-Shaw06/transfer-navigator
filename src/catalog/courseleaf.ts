import type { CoursePrereqs } from './types';
import { normalizeCourseCode } from './normalize';

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
// are read from the words instead.
//
// Bounded to the requisite's own sentence before any code is taken. The line it
// sits in continues "Cal-GETC: 5A,5C District GE: 5A,5C Advisory Level: Read: 3",
// and reading codes out of THAT would invent prerequisites from a general
// education listing. The sentence ends at the first full stop or at the next
// "Label:" that starts a different field.
const REQUISITE_TEXT = /^([^.]*?)(?=\s+[A-Z][A-Za-z-]*(?:\s+[A-Za-z-]+)?:|\.|$)/;

// A course code as a college writes one: a subject of one to four words in
// capitals, then a number, then an optional sequence letter. Anchored on a
// word boundary at both ends so "Read: 3" and a bare "5A" cannot match.
const TEXT_CODE = /\b([A-Z][A-Z&]{0,9}(?:[ -][A-Z&]{2,9}){0,2})[ -](\d{1,3}[A-Z]{0,2})\b/g;

function codesFromText(inner: string): string[] {
  const text = inner
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#160;|&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

  const sentence = REQUISITE_TEXT.exec(text)?.[1] ?? text;
  return [...sentence.matchAll(TEXT_CODE)].map((m) => `${m[1]} ${m[2]}`);
}

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
    const named = linked.length > 0 ? linked : codesFromText(section[2]);

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
