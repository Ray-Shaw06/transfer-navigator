import { courseLeafUrl, parseCourseLeafCourse } from './courseleaf';
import { catalogFor } from './registry';
import { catalogSpellings, normalizeCourseCode } from './normalize';
import type { CoursePrereqs } from './types';

// Server-side catalog client. Like the ASSIST client beside it, this must
// never reach a browser bundle: college catalogs send no CORS headers, so a
// browser fetch cannot read one.

// Catalogs are published once a year and then sit still, so a miss is cheap
// and a hit is worth a lot. The real ceiling on load is the CDN cache in
// front of the route, not this.
const TIMEOUT_MS = 8000;

// Enough to keep a plan's worth of lookups quick without opening a dozen
// sockets to one college at once. A plan holds ten or so courses.
const CONCURRENCY = 6;

async function fetchOne(host: string, code: string): Promise<CoursePrereqs | null> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(courseLeafUrl(host, code), { signal: control.signal });
    if (!response.ok) return null;
    return parseCourseLeafCourse(await response.text());
  } catch {
    // A catalog that is slow, moved, or down is not an error a student needs
    // to see. The planner falls back to reading order from course numbers,
    // which is what it did before any of this existed.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Look up what a college's catalog says has to come before what, for exactly
// the courses asked about.
//
// Returns an empty result rather than throwing for a college with no catalog
// entry, so every caller has one code path: order by what came back, and fall
// back where nothing did.
export async function prereqsFor(
  college: number,
  codes: string[],
): Promise<{ supported: boolean; courses: CoursePrereqs[] }> {
  const source = catalogFor(college);
  if (!source) return { supported: false, courses: [] };

  // Deduplicated on the normalised code so MATH 005A and MATH 5A are asked
  // about once, but FETCHED with the spelling the caller gave, because that is
  // the one the catalog answers to.
  const wanted: string[] = [];
  const seen = new Set<string>();
  for (const code of codes) {
    const key = normalizeCourseCode(code);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    wanted.push(code.trim());
  }

  const found: CoursePrereqs[] = [];

  // A plain worker pool. Each worker takes the next index until they run out,
  // so one slow course cannot hold up the rest.
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= wanted.length) return;
      for (const spelling of catalogSpellings(wanted[i])) {
        const course = await fetchOne(source.host, spelling);
        if (course) {
          found.push(course);
          break;
        }
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, wanted.length) }, worker));

  // Sorted so the same request gives the same bytes, which is what lets the
  // response be cached and compared.
  found.sort((a, b) => a.code.localeCompare(b.code));
  return { supported: true, courses: found };
}
