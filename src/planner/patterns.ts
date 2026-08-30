// The three lower-division general education patterns a California community
// college student can be certified in, and how many courses each area of each
// one takes.
//
// ASSIST publishes which of a college's courses clear which area. It does not
// publish how many each area needs. Those counts come from the bodies that set
// the patterns, and every number below is transcribed from a cited document.
// Where no source could be reached, the pattern carries its areas and no
// counts, and the interface says so rather than inventing them.

export type Destination = 'UC' | 'CSU';

export type AreaRule = {
  // The area as the pattern itself names it.
  id: string;
  label: string;
  // Courses the area takes in total.
  courses: number;
  // ASSIST area codes whose courses can fill it. An area with subareas lists
  // all of them, because a course tagged 3A fills part of Area 3.
  from: string[];
  // Minimums within those subareas: IGETC Area 3 is three courses with at
  // least one Arts and at least one Humanities, which is not the same demand
  // as one of each.
  atLeast?: { code: string; courses: number }[];
  // Areas only one destination asks for. IGETC's Oral Communication is a CSU
  // requirement and its Language Other Than English is a UC one.
  onlyFor?: Destination;
  // Wording the area carries beyond a count, shown rather than enforced.
  caveat?: string;
  // An area satisfied by something other than coursework, so it is described
  // and never counted as slots.
  notCoursework?: string;
};

export type Pattern = {
  key: PatternKey;
  // The value ASSIST's transferability endpoint wants. It takes the enum
  // NAME; a number is silently ignored and returns the CSU transferable list.
  listType: string;
  name: string;
  blurb: string;
  areas: AreaRule[];
  // Undefined when the counts could not be sourced. Everything downstream
  // must treat that as "areas known, requirements unknown".
  citation?: string;
  citationUrl?: string;
  totalCourses?: number;
  totalSemesterUnits?: number;
  // The documented exception to one-course-one-area, if the pattern has one.
  dualCertify?: { note: string; areas: string[] };
  // A course carrying this area code also carries a laboratory. Cal-GETC and
  // IGETC both attach it to an Area 5 course rather than making it a course.
  labArea?: string;
};

export type PatternKey = 'CALGETC' | 'IGETC' | 'CSUGE';

// ---------------------------------------------------------------- Cal-GETC
//
// Cal-GETC Standards, Version 1.4 (July 2026), section 2, "Areas of
// Distribution for Cal-GETC", and the summary table following it.
// https://icas-ca.org/wp-content/uploads/2026/07/Cal-GETC_Standards_1v4_Final_r.pdf
// Set by the Intersegmental Committee of the Academic Senates under AB 928
// (Berman, 2021). In effect from Fall 2025.

const CALGETC: Pattern = {
  key: 'CALGETC',
  listType: 'CALGETC',
  name: 'Cal-GETC',
  blurb:
    'The single pattern for students who started at a community college in Fall 2025 or later. Accepted by every CSU and most UC campuses and programs.',
  citation: 'ICAS Cal-GETC Standards 1.4, July 2026, section 2',
  citationUrl: 'https://icas-ca.org/wp-content/uploads/2026/07/Cal-GETC_Standards_1v4_Final_r.pdf',
  totalCourses: 11,
  totalSemesterUnits: 34,
  labArea: '5C',
  dualCertify: {
    note: 'A course applied to Area 5A or 5B may also carry the one-unit laboratory.',
    areas: ['5C'],
  },
  areas: [
    { id: '1A', label: 'English Composition', courses: 1, from: ['1A'] },
    { id: '1B', label: 'Critical Thinking and Composition', courses: 1, from: ['1B'] },
    { id: '1C', label: 'Oral Communication', courses: 1, from: ['1C'] },
    { id: '2', label: 'Mathematical Concepts and Quantitative Reasoning', courses: 1, from: ['2'] },
    {
      id: '3',
      label: 'Arts and Humanities',
      courses: 2,
      from: ['3A', '3B'],
      atLeast: [
        { code: '3A', courses: 1 },
        { code: '3B', courses: 1 },
      ],
    },
    {
      id: '4',
      label: 'Social and Behavioral Sciences',
      courses: 2,
      from: ['4'],
      caveat: 'from two academic disciplines',
    },
    {
      id: '5',
      label: 'Physical and Biological Sciences',
      courses: 2,
      from: ['5A', '5B'],
      atLeast: [
        { code: '5A', courses: 1 },
        { code: '5B', courses: 1 },
      ],
      caveat: 'one must carry a laboratory',
    },
    { id: '6', label: 'Ethnic Studies', courses: 1, from: ['6'] },
  ],
};

// ------------------------------------------------------------------- IGETC
//
// IGETC Standards, Policies and Procedures, Version 2.4 (2023), section 1.1,
// "Areas of Distribution for IGETC".
// https://icas-ca.org/wp-content/uploads/2023/10/IGETC_Standards_2023_v2_4-rev1.pdf
// Also set by ICAS. Available to students with catalog rights before Fall
// 2025. The Area 4 reduction to two courses and the addition of Area 7 took
// effect for students matriculating from Fall 2023.
//
// IGETC is two patterns wearing one name: Oral Communication is a CSU-only
// requirement and Language Other Than English is a UC-only one, so what a
// student owes depends on where they are going.

