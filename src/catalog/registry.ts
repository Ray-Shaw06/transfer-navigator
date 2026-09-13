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
  // CourseLeaf only. The path of a subject's own page, with {subject} where
  // the lower-case subject goes, read when the course endpoint answers a
  // course with nothing. At Pasadena that endpoint skips every course under
  // the new statewide common numbering, ENGL C1000 among them, while the
  // subject page lists them. Set only where such a page was seen to exist;
  // half the CourseLeaf colleges have none at any guessable path.
  subjectPage?: string;
  // CourseLeaf only. True where the course endpoint answers an empty document
  // for every course, so it is not asked and the subject page is read first.
  // Several colleges run CourseLeaf that way; their subject pages carry the
  // requisites the endpoint does not.
  subjectPageOnly?: true;
  // eLumen only. The catalog year the tenant publishes under, when it has to
  // be pinned because the tenant publishes more than one and its own default
  // lookup fails on the ambiguity. Read off the link the college's own website
  // carries, and so a year old the day the college moves on; `npm run
  // catalog:verify` cannot tell a pinned year from a current one, so these
  // want a look each summer. Left off where the tenant resolves it itself.
  site?: string;
};

export const CATALOGS: CatalogSource[] = [
  { college: 19, name: 'Victor Valley College', platform: 'courseleaf', host: 'catalog.vvc.edu', subjectPage: '/course-descriptions/{subject}/' },
  { college: 49, name: 'Pasadena City College', platform: 'courseleaf', host: 'curriculum.pasadena.edu', subjectPage: '/course-descriptions/{subject}/' },
  { college: 51, name: 'Foothill College', platform: 'courseleaf', host: 'catalog.foothill.edu', subjectPage: '/courses-az/{subject}/' },
  { college: 53, name: 'Mt. San Jacinto College', platform: 'courseleaf', host: 'catalog.msjc.edu', subjectPage: '/courses/{subject}/' },
  { college: 74, name: 'Orange Coast College', platform: 'courseleaf', host: 'catalog.cccd.edu' },
  // Moorpark, Oxnard and Ventura are one district publishing one catalog. Its
  // courses carry the district's own M prefix and its prerequisites are stated
  // district-wide, so all three colleges read the same host correctly.
  { college: 87, name: 'Oxnard College', platform: 'courseleaf', host: 'catalog.vcccd.edu' },
  { college: 95, name: 'Ventura College', platform: 'courseleaf', host: 'catalog.vcccd.edu' },
  { college: 139, name: 'Moorpark College', platform: 'courseleaf', host: 'catalog.vcccd.edu' },
  // Monterey Peninsula, catalog.mpc.edu, is CourseLeaf and parsed cleanly
  // when first checked, and now answers every request with an AWS WAF bot
  // challenge (HTTP 202, x-amzn-waf-action: challenge). Whether that is
  // permanent or was tripped by the checking is not known, and a challenge is
  // not something to build around. Left out until `npm run catalog:verify`
  // passes it again.
  { college: 136, name: 'San Jose City College', platform: 'courseleaf', host: 'catalog.sjcc.edu' },

  // CourseLeaf colleges whose course endpoint answers nothing for any course.
  // Their subject pages carry the requisites, in an older template that puts
  // the code at the start of the title. Cypress and Fullerton are one district
  // catalog with a college prefix on every path.
  { college: 6, name: 'College of the Sequoias', platform: 'courseleaf', host: 'catalog.cos.edu', subjectPage: '/course-descriptions/{subject}/', subjectPageOnly: true },
  { college: 30, name: 'College of the Desert', platform: 'courseleaf', host: 'catalog.collegeofthedesert.edu', subjectPage: '/courses/{subject}/', subjectPageOnly: true },
  { college: 71, name: 'Cypress College', platform: 'courseleaf', host: 'catalog.nocccd.edu', subjectPage: '/cypress-college/course-descriptions/{subject}/', subjectPageOnly: true },
  { college: 73, name: 'Napa Valley College', platform: 'courseleaf', host: 'catalog.napavalley.edu', subjectPage: '/courses/{subject}/', subjectPageOnly: true },
  { college: 93, name: 'Sierra College', platform: 'courseleaf', host: 'catalog.sierracollege.edu', subjectPage: '/courses/{subject}/', subjectPageOnly: true },
  { college: 131, name: 'San Bernardino Valley College', platform: 'courseleaf', host: 'catalog.valleycollege.edu', subjectPage: '/courses/{subject}/', subjectPageOnly: true },
  { college: 134, name: 'Fullerton College', platform: 'courseleaf', host: 'catalog.nocccd.edu', subjectPage: '/fullerton-college/course-descriptions/{subject}/', subjectPageOnly: true },
  { college: 2, name: 'Evergreen Valley College', platform: 'courseleaf', host: 'catalog.evc.edu', subjectPage: '/course-descriptions-information/course-descriptions/{subject}/', subjectPageOnly: true },
  { college: 62, name: 'Mount San Antonio College', platform: 'courseleaf', host: 'catalog.mtsac.edu', subjectPage: '/programs/coursesaz/{subject}/', subjectPageOnly: true },
  { college: 92, name: 'Santa Barbara City College', platform: 'courseleaf', host: 'catalog.sbcc.edu', subjectPage: '/course-descriptions/{subject}/', subjectPageOnly: true },
  { college: 104, name: 'Cerritos College', platform: 'courseleaf', host: 'cerritos-public.courseleaf.com', subjectPage: '/degrees-certificates-courses/course-descriptions/{subject}/', subjectPageOnly: true },

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
