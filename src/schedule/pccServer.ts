import { canonicalCourseKey } from '../catalog/normalize';
import { normalizePcc, type PccRow } from './pcc';
import type { Section } from './types';

// Server only. Fetches Pasadena's term data and keeps the normalised result in
// memory, because a term is about 12 MB of JSON and several seconds to fetch,
// and it must never be sent to a browser whole. What a student's request gets
// back is only the sections for the courses in their term.

const API = 'https://prod-apiweb.pasadena.edu/api';
const TTL_MS = 10 * 60 * 1000;

type TermRow = { termCode: string; termName: string; termDisplayControl: string };

export type TermChoice = {
  code: string;
  label: string;
  // True when the requested term is not published yet and this is the same
  // season a year earlier, shown so the student can see the usual pattern.
  estimate: boolean;
  // For a feed that covers two seasons in one term (Winter and Spring), which
  // of them this request is for.
  part?: Season;
};

const SEASON_SUFFIX = { Winter: '10', Spring: '30', Summer: '50', Fall: '70' } as const;
export type Season = keyof typeof SEASON_SUFFIX;

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: { Accept: 'application/json' },
    // 12 MB is over what Next will store in its fetch cache, so this is never
    // cached there. The in-memory copy below is the cache.
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`PCC schedule API answered ${response.status}`);
  return (await response.json()) as T;
}

let termsCache: { at: number; terms: TermRow[] } | null = null;

async function listTerms(): Promise<TermRow[]> {
  if (termsCache && Date.now() - termsCache.at < TTL_MS) return termsCache.terms;
  const terms = await getJson<TermRow[]>('/getClassScheduleTerms');
  termsCache = { at: Date.now(), terms };
  return terms;
}

// Which term to read for a season and year. The college flags a term it has
// built but not opened with termDisplayControl "N", which is Spring 2027 as of
// October 2026. In that case the same season a year earlier stands in.
export async function chooseTerm(season: Season, year: number): Promise<TermChoice | null> {
  const terms = await listTerms();
  const published = (code: string) => terms.find((t) => t.termCode === code && t.termDisplayControl === 'Y');
  const code = `${year}${SEASON_SUFFIX[season]}`;
  const wanted = published(code);
  if (wanted) return { code, label: wanted.termName, estimate: false };
  const priorCode = `${year - 1}${SEASON_SUFFIX[season]}`;
  const prior = published(priorCode);
  return prior ? { code: priorCode, label: prior.termName, estimate: true } : null;
}

const sectionCache = new Map<string, { at: number; sections: Section[] }>();
const inFlight = new Map<string, Promise<Section[]>>();

async function termSections(code: string): Promise<Section[]> {
  const hit = sectionCache.get(code);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.sections;
  const pending = inFlight.get(code);
  if (pending) return pending;
  const load = getJson<PccRow[]>(`/classSchedule/${code}`)
    .then((rows) => {
      const sections = normalizePcc(rows);
      sectionCache.set(code, { at: Date.now(), sections });
      return sections;
    })
    .finally(() => inFlight.delete(code));
  inFlight.set(code, load);
  return load;
}

export async function sectionsFor(code: string, courses: string[]): Promise<Section[]> {
  const wanted = new Set(courses.map(canonicalCourseKey));
  return (await termSections(code)).filter((s) => wanted.has(canonicalCourseKey(s.course)));
}
