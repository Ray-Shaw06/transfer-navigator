import { describe, it, expect } from 'vitest';
import { CATALOGS } from '../../src/catalog/registry';
import { courseLeafUrl, parseCourseLeafCourse } from '../../src/catalog/courseleaf';

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

describe.skipIf(!enabled)('every college in the registry', () => {
  for (const entry of CATALOGS) {
    it(`${entry.name} answers and its prerequisites parse`, { timeout: 180000 }, async () => {
      const codes: string[] = [];
      for (const subject of ['CHEM', 'MATH', 'BIOL', 'PHYS', 'ENGL']) {
        codes.push(...(await search(entry.host, subject)));
        if (codes.length > 30) break;
      }
      expect(codes.length, `${entry.host} returned no courses from its own search`).toBeGreaterThan(0);

      let answered = 0;
      const withRequisites: string[] = [];
      for (const code of codes.slice(0, 40)) {
        const parsed = parseCourseLeafCourse(await get(courseLeafUrl(entry.host, code)));
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
