// Which colleges' catalogs this can read, keyed by ASSIST's own college id so
// the rest of the app never has to know a college by any other name.
//
// This is a list rather than a rule because there is no rule. California's
// 116 community colleges run their catalogs on several different platforms at
// hostnames that follow no pattern: Pasadena publishes at
// curriculum.pasadena.edu, most CourseLeaf colleges at catalog.<domain>, and
// a good number use platforms this cannot read at all. Each entry below was
// checked by asking the host for a real course and seeing a real answer back.
//
// A college that is not here is not broken. The planner falls back to reading
// order out of course numbers, which is what it did everywhere before this
// existed, and the interface says which of the two a plan was ordered by.
// Adding a college is one line once its catalog has been checked.

export type CatalogSource = {
  // ASSIST's sending-institution id, the same number the agreement routes use.
  college: number;
  name: string;
  platform: 'courseleaf';
  host: string;
};

export const CATALOGS: CatalogSource[] = [
  { college: 49, name: 'Pasadena City College', platform: 'courseleaf', host: 'curriculum.pasadena.edu' },
  { college: 51, name: 'Foothill College', platform: 'courseleaf', host: 'catalog.foothill.edu' },
  { college: 62, name: 'Mount San Antonio College', platform: 'courseleaf', host: 'catalog.mtsac.edu' },
  { college: 73, name: 'Napa Valley College', platform: 'courseleaf', host: 'catalog.napavalley.edu' },
  { college: 92, name: 'Santa Barbara City College', platform: 'courseleaf', host: 'catalog.sbcc.edu' },
  { college: 93, name: 'Sierra College', platform: 'courseleaf', host: 'catalog.sierracollege.edu' },
  { college: 108, name: 'MiraCosta College', platform: 'courseleaf', host: 'catalog.miracosta.edu' },
  { college: 136, name: 'San Jose City College', platform: 'courseleaf', host: 'catalog.sjcc.edu' },
];

export const catalogFor = (college: number): CatalogSource | null =>
  CATALOGS.find((c) => c.college === college) ?? null;
