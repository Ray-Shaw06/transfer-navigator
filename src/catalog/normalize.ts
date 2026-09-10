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
    .replace(/\s+/g, ' ')
    // Drop leading zeros from the numeric part: MATH 005A and MATH 5A are one
    // course. The letters after it are kept, since they are the sequence.
    .replace(/(^|[^0-9])0+(\d)/g, '$1$2');
}

// The spellings a catalog might answer to, best first.
//
// A CourseLeaf catalog answers only to its own spelling and nothing else:
// asking it for CS 3A returns an empty document where CS 003A returns the
// course. ASSIST happens to pad the same way, so the code as given is tried
// first, and a three-digit padded form after it for any caller that does not.
export function catalogSpellings(code: string): string[] {
  const given = code.replace(/[\u00a0\u2007\u202f]/g, ' ').trim().replace(/\s+/g, ' ');

  const out = [given];
  const add = (candidate: string) => {
    if (candidate && !out.includes(candidate)) out.push(candidate);
  };

  // Padded and unpadded both, because colleges disagree: Pasadena writes
  // MATH 005A and Foothill writes MATH 12, and ASSIST prints whichever its
  // college uses.
  add(padCourseCode(given));
  add(given.replace(/(^|[^0-9])0+(\d)/g, '$1$2'));
  // Mt. San Jacinto separates subject from number with a hyphen, MATH-105.
  add(given.replace(' ', '-'));
  add(padCourseCode(given).replace(' ', '-'));

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
