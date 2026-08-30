// The Cal-GETC pattern: how many courses each area requires.
//
// SOURCE, and it matters that this is written down. ASSIST publishes which of
// a college's courses clear which area. It does not publish how many each area
// needs. Those counts are set by the Intersegmental Committee of the Academic
// Senates, the body AB 928 (Berman, 2021) charged with defining a single
// lower-division transfer pathway, and they are transcribed here from:
//
//   Cal-GETC Standards, Version 1.4 (July 2026), Section 2,
//   "Areas of Distribution for Cal-GETC", and the summary table following it.
//   https://icas-ca.org/wp-content/uploads/2026/07/Cal-GETC_Standards_1v4_Final_r.pdf
//   Published by ICAS: https://icas-ca.org/cal-getc/
//
// The pattern took effect Fall 2025. Students with catalog rights before then
// may still use IGETC or CSU GE Breadth, which this file does not describe.
//
// If ICAS publishes a version 1.5, this table is what needs re-checking, and
// STANDARD_VERSION below is what the interface shows so nobody has to guess
// which edition they are looking at.

export const STANDARD_VERSION = '1.4';
export const STANDARD_DATE = 'July 2026';
export const STANDARD_URL =
  'https://icas-ca.org/wp-content/uploads/2026/07/Cal-GETC_Standards_1v4_Final_r.pdf';
export const STANDARD_CITATION = `ICAS Cal-GETC Standards ${STANDARD_VERSION}, ${STANDARD_DATE}, section 2`;

export type AreaRequirement = {
  code: string;
  // How many courses the area needs. Areas are keyed by the codes ASSIST
  // itself tags courses with, which are the subareas: there is no course
  // tagged plain "1", only 1A, 1B and 1C.
  courses: number;
  // The area's own wording where it asks for more than a count, shown rather
  // than enforced. See LAB_AREA and the note on Area 4 below.
  caveat?: string;
};

// Every area a student must complete courses in, with the number of courses.
// Adds up to the 11 courses the standard's summary table states.
export const REQUIREMENTS: AreaRequirement[] = [
  { code: '1A', courses: 1 },
  { code: '1B', courses: 1 },
  { code: '1C', courses: 1 },
  { code: '2', courses: 1 },
  { code: '3A', courses: 1 },
  { code: '3B', courses: 1 },
  // "Two courses from two academic disciplines or in an interdisciplinary
  // sequence." The count is checked; the two-disciplines rule is not asserted
  // as met, only flagged when both courses come from one department, because
  // "academic discipline" is not something ASSIST states per course.
  { code: '4', courses: 2, caveat: 'from two academic disciplines' },
  { code: '5A', courses: 1 },
  { code: '5B', courses: 1 },
  { code: '6', courses: 1 },
];

// 5C is not an eleventh course. The standard says one of the two Area 5
// courses "must be associated with a one-semester or one-quarter unit
// laboratory", so it is a property one of them carries, and ASSIST tags those
// courses 5C as well as 5A or 5B. Counting 5C as its own requirement would
// invent a twelfth course nobody has to take.
export const LAB_AREA = '5C';

export const TOTAL_COURSES = REQUIREMENTS.reduce((sum, r) => sum + r.courses, 0);

// 11 courses at 3 semester units, plus the one-unit laboratory.
export const TOTAL_SEMESTER_UNITS = 34;

export const requirementFor = (code: string): AreaRequirement | undefined =>
  REQUIREMENTS.find((r) => r.code === code);
