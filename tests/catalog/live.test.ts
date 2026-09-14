import { describe, it, expect } from 'vitest';
import { CATALOGS, type CatalogSource } from '../../src/catalog/registry';
import {
  courseLeafSubjectUrl,
  courseLeafUrl,
  parseCourseLeafCourse,
  parseCourseLeafSubjectPage,
  subjectPageCodes,
} from '../../src/catalog/courseleaf';
import {
  elumenCourseUrls,
  elumenSiteUrl,
  parseElumenCourse,
  parseElumenSite,
} from '../../src/catalog/elumen';
import type { CoursePrereqs } from '../../src/catalog/types';

// Checks that every college in the registry still answers, and that its
// prerequisites still come back THROUGH THE PARSER IN THIS REPO.
//
// Off by default because it talks to ten colleges' web servers. Run it with
// CHECK_CATALOGS=1 before adding a college and after a catalog year rolls
// over.
//
// It uses the real parser rather than its own regexes on purpose. An earlier
// version of this check had its own, looser ones, and reported Orange Coast as
// working on the strength of course codes that turned out to be links inside a
// course description: "(C-ID CHEM 110 and CHEM 120S when combined with
// CHEM 001B)" is prose, not a requisite. A verification that can pass where
// the parser fails is worse than none, because it certifies the wrong thing.
//
// The two failures it exists to catch are quiet ones. A host that has moved
// answers nothing. A host that has changed its markup answers a course with no
// requisites in it, which looks exactly like a course that has none. Neither
// surfaces as an error in the app, because a college with no readable catalog
// is a supported state: the plan falls back to reading order from course
// numbers and says so.
const enabled = process.env.CHECK_CATALOGS === '1';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const get = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(15000),
    });
    return response.ok ? await response.text() : '';
  } catch {
    return '';
  }
};

