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
  // Semester units the area takes. Usually the course count times three, but
  // not always: an Area 5 that is two courses is seven units, because one of
  // them carries a one-unit laboratory. Stated per area so the pattern total
  // is derived from sourced numbers rather than hardcoded beside them.
  semesterUnits: number;
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
  // The documented exception to one-course-one-area, if the pattern has one.
  dualCertify?: { note: string; areas: string[] };
  // A course carrying this area code also carries a laboratory. Cal-GETC and
  // IGETC both attach it to an Area 5 course rather than making it a course.
  labArea?: string;
  // The four areas of this pattern that CSU admission itself turns on. Only
  // read for a CSU-bound student; see CSU_GATE below.
  csuGate?: AdmissionGate;
  // The areas of this pattern that UC's 7-course pattern asks for. Only read
  // for a UC-bound student; see UC_GATE below. Undefined for CSU GE-Breadth,
  // which UC does not accept, so nothing on it maps to a UC requirement.
  ucGate?: UcPattern;
};

export type PatternKey = 'CALGETC' | 'IGETC' | 'CSUGE';

// -------------------------------------------------------- the Golden Four
//
// Four of a pattern's areas are not like the others when the destination is a
// CSU. Finishing the rest late costs a term; finishing these late costs the
// application, because they are an admission requirement rather than a
// certification one, and they carry a grade floor no other area does.
//
// Title 5, California Code of Regulations, section 40803(a), "Applicants Who
// Are California Residents and Who Have Completed the Prescribed Number of
// Units of College Credit", as amended 24 July 2024:
//
//   (1) Commencing with admission to the fall term 2025, has completed with a
//   grade of C- or better: courses in English composition; oral
//   communication; critical thinking and composition, and mathematical
//   concepts and quantitative reasoning at a level satisfying general
//   education requirements;
//
//   (2) For admission prior to the fall term 2025 or for those who remain in
//   attendance as defined by 5 CCR Section 40401 has completed with a grade of
//   C- or better: courses in written communication in the English language;
//   oral communication in the English language; critical thinking, and
//   mathematics or quantitative reasoning at a level satisfying general
//   education requirements;
//
// Read at https://govt.westlaw.com/calregs/Document/I8B3C7C2050BE11EFB192F93929D89113
// (the free public California Code of Regulations, current through Register
// 2026 No. 34), because calstate.edu serves its own copies of this material
// only behind a human-verification check.
//
// WHY EACH PATTERN CARRIES ITS OWN WORDING. The regulation names subjects, not
// area codes, and it names them twice in two different vocabularies. Clause
// (a)(1) uses Cal-GETC's own area titles almost verbatim, which is no accident:
// it was amended into the regulation the year Cal-GETC took effect. Clause
// (a)(2) uses the older vocabulary, which is the one IGETC and CSU GE-Breadth
// were written in, and it governs exactly the students still certified in
// those two patterns: the ones who "remain in attendance" from before Fall
// 2025. So the mapping from subject to area code is done per pattern, with the
// clause that actually applies to a student on it quoted alongside.
//
// Section 40803.1 asks the same four subjects of applicants who are not
// California residents, so nothing here depends on residency.

export type GateItem = {
  id: string;
  // The regulation's own words for the subject.
  label: string;
  // The ASSIST area code, in this pattern, that a course must carry to be it.
  code: string;
};

export type AdmissionGate = { clause: string; items: GateItem[] };

export const CSU_GATE = {
  name: 'the Golden Four',
  grade: 'C- or better',
  citation: '5 CCR § 40803(a)',
  // Cornell LII rather than the Westlaw copy this was read from. Both serve
  // the section publicly and the text was compared word for word across them;
  // LII wins only on being a clean, stable URL rather than a GUID carrying
  // session query parameters.
  citationUrl: 'https://www.law.cornell.edu/regulations/california/5-CCR-40803',
  // The rest of section 40803(a), quoted for what it is: the floor this tool
  // has always said it does not check. It still does not check any of it, but
  // stating the numbers beats sending a student away with "ask a counselor"
  // when the regulation is this short.
  minimums: [
    'at least 60 semester (90 quarter) units of transferable college credit, of which 30 semester (45 quarter) units are at a level equivalent to general education courses',
    'a grade point average of 2.0 or better across all transferable college courses attempted',
    'good standing at the last college attended',
  ],
  // Section 40803(b) and (c), which decide how much the four are worth.
  impaction:
    'Impacted campuses and programs may require supplemental admission criteria, including a higher grade point average or additional specified courses.',
  adt: 'An Associate Degree for Transfer earned at a California community college guarantees admission with junior status to the CSU, though not to any particular campus or program, and takes priority over other community college transfers.',
} as const;