const IGETC: Pattern = {
  key: 'IGETC',
  listType: 'IGETC',
  name: 'IGETC',
  blurb:
    'For students with catalog rights before Fall 2025. Accepted by every CSU and for many majors at every UC. What it asks for depends on where you are transferring.',
  citation: 'ICAS IGETC Standards 2.4, 2023, section 1.1',
  citationUrl: 'https://icas-ca.org/wp-content/uploads/2023/10/IGETC_Standards_2023_v2_4-rev1.pdf',
  labArea: '5C',
  dualCertify: {
    // Stated by ASSIST on its own IGETC list: "Per UC policy, courses listed
    // in multiple areas shall not be certified in more than one area except
    // for courses in Languages Other Than English, which can be certified in
    // both areas 3B and 6A."
    note: 'A Language Other Than English course may be certified in both Area 3B and Area 6A, and an Area 5 course may also carry the laboratory.',
    areas: ['5C', '6A'],
  },
  areas: [
    { id: '1A', label: 'English Composition', courses: 1, from: ['1A'] },
    { id: '1B', label: 'Critical Thinking and English Composition', courses: 1, from: ['1B'] },
    { id: '1C', label: 'Oral Communication', courses: 1, from: ['1C'], onlyFor: 'CSU' },
    {
      id: '2A',
      label: 'Mathematical Concepts and Quantitative Reasoning',
      courses: 1,
      from: ['2A'],
    },
    {
      // Three courses, not one of each: at least one Arts and one Humanities,
      // and a third from either.
      id: '3',
      label: 'Arts and Humanities',
      courses: 3,
      from: ['3A', '3B'],
      atLeast: [
        { code: '3A', courses: 1 },
        { code: '3B', courses: 1 },
      ],
    },
    {
      // ASSIST tags these courses with the discipline subcodes 4A to 4J as
      // well as the bare 4, which is how the two-disciplines rule is stated.
      id: '4',
      label: 'Social and Behavioral Sciences',
      courses: 2,
      from: ['4', '4A', '4B', '4C', '4D', '4E', '4F', '4G', '4H', '4I', '4J'],
      caveat: 'from two academic disciplines',
    },
    {
      id: '5',
      label: 'Physical and Biological Sciences',
      courses: 2,
      from: ['5A', '5B'],
      atLeast: [
        { code: '5A', courses: 1 },
        { code: '5B', courses: 1 },
      ],
      caveat: 'one must carry a laboratory',
    },
    {
      id: '6A',
      label: 'Language Other Than English',
      courses: 1,
      from: ['6A'],
      onlyFor: 'UC',
      notCoursework:
        'Satisfied by proficiency equivalent to two years of high school study in the same language, which a course is only one way to show.',
    },
    { id: '7', label: 'Ethnic Studies', courses: 1, from: ['7'] },
  ],
};

// ------------------------------------------------------- CSU GE Breadth
//
// NO SOURCE FOR THE COUNTS. The areas below are the ones ASSIST tags courses
// with, and the labels are ASSIST's own. How many courses or units each area
// takes is set by the CSU General Education Breadth Requirements (formerly
// Executive Order 1100 Revised), published by the CSU Chancellor's Office.
// That document sits behind a bot check that this project will not work
// around, so the counts are absent rather than guessed, exactly as Cal-GETC's
// were before the ICAS standard was in hand.
//
// To complete this: fetch the CSU General Education Breadth Requirements,
// transcribe the per-area counts here with the citation, and the rest of the
// machinery already works.

const CSUGE: Pattern = {
  key: 'CSUGE',
  listType: 'CSUGE',
  name: 'CSU GE-Breadth',
  blurb:
    'For students with catalog rights before Fall 2025 who are transferring to a CSU. Certified by your college and accepted by every CSU campus.',
  areas: [],
};

export const PATTERNS: Pattern[] = [CALGETC, IGETC, CSUGE];

export const patternFor = (key: PatternKey): Pattern =>
  PATTERNS.find((p) => p.key === key) ?? CALGETC;

// The areas a student actually owes, once their destination is known. An area
// scoped to the other segment is not their problem.
export const areasFor = (pattern: Pattern, destination: Destination | null): AreaRule[] =>
  pattern.areas.filter((a) => !a.onlyFor || !destination || a.onlyFor === destination);

// One slot per course an area takes. A subarea minimum becomes a slot that
// only that subarea can fill; whatever the area still owes becomes a slot any
// of its subareas can fill. This is what lets IGETC's "three courses, at least
// one Arts and one Humanities" be expressed without a second mechanism.
export type Slot = { area: string; eligible: string[] };

export function slotsFor(areas: AreaRule[]): Slot[] {
  const slots: Slot[] = [];

  for (const area of areas) {
    if (area.notCoursework) continue;

    let placed = 0;
    for (const minimum of area.atLeast ?? []) {
      for (let i = 0; i < minimum.courses; i++) {
        slots.push({ area: area.id, eligible: [minimum.code] });
        placed++;
      }
    }
    for (let i = placed; i < area.courses; i++) {
      slots.push({ area: area.id, eligible: area.from });
    }
  }

  return slots;
}
