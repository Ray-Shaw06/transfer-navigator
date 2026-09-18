// Reading course codes out of a requisite written as prose.
//
// Shared by every catalog reader, because every platform ends up needing it:
// CourseLeaf colleges that do not link their courses, and eLumen, which
// links nothing and writes "Prerequisite: (BIO 010 or BIO 011) and (CHM 001A
// or CHM 001AH) and Intermediate Algebra skills" as a sentence.

// The requisite's own sentence, before any code is taken from it. The line it
// sits in can continue into other fields, "Cal-GETC: 5A,5C District GE: 5A,5C
// Advisory Level: Read: 3", and reading codes out of THAT would invent
// prerequisites from a general education listing. The sentence ends at the
// first full stop or at the next "Label:" that starts a different field.
const SENTENCE = /^([^.]*?)(?=\s+[A-Z][A-Za-z-]*(?:\s+[A-Za-z-]+)?:|\.|$)/;

// A course code as a college writes one: a subject, then a number, then an
// optional sequence letter. Anchored on a word boundary at both ends so
// "Read: 3" and a bare "5A" cannot match.
//
// The subject is ONE word. Sending-side codes at California community
// colleges are one token before the number in every college read so far, and
// allowing two let the word before a code be absorbed into it: "BIOLOGY BIO
// 110", "REQUISITE BIO 100", and "C-ID ENGL 100" read as "ID ENGL 100". The
// cost is a two-word subject such as the Los Angeles district's "CO SCI 101",
// which would read as "SCI 101" and then match nothing, which is the safe
// direction.
//
// The first word is at least two letters. No college has a one-letter
// subject, and without the floor a course title ending in a Roman numeral
// leaks into the code after it: "Calculus I MATH-192" as subject "I MATH".
//
// The subject may be in Title case, because College of Marin writes
// "Prerequisites: Math 121." That admits ordinary capitalised words followed
// by a number, "Fall 2025" and "Grade 12", so those are refused by name
// below.
//
// The number may carry a letter in front, which is how the Kern district
// writes MATH P101 and the statewide common numbering writes ENGL C1000, and
// may run to four digits, since College of the Siskiyous numbers courses
// MFG 1020.
const CODE = /(?<!-)\b([A-Z][A-Za-z&]{1,9})[ -]?([A-Z]?\d{1,4}[A-Z]{0,2})\b/g;

// Things that pass the pattern above and are not courses.
//
// AB 705 and AB 1705 are the assembly bills that govern placement in
// California, and "placement based on AB705 mandates" is in half the
// prerequisite lines in the state. The rest are the capitalised words a
// prerequisite sentence, or the outcomes list that sometimes runs into it,
// actually contains next to a number. A real subject called AB or SB would be
// lost here; losing one is the safe direction, since a prerequisite missed
// falls back to reading course numbers and says so, while a prerequisite
// invented would order a plan around a bill.
const NOT_A_COURSE =
  /^(AB|SB|ACR|SCR|Fall|Spring|Summer|Winter|Effective|Grade|Grades|Chapter|Unit|Units|Section|Level|Tier|Area|Areas|Part|Phase|Step|Group|Page|Room|Building|Age|Within|Past|Minimum|Maximum|Score|Scores|Since|Before|After|Through|Prior|Last|Next|Year|Years|Semester|Quarter|Term|Version|Series|Option|Track|Pathway|Plan|Form|Code|Title|Column|Row|Table|Figure|Item|Number|No|Outcome|Outcomes|Objective|Objectives|Rationale|Requisite|Requisites|Prerequisite|Prerequisites|Corequisite|Corequisites|Advisory|Advisories)$/i;

// A C-ID number is a statewide descriptor a course is equivalent to, not a
// course a student takes, and colleges cite it right inside the requisite
// line: "ENGL C1000 (C-ID ENGL 100)". Removed before codes are read.
const C_ID = /\bC-ID:?\s*[A-Z]{2,10}\s*\d{1,4}[A-Z]{0,2}\b/g;

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#160;|&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[   ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Every code named in the requisite sentence at the start of `text`, in the
// order written. Alternatives are not resolved: a student holds one side of
// an either/or and never both, so requiring whichever of them is in the plan
// to come first is the same answer with none of the parsing.
export function codesFromText(text: string): string[] {
  const sentence = (SENTENCE.exec(text)?.[1] ?? text).replace(C_ID, ' ');
  return [...sentence.matchAll(CODE)]
    .filter((m) => !NOT_A_COURSE.test(m[1]))
    .map((m) => `${m[1].toUpperCase()} ${m[2]}`);
}

// "Formerly ECON 1B", however a catalog writes it: Foothill labels it on its
// own line, Victor Valley writes it into the last sentence of the description,
// Antelope Valley follows it with a C-ID in brackets, Diablo Valley writes
// "Formerly ECON-221 (26-27)", Mission and San Jose City "formerly known as
// ECN 001B", Modesto "Formerly listed as ECON 102", Marin "formerly ECON 102,
// AA/AS Area B". Only the code right after the phrase is taken.
const FORMERLY =
  /\b[Ff]ormerly(?::|\s+known\s+as|\s+listed\s+as|\s+called|\s+numbered)?\s*([A-Z][A-Za-z&]{1,9}[ -]?[A-Z]?\d{1,4}[A-Z]{0,2})\b/g;

export function formerlyCodes(text: string): string[] {
  return [...text.matchAll(FORMERLY)].map((m) => m[1].toUpperCase().replace('-', ' '));
}

// Whether a requisite line says placement can stand in for the courses it
// names. Colleges phrase it many ways and all of them contain one of these.
const PLACEMENT = /\b(placement|assessment|multiple measures|equivalent skills|appropriate score)\b/i;

export const offersPlacement = (text: string): boolean => PLACEMENT.test(text);

// Units, where a catalog states them on the course, in either order: "3 unit",
// "4.0 Units", "5 Units", or Sierra's "Units: 4". The first such figure on the
// page is the course's own.
const UNITS_AFTER = /\b(\d{1,2}(?:\.\d)?)\s*[Uu]nits?\b/;
const UNITS_BEFORE = /\b[Uu]nits?:\s*(\d{1,2}(?:\.\d)?)\b/;

export function unitsFromText(text: string): number | undefined {
  const after = UNITS_AFTER.exec(text);
  const before = UNITS_BEFORE.exec(text);
  const first = [after, before]
    .filter((m): m is RegExpExecArray => m !== null)
    .sort((a, b) => a.index - b.index)[0];
  return first ? Number(first[1]) : undefined;
}
