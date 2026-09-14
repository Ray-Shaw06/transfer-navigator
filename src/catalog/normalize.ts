// One spelling for a course code, so a catalog and an agreement can be
// compared.
//
// The two do not write codes the same way. ASSIST prints MATH 005A where a
// catalog link may carry MATH 5A, and a catalog's own prose uses a
// non-breaking space between subject and number. Padding and spacing are the
// only differences seen, so both are removed rather than guessed at.
export function normalizeCourseCode(code: string): string {
  return code
    // A catalog writes CS&#160;003A. Unicode spaces have to go before the
    // split, or the subject and number never separate.
    .replace(/[   ]/g, ' ')
    .trim()
    .toUpperCase()
    // A hyphen between subject and number is a separator like any other:
    // Mt. San Jacinto writes MATH-105 where ASSIST prints MATH 105.
    .replace(/^([A-Z&\s]+?)-(?=\d)/, '$1 ')
    // No separator at all is a separator too: Contra Costa's MATH120 is
    // ASSIST's MATH 120. Only when the code has no space anywhere, so
    // ENGL C1000 is left as the two words it is.
    .replace(/^([A-Z&]+)(\d)/, (m, subject, digit) => (m.includes(' ') ? m : `${subject} ${digit}`))
    .replace(/\s+/g, ' ')
    // Drop leading zeros from the numeric part: MATH 005A and MATH 5A are one
    // course. The letters after it are kept, since they are the sequence.
    .replace(/(^|[^0-9])0+(\d)/g, '$1$2');
}

// The spellings a catalog might answer to, best first.
//
// A CourseLeaf catalog answers only to its own spelling and nothing else,
// and colleges disagree about all of it: Pasadena writes MATH 005A, Foothill
// MATH 12, Mt. San Jacinto MATH-105 with a hyphen. ASSIST prints whichever
// its college uses, and for Mt. San Jacinto prints "BIOL- 150", hyphen AND
// space, which no catalog answers to. So the code is taken apart into subject
// and number first, and every joining of the two is tried: as given, padded to
// three digits, unpadded, with a space, with a hyphen, with nothing.
//
// An honours section comes last, as its base course. BIOL A282H is a section
// of BIOL A282 with the same prerequisites, and most catalogs do not list the
// H as a course of its own.
export function catalogSpellings(code: string): string[] {
  const given = code.replace(/[\u00a0\u2007\u202f]/g, ' ').trim().replace(/\s+/g, ' ');

  const out: string[] = [];
  const add = (candidate: string) => {
    if (candidate && !out.includes(candidate)) out.push(candidate);
  };

  add(given);

  // Subject, then the number with whatever letters ride on it. The separator
  // between them, if any, is discarded and re-chosen below.
  const parts = /^([A-Za-z&]+(?:[ -][A-Za-z&]+)*?)[\s-]*([A-Za-z]?\d+[A-Za-z]*)$/.exec(given);
  if (!parts) return out;
  const [, subject, number] = parts;
  const unpadded = number.replace(/^([A-Za-z]?)0+(\d)/, '$1$2');
  const padded = number.replace(/^([A-Za-z]?)(\d{1,2})(?=[A-Za-z]*$)/, (_, letter, digits) =>
    `${letter}${String(digits).padStart(3, '0')}`,
  );

  for (const n of [number, padded, unpadded]) {
    add(`${subject} ${n}`);
    add(`${subject}-${n}`);
    add(`${subject}${n}`);
  }

  // The base course of an honours section.
  if (/\d[A-Za-z]*H$/i.test(number)) {
    for (const spelling of catalogSpellings(`${subject} ${number.replace(/H$/i, '')}`)) add(spelling);
  }

  return out;
}

// The spelling a student sees on their college's own schedule of classes, and
// the one ASSIST prints: a three-digit course number, MATH 005A rather than
// MATH 5A. Used wherever a code read out of a catalog is shown beside one read
// out of an agreement, so the two do not look like different courses.
export function padCourseCode(code: string): string {
  return code
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(^|\s)(\d{1,2})(?=[A-Za-z]*$)/, (_, lead, digits) =>
      `${lead}${String(digits).padStart(3, '0')}`,
    );
}

// The one spelling every comparison uses.
//
// Colleges and ASSIST disagree not only about padding but about spacing, and
// eLumen templates drop spaces inside a code altogether: Solano's own catalog
// writes PSYCC1000 where ASSIST prints PSYC C1000, and Porterville's MATHP100
// is ASSIST's MATH P100. Where a space falls inside a code cannot be recovered
// without knowing the subject, so the key simply has none. Every map, set and
// membership test in the planner and the catalog client goes through this;
// normalizeCourseCode is kept for what is shown to a student.
export function canonicalCourseKey(code: string): string {
  return normalizeCourseCode(code).replace(/[\s-]+/g, '');
}

// Whether two codes name one course, counting an honours section as the same
// course as its base. MATH 005BH is a section of MATH 005B: the same material
// with more of it, the same prerequisites, and no more a prerequisite for
// MATH 005B than MATH 005B is for itself.
export function sameCourse(a: string, b: string): boolean {
  const strip = (code: string) => canonicalCourseKey(code).replace(/H$/, '');
  return strip(a) === strip(b);
}
