import { canonicalCourseKey } from '../catalog/normalize';
import { normalizeBanner9, type B9Row } from './banner9';
import type { Season, TermChoice } from './pccServer';
import type { Section } from './types';

// Server only. Talks to a college's Banner 9 public class search the way its
// own "Browse Classes" page does: pick a term, which starts an anonymous
// session, then search by subject. No login. Requests identify this site.

type HostConfig = {
  host: string;
  // Campus labels that belong to this college, for a district whose colleges
  // share one Banner. Absent means every campus is the one college.
  campusPrefixes?: string[];
};

export const BANNER9_HOSTS: Record<number, HostConfig> = {
  139: { host: 'ssb.vcccd.edu', campusPrefixes: ['Moorpark College'] },
  87: { host: 'ssb.vcccd.edu', campusPrefixes: ['Oxnard College'] },
  95: { host: 'ssb.vcccd.edu', campusPrefixes: ['Ventura College'] },
  84: { host: 'reg-prod.ec.kccd.edu', campusPrefixes: ['BC '] },
  9: { host: 'reg-prod.ec.kccd.edu', campusPrefixes: ['CC '] },
  125: { host: 'reg-prod.ec.kccd.edu', campusPrefixes: ['Por'] },
  74: { host: 'reg-prod.ec.cccd.edu', campusPrefixes: ['Orange Coast'] },
  55: { host: 'reg-prod.ec.cccd.edu', campusPrefixes: ['Golden West'] },
  105: { host: 'reg-prod.ec.cccd.edu', campusPrefixes: ['Coastline'] },
  121: { host: 'ssb.avc.edu' },
  97: { host: 'ssb.citruscollege.edu' },
  72: { host: 'reg-prod.ec.gavilan.edu' },
  110: { host: 'ssb.hancockcollege.edu' },
  62: { host: 'prodrg.mtsac.edu' },
};

const TTL_MS = 10 * 60 * 1000;
const PAGE = 500;
const HEADERS = { 'User-Agent': 'TransferNavigator/1.0 (+https://transfer-navigator.vercel.app)' };

const base = (host: string) => `https://${host}/StudentRegistrationSsb/ssb`;

type TermRow = { code: string; description: string };
const termCache = new Map<string, { at: number; terms: TermRow[] }>();

async function listTerms(host: string): Promise<TermRow[]> {
  const hit = termCache.get(host);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.terms;
  const response = await fetch(`${base(host)}/classSearch/getTerms?searchTerm=&offset=1&max=60`, {
    headers: HEADERS,
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`${host} terms answered ${response.status}`);
  const terms = (await response.json()) as TermRow[];
  termCache.set(host, { at: Date.now(), terms });
  return terms;
}

// A term's description is free text: "Spring 2027", "Winter/Spring 2027 (View
// Only)", "Intersession 2027". A term is a match when it names the year and the
// season, and a combined Winter/Spring term answers either.
function termFits(description: string, season: Season, year: number): boolean {
  if (!description.includes(String(year))) return false;
  switch (season) {
    case 'Winter':
      return /Winter|Intersession/i.test(description);
    case 'Spring':
      return /Spring/i.test(description);
    case 'Summer':
      return /Summer/i.test(description);
    case 'Fall':
      return /Fall/i.test(description);
  }
}

export async function chooseBannerTerm(college: number, season: Season, year: number): Promise<TermChoice | null> {
  const cfg = BANNER9_HOSTS[college];
  if (!cfg) return null;
  const terms = await listTerms(cfg.host);
  for (let back = 0; back <= 2; back++) {
    const hit = terms.find((t) => termFits(t.description, season, year - back));
    if (hit) return { code: hit.code, label: `${season} ${year - back}`, estimate: back > 0 };
  }
  return null;
}

// Choosing a term is what starts the session, and the session is what the
// search needs. Returns the cookies to send back.
async function openSession(host: string, term: string): Promise<string> {
  const response = await fetch(`${base(host)}/term/search?mode=search`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ term }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`${host} term selection answered ${response.status}`);
  return response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

const subjectCache = new Map<string, { at: number; sections: Section[] }>();

async function subjectSections(host: string, term: string, subject: string, cookie: string): Promise<Section[]> {
  const key = `${host}|${term}|${subject}`;
  const hit = subjectCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.sections;

  // Page by the server's own count, not by the size asked for. A host may cap a
  // page below PAGE, and treating a short page as the last one would drop every
  // row after it: whole colleges, in a district that shares one search.
  const rows: B9Row[] = [];
  for (let guard = 0; guard < 40; guard++) {
    const query = new URLSearchParams({
      txt_subject: subject,
      txt_term: term,
      startDatepicker: '',
      endDatepicker: '',
      pageOffset: String(rows.length),
      pageMaxSize: String(PAGE),
      sortColumn: 'subjectDescription',
      sortDirection: 'asc',
    });
    const response = await fetch(`${base(host)}/searchResults/searchResults?${query}`, {
      headers: { ...HEADERS, Cookie: cookie },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`${host} search answered ${response.status}`);
    const body = (await response.json()) as { data?: B9Row[] | null; totalCount?: number };
    const page = body.data ?? [];
    rows.push(...page);
    if (page.length === 0 || rows.length >= (body.totalCount ?? 0)) break;
  }
  const sections = normalizeBanner9(rows);
  subjectCache.set(key, { at: Date.now(), sections });
  return sections;
}

// The subject is whatever precedes the first space in the code the agreement
// uses: "MATH B1A" is MATH.
const subjectOf = (code: string) => code.trim().split(/\s+/)[0];

export async function bannerSectionsFor(term: TermChoice, college: number, courses: string[]): Promise<Section[]> {
  const cfg = BANNER9_HOSTS[college];
  if (!cfg) return [];
  const subjects = [...new Set(courses.map(subjectOf))];
  const cookie = await openSession(cfg.host, term.code);
  const wanted = new Set(courses.map(canonicalCourseKey));
  const out: Section[] = [];
  for (const subject of subjects) {
    for (const s of await subjectSections(cfg.host, term.code, subject, cookie)) {
      if (!wanted.has(canonicalCourseKey(s.course))) continue;
      if (cfg.campusPrefixes && !cfg.campusPrefixes.some((p) => s.campus.startsWith(p))) continue;
      out.push(s);
    }
  }
  return out;
}