// ------------------------------------------------- what UC admission asks for
//
// The CSU gate above names four courses. UC states its floor as a pattern of
// seven, and the difference matters to a student who is short of time: the two
// systems ask for different things, and neither asks for a finished general
// education pattern.
//
// Quoted from UC's own statement of the basic transfer requirements:
// https://admission.universityofcalifornia.edu/admission-requirements/transfer-requirements/preparing-to-transfer/basic-requirements.html
//
//   "Complete the following 7-course pattern by the end of the spring term
//    prior to fall enrollment at UC.
//      Two transferable courses in English composition (UC-E)
//      One transferable course in mathematical concepts and quantitative
//      reasoning (UC-M)
//      Four transferable college courses chosen from at least two of the
//      following subject areas: arts and humanities (UC-H), social and
//      behavioral sciences (UC-B), physical and biological sciences (UC-S)"
//
// The same page states the other half of the floor, none of which this tool
// checks, and the sentence that this whole feature turns on: of the general
// education requirements, "You don't need to complete these requirements
// before you transfer."
//
// Mapping the pattern onto an area list is the one step that is a reading
// rather than a quote, so it is done per pattern and written out below. It is
// a safe reading in both cases: the two composition areas of Cal-GETC and
// IGETC are the two UC-E courses, their mathematics area is UC-M, and their
// three breadth areas are UC-H, UC-B and UC-S in that order. The areas that
// fall outside the pattern are the interesting result: Ethnic Studies and, on
// IGETC, Language Other Than English are certification, not admission.

// A quota met by courses drawn from several areas at once, which is how UC
// states the breadth half of the pattern. Not the same demand as completing
// any of those areas.
export type BreadthRule = { areas: string[]; courses: number; leastAreas: number };

export type UcPattern = {
  // Area ids that must be completed in full.
  required: string[];
  breadth: BreadthRule;
};

