import type { CoursePrereqs } from './types';
import { normalizeCourseCode } from './normalize';
import { codesFromText, formerlyCodes, stripHtml } from './text';

// Reads prerequisites out of an eLumen catalog.
//
// eLumen is a curriculum system a good number of California community
// colleges publish their catalogs through, each at its own tenant,
// <college>.elumenapp.com. The catalog page there is an empty shell that a
// script fills in from one shared API, and that API answers a plain GET with
// no token, so it is read directly:
//
//   GET https://api-prod.elumenapp.com/catalog/sites/publish
//         ?tenant=mission.elumenapp.com&api=https://api-prod.elumenapp.com:443
//
// answers with the tenant's default site, which is the catalog year they are
// currently publishing under. Its id is whatever the college named it, "24-25"
// at Mission and "2026-27" at Antelope Valley and just "catalog" at Santiago
// Canyon, so it has to be read from the answer rather than guessed. Then
//
//   GET https://api-prod.elumenapp.com/catalog/sites/publish/content/24-25,course,cis007
//         ?tenant=mission.elumenapp.com
//
// answers with the course as an HTML fragment, or with an empty body for a
// course the catalog does not have. The slug is the course code in lower case
// with its spaces removed: CIS 007 is cis007, BIO 001AH is bio001ah.
//
// Requisites are prose, in a card under a "Course Advisory and Requisites"
// heading, and colleges' templates differ in everything but the words:
//
//   <p>Prerequisite: BIO 001A or BIO 001AH</p>
//   Prerequisite: Completion of MATH 140 or MATH 149 or placement by multiple measures.
//
// So the label is found in the text and the codes read out of the sentence
// after it. eLumen's "Advisory" is advice rather than a gate, the same thing
// CourseLeaf colleges call recommended preparation, and is kept as that.

const API = 'https://api-prod.elumenapp.com';

export const elumenSiteUrl = (tenant: string): string =>
  `${API}/catalog/sites/publish?tenant=${encodeURIComponent(tenant)}&api=${encodeURIComponent(`${API}:443`)}`;

export const elumenSlug = (code: string): string =>
  code
    .replace(/[   ]/g, ' ')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();

export const elumenCourseUrl = (tenant: string, site: string, code: string): string =>
  `${API}/catalog/sites/publish/content/${encodeURIComponent(site)},course,${elumenSlug(code)}?tenant=${encodeURIComponent(tenant)}`;

// Every URL a course might live at, best first.
//
// A college that has revised a course publishes the revision under a
// versioned slug and, sometimes, nothing under the plain one: Porterville's
// ACCT P120 answers only as acctp120v2, and Solano's NURS 103 as nurs103v2.
// The plain slug is tried first because it is right nearly everywhere, and an
// empty answer costs nothing.
export const elumenCourseUrls = (tenant: string, site: string, code: string): string[] =>
  ['', 'v2', 'v3', 'v4'].map(
    (version) =>
      `${API}/catalog/sites/publish/content/${encodeURIComponent(site)},course,${elumenSlug(code)}${version}?tenant=${encodeURIComponent(tenant)}`,
  );

// The site id is the first segment of the bar URL the tenant's root page is
// published under: "24-25/cataloghome" names site "24-25".
export function parseElumenSite(json: string): string | null {
  try {
    const body = JSON.parse(json) as { barUrl?: string };
    const site = body.barUrl?.split('/')[0]?.trim();
    return site || null;
  } catch {
    return null;
  }
}

// One label and the sentence after it. Labels vary in their punctuation and
// some colleges leave the colon out altogether: Contra Costa writes
// "Prerequisite MATH120 - Intermediate Algebra". Case-sensitive on purpose,
// so "prerequisite skills" inside a course description is not a label.
const LABEL = /\b(Prerequisite|Corequisite|Advisory)(?:\(s\))?s?\s*:?/g;

type Kind = 'prerequisites' | 'corequisites' | 'recommended';

const KIND: Record<string, Kind> = {
  prerequisite: 'prerequisites',
  corequisite: 'corequisites',
  advisory: 'recommended',
};

// `code` is the course that was asked for, because eLumen's templates put the
// code in different places on the page and the caller already knows it. An
// empty body is a course the catalog does not have.
export function parseElumenCourse(html: string, code: string): CoursePrereqs | null {
  if (!html.trim()) return null;

  const text = stripHtml(html);

  const found: CoursePrereqs = {
    code: normalizeCourseCode(code),
    prerequisites: [],
    corequisites: [],
    recommended: [],
    formerly: formerlyCodes(text).map(normalizeCourseCode),
  };
  const labels = [...text.matchAll(LABEL)];

  labels.forEach((label, i) => {
    const kind = KIND[label[1].toLowerCase()];
    if (!kind) return;

    // Up to the next label, so "Prerequisite: X Advisory: Y" does not credit
    // Y to the prerequisite. codesFromText then stops at the sentence end.
    const from = label.index + label[0].length;
    const to = labels[i + 1]?.index ?? text.length;

    for (const raw of codesFromText(text.slice(from, to))) {
      const course = normalizeCourseCode(raw);
      // A course is not its own prerequisite, and a catalog that says so
      // would deadlock the scheduler rather than order it.
      if (course && course !== found.code && !found[kind].includes(course)) {
        found[kind].push(course);
      }
    }
  });

  return found;
}
