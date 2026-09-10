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

// Anything else on the line is prose about placement tests and proficiency,
// which names no course and is not a scheduling constraint.
const SECTION = /<span><strong>([^<]+?):\s*<\/strong>(.*?)<\/span>/gs;
const LINKED_CODE = /showCourse\(this,\s*'([^']+)'\)/g;

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

  for (const section of xml.matchAll(SECTION)) {
    const kind = kindOf(section[1].trim());
    if (!kind) continue;
    for (const link of section[2].matchAll(LINKED_CODE)) {
      const linked = normalizeCourseCode(link[1]);
      // A course is not its own prerequisite, and a catalog that says so
      // would deadlock the scheduler rather than order it.
      if (linked && linked !== found.code && !found[kind].includes(linked)) {
        found[kind].push(linked);
      }
    }
  }

  return found;
}

export const courseLeafUrl = (host: string, code: string): string =>
  `https://${host}/ribbit/index.cgi?page=getcourse.rjs&code=${encodeURIComponent(code)}`;