export const UC_GATE = {
  name: 'the 7-course pattern',
  grade: 'C or better',
  citation: 'UC transfer admission requirements',
  citationUrl:
    'https://admission.universityofcalifornia.edu/admission-requirements/transfer-requirements/preparing-to-transfer/basic-requirements.html',
  minimums: [
    'at least 60 semester (90 quarter) units of UC-transferable credit, of which no more than 14 semester (21 quarter) units may be pass or credit grades',
    'a grade point average of 2.4 or better in UC-transferable courses, or 2.8 if you are not a California resident',
    'good academic standing at the last college attended',
    'the required or recommended courses for your intended major, at the minimum grades',
  ],
  // The line that makes deferring the rest of a pattern a real option rather
  // than this tool's own idea.
  certification:
    "UC states that general education requirements do not have to be finished before you transfer, and that completing IGETC or Cal-GETC may already satisfy the 7-course pattern. Certification is all or nothing, so a pattern left part-done certifies nothing: you would complete the campus's own general education requirements after you transfer instead.",
  selection:
    'Meeting the pattern makes an application eligible, not competitive. Campuses and majors screen on major preparation and on a higher grade point average than the minimum.',
} as const;

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
  labArea: '5C',
  dualCertify: {
    note: 'A course applied to Area 5A or 5B may also carry the one-unit laboratory.',
    areas: ['5C'],
  },
  // Clause (a)(1), whose four subjects are Cal-GETC's own area titles.
  csuGate: {
    clause:
      'Commencing with admission to the fall term 2025, has completed with a grade of C- or better: courses in English composition; oral communication; critical thinking and composition, and mathematical concepts and quantitative reasoning at a level satisfying general education requirements.',
    items: [
      { id: 'composition', label: 'English composition', code: '1A' },
      { id: 'oral', label: 'Oral communication', code: '1C' },
      { id: 'critical', label: 'Critical thinking and composition', code: '1B' },
      { id: 'math', label: 'Mathematical concepts and quantitative reasoning', code: '2' },
    ],
  },
  // 1A and 1B are the two UC-E composition courses; Area 2 is UC-M. Area 1C is
  // CSU's oral communication and Area 6 is Ethnic Studies, and neither appears
  // in UC's pattern.
  ucGate: {
    required: ['1A', '1B', '2'],
    breadth: { areas: ['3', '4', '5'], courses: 4, leastAreas: 2 },
  },
  areas: [
    { id: '1A', label: 'English Composition', courses: 1, semesterUnits: 3, from: ['1A'] },
    { id: '1B', label: 'Critical Thinking and Composition', courses: 1, semesterUnits: 3, from: ['1B'] },
    { id: '1C', label: 'Oral Communication', courses: 1, semesterUnits: 3, from: ['1C'] },
    {
      id: '2',
      label: 'Mathematical Concepts and Quantitative Reasoning',
      courses: 1,
      semesterUnits: 3,
      from: ['2'],
    },
    {
      id: '3',
      label: 'Arts and Humanities',
      courses: 2,
      semesterUnits: 6,
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
      semesterUnits: 6,
      from: ['4'],
      caveat: 'from two academic disciplines',
    },
    {
      id: '5',
      label: 'Physical and Biological Sciences',
      courses: 2,
      // Seven, not six: one of the two courses carries a one-unit laboratory.
      semesterUnits: 7,
      from: ['5A', '5B'],
      atLeast: [
        { code: '5A', courses: 1 },
        { code: '5B', courses: 1 },
      ],
      caveat: 'one must carry a laboratory',
    },
    { id: '6', label: 'Ethnic Studies', courses: 1, semesterUnits: 3, from: ['6'] },
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
  // Clause (a)(2), the vocabulary IGETC was written in. Area 1C is already
  // CSU-only on this pattern, which is the same fact from the other side: it
  // is there because the CSU asks for it.
  csuGate: {
    clause:
      'For admission prior to the fall term 2025 or for those who remain in attendance as defined by 5 CCR Section 40401 has completed with a grade of C- or better: courses in written communication in the English language; oral communication in the English language; critical thinking, and mathematics or quantitative reasoning at a level satisfying general education requirements.',
    items: [
      { id: 'composition', label: 'Written communication in the English language', code: '1A' },
      { id: 'oral', label: 'Oral communication in the English language', code: '1C' },
      { id: 'critical', label: 'Critical thinking', code: '1B' },
      { id: 'math', label: 'Mathematics or quantitative reasoning', code: '2A' },
    ],
  },
  // Same reading as Cal-GETC's, one area code apart: IGETC states mathematics
  // as 2A. Area 6A, the language other than English, is IGETC's own UC
  // requirement and not part of the 7-course pattern; nor is Area 7.
  ucGate: {
    required: ['1A', '1B', '2A'],
    breadth: { areas: ['3', '4', '5'], courses: 4, leastAreas: 2 },
  },
  areas: [
    { id: '1A', label: 'English Composition', courses: 1, semesterUnits: 3, from: ['1A'] },
    {
      id: '1B',
      label: 'Critical Thinking and English Composition',
      courses: 1,
      semesterUnits: 3,
      from: ['1B'],
    },
    {
      id: '1C',
      label: 'Oral Communication',
      courses: 1,
      semesterUnits: 3,
      from: ['1C'],
      onlyFor: 'CSU',
    },
    {
      id: '2A',
      label: 'Mathematical Concepts and Quantitative Reasoning',
      courses: 1,
      semesterUnits: 3,
      from: ['2A'],
    },
    {
      // Three courses, not one of each: at least one Arts and one Humanities,
      // and a third from either.
      id: '3',
      label: 'Arts and Humanities',
      courses: 3,
      semesterUnits: 9,
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
      semesterUnits: 6,
      from: ['4', '4A', '4B', '4C', '4D', '4E', '4F', '4G', '4H', '4I', '4J'],
      caveat: 'from two academic disciplines',
    },
    {
      id: '5',
      label: 'Physical and Biological Sciences',
      courses: 2,
      // Seven, not six: one of the two courses carries a laboratory.
      semesterUnits: 7,
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
      // Proficiency rather than units, so it adds nothing to the total.
      semesterUnits: 0,
      from: ['6A'],
      onlyFor: 'UC',
      notCoursework:
        'Satisfied by proficiency equivalent to two years of high school study in the same language, which a course is only one way to show.',
    },
    { id: '7', label: 'Ethnic Studies', courses: 1, semesterUnits: 3, from: ['7'] },
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
  labArea: 'B3',
  dualCertify: {
    note: 'The laboratory is associated with one of the Area B science courses rather than being a course of its own.',
    areas: ['B3'],
  },
  // Clause (a)(2) again. Three of these are whole areas of this pattern; the
  // fourth, B4, is a subarea inside Area B, which is why the gate is stated in
  // ASSIST area codes rather than in this pattern's own area ids.
  csuGate: {
    clause:
      'For admission prior to the fall term 2025 or for those who remain in attendance as defined by 5 CCR Section 40401 has completed with a grade of C- or better: courses in written communication in the English language; oral communication in the English language; critical thinking, and mathematics or quantitative reasoning at a level satisfying general education requirements.',
    items: [
      { id: 'composition', label: 'Written communication in the English language', code: 'A2' },
      { id: 'oral', label: 'Oral communication in the English language', code: 'A1' },
      { id: 'critical', label: 'Critical thinking', code: 'A3' },
      { id: 'math', label: 'Mathematics or quantitative reasoning', code: 'B4' },
    ],
  },
  areas: [
    { id: 'A1', label: 'Oral Communication', courses: 1, semesterUnits: 3, from: ['A1'] },
    { id: 'A2', label: 'Written Communication', courses: 1, semesterUnits: 3, from: ['A2'] },
    { id: 'A3', label: 'Critical Thinking', courses: 1, semesterUnits: 3, from: ['A3'] },
    {
      id: 'B',
      label: 'Scientific Inquiry and Quantitative Reasoning',
      courses: 3,
      semesterUnits: 9,
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
      semesterUnits: 9,
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
      semesterUnits: 9,
      from: ['D', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'],
      caveat: 'from at least two different disciplines',
    },
    { id: 'E', label: 'Lifelong Learning and Self-Development', courses: 1, semesterUnits: 3, from: ['E'] },
    { id: 'F', label: 'Ethnic Studies', courses: 1, semesterUnits: 3, from: ['F'] },
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
// Totals are summed from the areas that actually apply, rather than written
// down beside them, because IGETC asks different things of a UC-bound student
// and a CSU-bound one and a single number would be wrong for one of them.
export const totalCourses = (areas: AreaRule[]): number =>
  areas.reduce((sum, a) => sum + (a.notCoursework ? 0 : a.courses), 0);

export const totalSemesterUnits = (areas: AreaRule[]): number =>
  areas.reduce((sum, a) => sum + a.semesterUnits, 0);

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

// ------------------------------------------------- which pattern applies
//
// Cal-GETC's "use ... began Fall 2025 of the 2025-26 Academic Year"
// (Cal-GETC Standards 1.4, section 1.2), and ASSIST publishes no Cal-GETC
// list for an earlier catalog year: 2024-2025 comes back with zero courses.
// The same document says students with catalog rights before then "will be
// able to maintain their use of their CSU GE Breadth or IGETC pattern", and
// ASSIST does still publish both for current years, because those students
// are still transferring.
export const CALGETC_FIRST_YEAR = 2025;

// Catalog years are labelled "2025-2026", so the year it begins is the first
// four characters.
export function startYearOf(yearLabel: string): number | null {
  const year = Number(yearLabel.slice(0, 4));
  return Number.isInteger(year) && year > 1900 ? year : null;
}

export function availableIn(pattern: Pattern, yearLabel: string): boolean {
  if (pattern.key !== 'CALGETC') return true;
  const start = startYearOf(yearLabel);
  return start === null || start >= CALGETC_FIRST_YEAR;
}

// The pattern a student on this catalog year would normally be certified in.
// IGETC rather than CSU GE-Breadth for the older years, because IGETC is
// accepted by every CSU as well as the UCs, so it is the choice that stays
// right if they change their mind about where they are going.
export function defaultPatternFor(yearLabel: string): PatternKey {
  const start = startYearOf(yearLabel);
  return start !== null && start >= CALGETC_FIRST_YEAR ? 'CALGETC' : 'IGETC';
}

// Why that pattern, in a sentence, because a choice made for you should say
// what it was made from.
export function whyPattern(key: PatternKey, yearLabel: string): string {
  const start = startYearOf(yearLabel);
  const isDefault = key === defaultPatternFor(yearLabel);

  if (!isDefault) return 'You chose this one.';

  if (key === 'CALGETC') {
    return `Cal-GETC is the pattern for ${yearLabel}: it replaced the other two from Fall 2025.`;
  }
  return `Cal-GETC did not exist for ${yearLabel}${
    start === null ? '' : `, it began in Fall ${CALGETC_FIRST_YEAR}`
  }. Students with catalog rights before then are certified in IGETC or CSU GE-Breadth.`;
}
