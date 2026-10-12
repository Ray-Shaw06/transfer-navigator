import { canonicalCourseKey } from '../catalog/normalize';
import { normalizeSdccd, SD_CAMPUS_COLLEGE, type SdRow } from './sdccd';
import type { TermChoice, Season } from './pccServer';
import type { Section } from './types';

// Server only. Reads SDCCD's published term files, one 6 MB JSON per term, and
// keeps the normalised sections per campus in memory. Only the published files
// are read. See sdccd.ts for why the live proxy is not.

const BASE = 'https://www.sdccd.edu/docs/StudentServices/schedule';
const TTL_MS = 30 * 60 * 1000;
const DIGIT: Record<Season, string> = { Winter: '1', Spring: '3', Summer: '5', Fall: '7' };

const termCode = (season: Season, year: number) => `2${String(year % 100).padStart(2, '0')}${DIGIT[season]}`;

const known = new Map<string, { at: number; exists: boolean }>();

async function published(code: string): Promise<boolean> {
  const hit = known.get(code);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.exists;
  const response = await fetch(`${BASE}/${code}.json`, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
  const exists = response?.ok === true;
  known.set(code, { at: Date.now(), exists });
  return exists;
}

// The requested term if its file exists, otherwise the same season one year
// earlier, then two. A student planning two terms out would otherwise find
// nothing, since the newest published file is already behind.
export async function chooseSdTerm(season: Season, year: number): Promise<TermChoice | null> {
  for (let back = 0; back <= 2; back++) {
    const code = termCode(season, year - back);
    if (await published(code)) return { code, label: `${season} ${year - back}`, estimate: back > 0 };
  }
  return null;
}

const cache = new Map<string, { at: number; byCampus: Map<string, Section[]> }>();
const inFlight = new Map<string, Promise<Map<string, Section[]>>>();

async function load(code: string): Promise<Map<string, Section[]>> {
  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.byCampus;
  const pending = inFlight.get(code);
  if (pending) return pending;
  const run = fetch(`${BASE}/${code}.json`, { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`SDCCD schedule file answered ${response.status}`);
      const body = (await response.json()) as { data?: { query?: { rows?: SdRow[] } } };
      const rows = body.data?.query?.rows ?? [];
      const byCampus = new Map<string, Section[]>();
      for (const campus of Object.keys(SD_CAMPUS_COLLEGE)) byCampus.set(campus, normalizeSdccd(rows, campus));
      cache.set(code, { at: Date.now(), byCampus });
      return byCampus;
    })
    .finally(() => inFlight.delete(code));
  inFlight.set(code, run);
  return run;
}

export async function sdSectionsFor(code: string, college: number, courses: string[]): Promise<Section[]> {
  const campus = Object.entries(SD_CAMPUS_COLLEGE).find(([, id]) => id === college)?.[0];
  if (!campus) return [];
  const wanted = new Set(courses.map(canonicalCourseKey));
  return ((await load(code)).get(campus) ?? []).filter((s) => wanted.has(canonicalCourseKey(s.course)));
}
