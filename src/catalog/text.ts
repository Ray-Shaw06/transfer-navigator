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

// A course code as a college writes one: a subject of one to three words in
// capitals, then a number, then an optional sequence letter. Anchored on a
// word boundary at both ends so "Read: 3" and a bare "5A" cannot match.
//
// The separator is optional because eLumen colleges drop it: Contra Costa
// writes "MATH120 - Intermediate Algebra" and Modesto "MATH171". The number
// may also be a letter and four digits, which is how the statewide common
// course numbering writes composition, ENGL C1000.
//
// The first word is at least two letters. No college has a one-letter subject,
// and without the floor a course title ending in a Roman numeral leaks into
// the code after it: "Calculus I MATH-192" read as subject "I MATH".
const CODE =
  /\b([A-Z][A-Z&]{1,9}(?:[ -][A-Z&]{2,9}){0,2})[ -]?(\d{1,3}[A-Z]{0,2}|[A-Z]\d{4})\b/g;

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
  const sentence = SENTENCE.exec(text)?.[1] ?? text;
  return [...sentence.matchAll(CODE)].map((m) => `${m[1]} ${m[2]}`);
}
