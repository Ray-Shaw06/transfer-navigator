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
// General Education Breadth Requirements, CSU Executive Order 1100 Revised
// (23 August 2017), Article 4 "Subject Area Distribution" and Article 2.2.1.
// Read from the Internet Archive's copy, because calstate.edu now serves that
// document only behind a human-verification check:
// https://web.archive.org/web/2018/http://www.calstate.edu/EO/EO-1100-rev-8-23-17.html
//
// WHY THE COUNTS BELOW ARE LOWER THAN THE ONES IN THAT DOCUMENT. EO 1100
// states each area's FULL requirement, part of which is upper-division work
// taken after transfer. Article 2.2.1: campus requirements "shall not exceed
// the requirements for 39 lower-division and 9 upper-division semester-units",
// and Article 2.2.3 puts those 9 upper-division units at 3 semester units each
// in Areas B, C and D. A community college certifies the lower-division part,
// which is what this pattern describes, so Areas B, C and D are each three
// semester units smaller here than in the executive order:
//
//   Area A  9 units, all lower-division    -> A1, A2, A3, one course each
//   Area B  12 - 3 upper = 9 lower         -> one each B1, B2, B4, plus the lab
//   Area C  12 - 3 upper = 9 lower         -> three courses, one each C1 and C2
//   Area D  12 - 3 upper = 9 lower         -> three courses, two disciplines
//   Area E  3 units, all lower-division    -> one course
//                                             39 lower-division units
//
// AREA F IS NOT IN EO 1100. Ethnic Studies was added afterwards by AB 1460
// (2020) and is codified at California Education Code section 89032. ICAS
// records its size in IGETC Standards 2.4 section 10.7.2: "This
// lower-division, 3 semester (4 quarter) unit requirement fulfills CSU
// Education Code Section 89032." So the pattern is 39 units across Areas A to
// E plus 3 for Area F.

const CSUGE: Pattern = {
  key: 'CSUGE',
  listType: 'CSUGE',
  name: 'CSU GE-Breadth',
  blurb:
    'For students with catalog rights before Fall 2025 who are transferring to a CSU. Certified by your college and accepted by every CSU campus.',
  citation: 'CSU EO 1100 Revised, 2017, article 4, plus Education Code 89032 for Area F',
  citationUrl:
    'https://web.archive.org/web/2018/http://www.calstate.edu/EO/EO-1100-rev-8-23-17.html',
  totalCourses: 14,
  // 39 lower-division units across Areas A to E, plus Area F's 3.
  totalSemesterUnits: 42,
  labArea: 'B3',
  dualCertify: {
    note: 'The laboratory is associated with one of the Area B science courses rather than being a course of its own.',
    areas: ['B3'],
  },
  areas: [
    { id: 'A1', label: 'Oral Communication', courses: 1, from: ['A1'] },
    { id: 'A2', label: 'Written Communication', courses: 1, from: ['A2'] },
    { id: 'A3', label: 'Critical Thinking', courses: 1, from: ['A3'] },
    {
      id: 'B',
      label: 'Scientific Inquiry and Quantitative Reasoning',
      courses: 3,
      from: ['B1', 'B2', 'B4'],
      atLeast: [
        { code: 'B1', courses: 1 },
        { code: 'B2', courses: 1 },
        { code: 'B4', courses: 1 },
      ],
      caveat: 'one science course must carry a laboratory',
    },
    {
      id: 'C',
      label: 'Arts and Humanities',
      courses: 3,
      from: ['C1', 'C2'],
      atLeast: [
        { code: 'C1', courses: 1 },
        { code: 'C2', courses: 1 },
      ],
    },
    {
      // ASSIST tags these with the discipline subcodes D0 to D9 as well as
      // the bare D, which is how the two-disciplines rule is stated.
      id: 'D',
      label: 'Social Sciences',
      courses: 3,
      from: ['D', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'],
      caveat: 'from at least two different disciplines',
    },
    { id: 'E', label: 'Lifelong Learning and Self-Development', courses: 1, from: ['E'] },
    { id: 'F', label: 'Ethnic Studies', courses: 1, from: ['F'] },
  ],
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
