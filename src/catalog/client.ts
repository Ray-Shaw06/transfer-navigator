import {
  courseLeafSubjectUrl,
  courseLeafUrl,
  parseCourseLeafCourse,
  parseCourseLeafSubjectPage,
} from './courseleaf';
import { elumenCourseUrls, elumenSiteUrl, parseElumenCourse, parseElumenSite } from './elumen';
import { catalogFor, type CatalogSource } from './registry';
import { canonicalCourseKey, catalogSpellings, normalizeCourseCode } from './normalize';
import { statewideCandidates } from './statewide';
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

// One fetch, and whether its answer can be trusted to stay put. A catalog
// that answers 404 does not have the course, today or next year, and that
// is an answer. A catalog that timed out, refused the connection, answered
// 5xx, or put a bot challenge in front of the page may well answer properly
// next time, and nothing built on it may be cached as if it were the truth.
type Fetched = { body: string | null; shaky: boolean };

async function text(url: string): Promise<Fetched> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: control.signal });
    if (response.ok && response.status !== 202) return { body: await response.text(), shaky: false };
    return { body: null, shaky: response.status !== 404 && response.status !== 410 };
  } catch {
    // A catalog that is slow, moved, or down is not an error a student needs
    // to see. The planner falls back to reading order from course numbers,
    // which is what it did before any of this existed.
    return { body: null, shaky: true };
  } finally {
    clearTimeout(timer);
  }
}

type Get = (url: string) => Promise<string | null>;

// One course from one catalog, whichever platform it is on. `site` is only
// meaningful for eLumen, where it names the catalog year being published.
async function fetchOne(
  source: CatalogSource,
  code: string,
  site: string | null,
  get: Get,
): Promise<CoursePrereqs | null> {
  if (source.platform === 'elumen') {
    if (!site) return null;
    for (const url of elumenCourseUrls(source.host, site, code)) {
      const body = await get(url);
      const parsed = body === null ? null : parseElumenCourse(body, code);
      if (parsed) return parsed;
    }
    return null;
  }
  const body = await get(courseLeafUrl(source.host, code));
  return body === null ? null : parseCourseLeafCourse(body);
}

// Look up what a college's catalog says has to come before what, for exactly
// the courses asked about.
//
// Returns an empty result rather than throwing for a college with no catalog
// entry, so every caller has one code path: order by what came back, and fall
// back where nothing did.
// `complete` says whether every fetch behind the answer got a real answer,
// found or not found. An answer with a failure behind it is still returned,
// since a plan ordered by most of the catalog beats one ordered by none, but
// it must not be cached: the route in front of this caches for a year, and
// one blip during the site lookup would otherwise pin an empty answer to
// that plan's URL for everyone who plans it.
export type CatalogAnswer = { supported: boolean; courses: CoursePrereqs[]; complete: boolean };

export async function prereqsFor(college: number, codes: string[]): Promise<CatalogAnswer> {
  const source = catalogFor(college);
  if (!source) return { supported: false, courses: [], complete: true };

  let shaky = false;
  const get: Get = async (url) => {
    const fetched = await text(url);
    if (fetched.shaky) shaky = true;
    return fetched.body;
  };

  // Deduplicated on the normalised code so MATH 005A and MATH 5A are asked
  // about once, but FETCHED with the spelling the caller gave, because that is
  // the one the catalog answers to.
  const wanted: string[] = [];
  const seen = new Set<string>();
  for (const code of codes) {
    const key = canonicalCourseKey(code);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    wanted.push(code.trim());
  }

  // eLumen publishes under a site id the college chose, which has to be read
  // from the tenant before any course can be asked for. One request per plan,
  // and nothing to do for CourseLeaf.
  const site =
    source.platform !== 'elumen'
      ? null
      : (source.site ?? parseElumenSite((await get(elumenSiteUrl(source.host))) ?? ''));
  if (source.platform === 'elumen' && !site) return { supported: true, courses: [], complete: !shaky };

  const found: CoursePrereqs[] = [];

  // Subject pages fetched once each per request, however many of a subject's
  // courses fall through to them.
  const subjectPages = new Map<string, Promise<string | null>>();
  const subjectPage = (code: string): Promise<string | null> => {
    if (source.platform !== 'courseleaf' || !source.subjectPage) return Promise.resolve(null);
    const url = courseLeafSubjectUrl(source.host, source.subjectPage, code);
    if (!subjectPages.has(url)) subjectPages.set(url, get(url));
    return subjectPages.get(url)!;
  };

  // Statewide courses fetched once each per request, however many old codes
  // turn out to have become them.
  const statewide = new Map<string, Promise<CoursePrereqs | null>>();
  const formerly = async (code: string): Promise<CoursePrereqs | null> => {
    const want = canonicalCourseKey(code);
    for (const candidate of statewideCandidates(code)) {
      if (!statewide.has(candidate)) statewide.set(candidate, fetchOne(source, candidate, site, get));
      const course = await statewide.get(candidate)!;
      if (course?.formerly.some((f) => canonicalCourseKey(f) === want)) {
        return { ...course, code: normalizeCourseCode(code) };
      }
    }
    return null;
  };

  // A plain worker pool. Each worker takes the next index until they run out,
  // so one slow course cannot hold up the rest.
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= wanted.length) return;
      let course: CoursePrereqs | null = null;
      if (!(source.platform === 'courseleaf' && source.subjectPageOnly)) {
        for (const spelling of catalogSpellings(wanted[i])) {
          course = await fetchOne(source, spelling, site, get);
          if (course) break;
        }
      }
      // The course endpoint said nothing under any spelling. The subject page
      // may still list it.
      if (!course) {
        const page = await subjectPage(wanted[i]);
        if (page) course = parseCourseLeafSubjectPage(page, wanted[i]);
      }
      // Still nothing. The course may have been renumbered to a statewide
      // code, with the catalog listing it only under the new one and saying
      // "Formerly ECON 1B" there. Each statewide code in the subject is asked
      // for and the one that names this course is taken, keyed to the code
      // the plan asked about. See statewide.ts.
      if (!course) course = await formerly(wanted[i]);
      if (course) found.push(course);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, wanted.length) }, worker));

  // Sorted so the same request gives the same bytes, which is what lets the
  // response be cached and compared.
  found.sort((a, b) => a.code.localeCompare(b.code));
  return { supported: true, courses: found, complete: !shaky };
}
