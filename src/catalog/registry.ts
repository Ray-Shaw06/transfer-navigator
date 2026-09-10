// Which colleges' catalogs this can read, keyed by ASSIST's own college id so
// the rest of the app never has to know a college by any other name.
//
// This is a list rather than a rule because there is no rule, and it is short
// for reasons worth writing down rather than rediscovering.
//
// All 116 colleges were probed. About two dozen run CourseLeaf, the platform
// this reads, at hostnames following no pattern: catalog.<domain> for most,
// curriculum.pasadena.edu for Pasadena, and a shared district host for the
// Ventura and Coast districts. The rest run platforms this cannot read.
//
// Running CourseLeaf turned out not to be the same thing as publishing
// prerequisites. Of the CourseLeaf colleges, only the ones below actually
// state requisites in the course document; the others serve the same URL and
// say nothing in it, so listing them would buy a student nothing but a slower
// page. Each entry here was checked twice over: the host answers with a real
// course, and that course's requisites come back through the parser in this
// repo. Every ASSIST id was read back from ASSIST's own institution list.
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
  platform: 'courseleaf';
  host: string;
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
];

export const catalogFor = (college: number): CatalogSource | null =>
  CATALOGS.find((c) => c.college === college) ?? null;
