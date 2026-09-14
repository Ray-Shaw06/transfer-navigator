// California's common course numbers, by subject.
//
// Under AB 1111 the community colleges are renumbering their most-taken
// courses to one statewide code each, and the first ones landed in the
// 2025-26 catalogs: ECON 1B at Foothill became ECON C2001, ECON 102 at Victor
// Valley became ECON C2001 too. The articulation agreements on ASSIST lag the
// catalogs by a year, so a plan asks for the old code, the catalog answers
// only to the new one, and the new course says "Formerly ECON 1B" in its
// description. This is the list of new codes worth trying when an old one
// answers nothing.
//
// Read off Foothill's own common-course-numbering page and checked against
// Contra Costa's catalog for the mathematics pair, both in September 2026.
// It grows as the state adds phases; a subject not here just has no bridge
// yet, which costs a student nothing but the fallback to course numbers.
export const STATEWIDE: Record<string, string[]> = {
  COMM: ['C1000'],
  ECON: ['C2001', 'C2002'],
  ENGL: ['C1000', 'C1001', 'C1002', 'C1003'],
  MATH: ['C2210', 'C2220'],
  POLS: ['C1000'],
  PSYC: ['C1000'],
  STAT: ['C1000'],
};

// Colleges spell a subject their own way and the statewide code keeps the
// statewide subject: Mission's ECN 001A is ECON C2001 there, and political
// science is POLSC or POLI at a few colleges.
const SUBJECT_ALIASES: Record<string, string> = {
  ECN: 'ECON',
  POLSC: 'POLS',
  POLI: 'POLS',
  POL: 'POLS',
  PSY: 'PSYC',
  PSYCH: 'PSYC',
  STATS: 'STAT',
  ENG: 'ENGL',
  ENGLISH: 'ENGL',
  MTH: 'MATH',
  COMS: 'COMM',
  SPCH: 'COMM',
  SPEECH: 'COMM',
};

// The statewide codes a college might now list an old code under.
export function statewideCandidates(code: string): string[] {
  const subject = code.trim().split(/[\s-]/)[0].toUpperCase();
  const canonical = SUBJECT_ALIASES[subject] ?? subject;
  return (STATEWIDE[canonical] ?? []).map((n) => `${canonical} ${n}`);
}