// The catalog's own course search, used to find codes that really exist rather
// than guessing a spelling. Colleges differ: MATH 005A at Pasadena, MATH 12 at
// Foothill, MATH-105 at Mt. San Jacinto.
const search = async (host: string, subject: string): Promise<string[]> => {
  try {
    const response = await fetch(`https://${host}/course-search/api/?page=fose&route=search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ other: { srcdb: '' }, criteria: [{ field: 'keyword', value: subject }] }),
      signal: AbortSignal.timeout(20000),
    });
    const body = (await response.json()) as { results?: { code: string }[] };
    return (body.results ?? []).map((r) => r.code);
  } catch {
    return [];
  }
};

it('reports whether the live catalog check ran', () => {
  if (!enabled) {
    console.warn(
      'CATALOG CHECK SKIPPED: set CHECK_CATALOGS=1 to verify the registry against the colleges themselves. The hosts were NOT contacted in this run.',
    );
  }
  expect(typeof enabled).toBe('boolean');
});

// eLumen has no search to ask, so real codes are found by trying the ones
// colleges commonly use. Broad on purpose: an eLumen college answers an
// unknown slug with an empty body, which costs nothing.
const COMMON = [
  // The statewide codes first: every college has them and most of them state
  // a prerequisite.
  'STAT C1000', 'PSYC C1000', 'ENGL C1001', 'MATH C2210', 'ECON C2001',
  'MATH 1A', 'MATH 1B', 'MATH 2', 'MATH 3A', 'MATH 5A', 'MATH 8', 'MATH 16', 'MATH 20',
  'MATH 001A', 'MATH 005A', 'MATH 100',
  'MATH 110', 'MATH 120', 'MATH 150', 'MATH 171', 'MATH 172', 'MATH 180', 'MATH 191', 'MATH 192',
  'CHEM 1A', 'CHEM 1B', 'CHEM 001A', 'CHEM 101', 'CHEM 110', 'CHEM 120', 'CHM 001A', 'CHM 001B',
  'BIO 1A', 'BIO 001A', 'BIO 001B', 'BIOL 101', 'BIOL 304', 'PHYS 4A', 'PHYS 101', 'PHYS 221',
  'CIS 1', 'CS 1', 'CIS 001', 'ENGL 1A', 'ENGL 001A', 'ENGL C1000',
  // Marin, Siskiyous, Palo Verde, Solano and Porterville each number
  // differently again.
  'MATH 121', 'MATH 122', 'MATH 123', 'CHEM 131', 'CHEM 132', 'MATH 1400', 'MFG 1240',
  'CHEM 1000', 'BIO 101', 'BIO 111', 'PSYC 004', 'MATH 020', 'CHEM 001', 'MATH P101',
  'CHEM P101A', 'ACCT P120',
  // Lake Tahoe writes MAT, Cabrillo CHEM 3.
  'MAT 154A', 'MAT 103', 'MAT 152', 'CHEM 3', 'CHEM 1A', 'PHYS 4A',
];

// One course from one registry entry, through the reader for its platform.
const readOne = async (
  entry: CatalogSource,
  site: string | null,
  code: string,
): Promise<CoursePrereqs | null> => {
  if (entry.platform === 'elumen') {
    if (!site) return null;
    // The plain slug only. The client also tries versioned slugs for a
    // revised course, but this check needs one course that answers, not every
    // course, and four requests per miss over eighty codes is what made the
    // Siskiyous check run out of time.
    const [url] = elumenCourseUrls(entry.host, site, code);
    return parseElumenCourse(await get(url), code);
  }
  return parseCourseLeafCourse(await get(courseLeafUrl(entry.host, code)));
};

describe.skipIf(!enabled)('every college in the registry', () => {
  for (const entry of CATALOGS) {
    it(`${entry.name} answers and its prerequisites parse`, { timeout: 420000 }, async () => {
      let site: string | null = null;
      const codes: string[] = [];

      if (entry.platform === 'elumen') {
        site = entry.site ?? parseElumenSite(await get(elumenSiteUrl(entry.host)));
        expect(site, `${entry.host} did not resolve a catalog site`).not.toBeNull();
        codes.push(...COMMON);
      } else if (entry.subjectPageOnly) {
        // No course endpoint to speak of. The subject page is the source, so
        // its own codes are the ones to try, read back through the parser.
        const page = await get(courseLeafSubjectUrl(entry.host, entry.subjectPage!, 'MATH 1'));
        expect(page.length, `${entry.host} mathematics subject page is empty`).toBeGreaterThan(0);
        let withRequisites = 0;
        const listed = subjectPageCodes(page);
        expect(listed.length, `${entry.host} subject page lists no courses the reader can see`).toBeGreaterThan(0);
        for (const code of listed) {
          const parsed = parseCourseLeafSubjectPage(page, code);
          if (parsed && (parsed.prerequisites.length > 0 || parsed.corequisites.length > 0)) withRequisites++;
          if (withRequisites >= 2) break;
        }
        expect(withRequisites, `${entry.host} subject page has no requisites the parser can read`).toBeGreaterThan(0);
        return;
      } else {
        for (const subject of ['CHEM', 'MATH', 'BIOL', 'PHYS', 'ENGL']) {
          codes.push(...(await search(entry.host, subject)));
          if (codes.length > 30) break;
        }
        expect(codes.length, `${entry.host} returned no courses from its own search`).toBeGreaterThan(0);
      }

      let answered = 0;
      const withRequisites: string[] = [];
      for (const code of codes.slice(0, 80)) {
        const parsed = await readOne(entry, site, code);
        if (!parsed) continue;
        answered++;
        if (parsed.prerequisites.length > 0 || parsed.corequisites.length > 0) {
          withRequisites.push(`${parsed.code} <- ${parsed.prerequisites.join(', ')}`);
        }
        if (withRequisites.length >= 2) break;
        await new Promise((r) => setTimeout(r, 120));
      }

      expect(answered, `${entry.host} answered no course this parser could read`).toBeGreaterThan(0);
      expect(
        withRequisites.length,
        `${entry.host} answered ${answered} courses and no requisites parsed from any of them`,
      ).toBeGreaterThan(0);
    });
  }
});

// The course a CourseLeaf endpoint most often refuses is the one every
// transfer student takes, so the subject-page fallback is checked on it
// wherever a page is registered.
describe.skipIf(!enabled)('the subject-page fallback', () => {
  for (const entry of CATALOGS.filter((c) => c.platform === 'courseleaf' && c.subjectPage && !c.subjectPageOnly)) {
    it(`${entry.name} serves ENGL C1000 from its subject page`, { timeout: 60000 }, async () => {
      const page = await get(courseLeafSubjectUrl(entry.host, entry.subjectPage!, 'ENGL C1000'));
      expect(page.length, `${entry.host} subject page is empty`).toBeGreaterThan(0);
      const parsed = parseCourseLeafSubjectPage(page, 'ENGL C1000');
      expect(parsed, `${entry.host} subject page does not list ENGL C1000`).not.toBeNull();
    });
  }
});
