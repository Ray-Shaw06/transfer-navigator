import { canonicalCourseKey } from '../catalog/normalize';
import { normalizeNocccd, NOC_CAMPUS_COLLEGE, type NocCourse, type NocSection } from './nocccd';
import type { Season, TermChoice } from './pccServer';
import type { Section } from './types';

// Server only. Reads schedule.nocccd.edu's published JSON, the same files the
// district's own search page loads. A term's sections.json is about 9 MB, so it
// is kept in memory and only the requested courses go back to the browser.

const BASE = 'https://schedule.nocccd.edu/data';
const TTL_MS = 10 * 60 * 1000;

type TermRow = { termCode: string; termDesc: string };

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}/${path}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`NOCCCD schedule answered ${response.status}`);
  return (await response.json()) as T;
}

let termsCache: { at: number; terms: TermRow[] } | null = null;
async function listTerms(): Promise<TermRow[]> {
  if (termsCache && Date.now() - termsCache.at < TTL_MS) return termsCache.terms;
  const terms = await getJson<TermRow[]>('terms.json');
  termsCache = { at: Date.now(), terms };
  return terms;
}

// The district names a term by its description ("Fall 2026", "Winter/Spring
// 2027") and runs a separate NOCE term that is not credit work and is skipped.
function termFits(desc: string, season: Season, year: number): boolean {
  if (/NOCE/i.test(desc) || !desc.includes(String(year))) return false;
  if (season === 'Winter' || season === 'Spring') return /Winter\/Spring/i.test(desc) || desc.includes(season);
  return desc.includes(season);
}

// The requested term, or the same season one or two years earlier, shown as an
// estimate. Only the terms the district currently lists exist, so a plan far
// ahead may find none.
export async function chooseNocTerm(season: Season, year: number): Promise<TermChoice | null> {
  const terms = await listTerms();
  for (let back = 0; back <= 2; back++) {
    const hit = terms.find((t) => termFits(t.termDesc, season, year - back));
    if (hit) {
      return {
        code: hit.termCode,
        label: `${season} ${year - back}`,
        estimate: back > 0,
        part: season,
      };
    }
  }
  return null;
}

const cache = new Map<string, { at: number; sections: NocSection[]; courses: NocCourse[] }>();
const inFlight = new Map<string, Promise<{ sections: NocSection[]; courses: NocCourse[] }>>();

async function load(code: string) {
  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  const pending = inFlight.get(code);
  if (pending) return pending;
  const run = Promise.all([
    getJson<NocSection[]>(`${code}/sections.json`),
    getJson<NocCourse[]>(`${code}/courses.json`),
  ])
    .then(([sections, courses]) => {
      cache.set(code, { at: Date.now(), sections, courses });
      return { sections, courses };
    })
    .finally(() => inFlight.delete(code));
  inFlight.set(code, run);
  return run;
}

export async function nocSectionsFor(term: TermChoice, college: number, courses: string[]): Promise<Section[]> {
  const campus = Object.entries(NOC_CAMPUS_COLLEGE).find(([, id]) => id === college)?.[0];
  if (!campus) return [];
  const { sections, courses: catalog } = await load(term.code);
  const part = term.part === 'Winter' || term.part === 'Spring' ? term.part : undefined;
  const wanted = new Set(courses.map(canonicalCourseKey));
  return normalizeNocccd(sections, catalog, campus, part).filter((s) => wanted.has(canonicalCourseKey(s.course)));
}
