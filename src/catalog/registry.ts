// Which colleges' catalogs this can read, keyed by ASSIST's own college id so
// the rest of the app never has to know a college by any other name.
//
// This is a list rather than a rule because there is no rule, and it is short
// for reasons worth writing down rather than rediscovering.
//
// All 116 colleges were probed. About two dozen run CourseLeaf at hostnames
// following no pattern: catalog.<domain> for most, curriculum.pasadena.edu
// for Pasadena, and a shared district host for the Ventura and Coast
// districts. Fifteen publish through eLumen, each at its own tenant name.
// The rest run platforms this cannot read.
//
// Running a readable platform turned out not to be the same thing as
// publishing prerequisites. Of the CourseLeaf colleges, only the ones below
// actually state requisites in the course document; the others serve the same
// URL and say nothing in it, so listing them would buy a student nothing but a
// slower page. Of the eLumen colleges, two are left out, Mendocino and West
// Valley, whose tenants do not answer the shared API at all. Each entry here was checked twice over: the host answers with a
// real course, and that course's requisites come back through the parser in
// this repo. Every ASSIST id was read back from ASSIST's own institution list.
//
// A college that is not here is not broken. The planner falls back to reading
// order out of course numbers, which is what it did everywhere before this
// existed, and the interface says which of the two a plan was ordered by.
//
// Adding a college is one line, after `npm run catalog:verify` says its
// catalog answers and its prerequisites parse.

export type CatalogSource = {
  // ASSIST's sending-institution id, the same number the agreement routes use.
  college: number;
  name: string;
  // Which reader to use. `host` means a different thing under each: the
  // catalog's own hostname for CourseLeaf, and the college's tenant name for
  // eLumen, which is sent as a parameter to eLumen's one shared API.
  platform: 'courseleaf' | 'elumen';
  host: string;
  // eLumen only. The catalog year the tenant publishes under, when it has to
  // be pinned because the tenant publishes more than one and its own default
  // lookup fails on the ambiguity. Read off the link the college's own website
  // carries, and so a year old the day the college moves on; `npm run
  // catalog:verify` cannot tell a pinned year from a current one, so these
  // want a look each summer. Left off where the tenant resolves it itself.
  site?: string;
};

export const CATALOGS: CatalogSource[] = [
  { college: 19, name: 'Victor Valley College', platform: 'courseleaf', host: 'catalog.vvc.edu' },
  { college: 49, name: 'Pasadena City College', platform: 'courseleaf', host: 'curriculum.pasadena.edu' },
  { college: 51, name: 'Foothill College', platform: 'courseleaf', host: 'catalog.foothill.edu' },
  { college: 53, name: 'Mt. San Jacinto College', platform: 'courseleaf', host: 'catalog.msjc.edu' },
  { college: 74, name: 'Orange Coast College', platform: 'courseleaf', host: 'catalog.cccd.edu' },
  // Moorpark, Oxnard and Ventura are one district publishing one catalog. Its
  // courses carry the district's own M prefix and its prerequisites are stated
  // district-wide, so all three colleges read the same host correctly.
  { college: 87, name: 'Oxnard College', platform: 'courseleaf', host: 'catalog.vcccd.edu' },
  { college: 95, name: 'Ventura College', platform: 'courseleaf', host: 'catalog.vcccd.edu' },
  { college: 139, name: 'Moorpark College', platform: 'courseleaf', host: 'catalog.vcccd.edu' },
  { college: 133, name: 'Monterey Peninsula College', platform: 'courseleaf', host: 'catalog.mpc.edu' },
  { college: 136, name: 'San Jose City College', platform: 'courseleaf', host: 'catalog.sjcc.edu' },

  // eLumen. `host` is the tenant name, sent to eLumen's one shared API.
  { college: 10, name: 'Columbia College', platform: 'elumen', host: 'gocolumbia.elumenapp.com', site: '2026-2027-Catalog' },
  { college: 28, name: 'Contra Costa College', platform: 'elumen', host: 'ccc.elumenapp.com', site: 'ccc-2026-27' },
  { college: 32, name: 'Mission College', platform: 'elumen', host: 'mission.elumenapp.com' },
  { college: 52, name: 'Modesto Junior College', platform: 'elumen', host: 'mjc.elumenapp.com' },
  { college: 66, name: 'Santiago Canyon College', platform: 'elumen', host: 'sccollege.elumenapp.com' },
  { college: 83, name: 'College of the Redwoods', platform: 'elumen', host: 'redwoods.elumenapp.com', site: '2026-2027' },
  { college: 114, name: 'Diablo Valley College', platform: 'elumen', host: 'dvc.elumenapp.com' },
  { college: 121, name: 'Antelope Valley College', platform: 'elumen', host: 'avc.elumenapp.com' },
  { college: 4, name: 'College of Marin', platform: 'elumen', host: 'marin.elumenapp.com', site: 'current' },
  { college: 63, name: 'Palo Verde College', platform: 'elumen', host: 'pvc.elumenapp.com', site: '2025-2026' },
  { college: 94, name: 'Solano Community College', platform: 'elumen', host: 'solano.elumenapp.com' },
  { college: 102, name: 'College of the Siskiyous', platform: 'elumen', host: 'siskiyous.elumenapp.com', site: 'cos26-27catalog' },
  { college: 125, name: 'Porterville College', platform: 'elumen', host: 'porterville.elumenapp.com' },
];

export const catalogFor = (college: number): CatalogSource | null =>
  CATALOGS.find((c) => c.college === college) ?? null;
