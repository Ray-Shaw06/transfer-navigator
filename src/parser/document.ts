import { extractItems } from './extract';
import { splitColumns } from './columns';
import { assembleLines } from './lines';
import { parseLine, type ParsedLine } from './course';
import { bandRows, type RawRow } from './rows';
import { parseRequirement, type Requirement } from './groups';
import { parseSectionHeader, type Section } from './sections';
import type { Course } from './types';

export type ArticulationRow = {
  receiving: Course[];
  sending: Requirement;
  // Rows sharing an orGroup are alternative paths through one requirement,
  // coming from an OR connector in the receiving column. Satisfying any one
  // member satisfies the group. Without this the planner cannot tell "two
  // separate requirements" from "one requirement, two routes", and will tell
  // a student to somehow obtain a course that nothing articulates to when a
  // sibling route is wide open.
  orGroup?: number;
  // Indexes into Agreement.sections. Which section a row belongs to decides
  // whether it is required outright or one of several alternatives under a
  // choose-at-least quantifier; see assignSections below.
  section?: number;
};
export type Agreement = {
  academicYear: string;
  major: string;
  receivingInstitution: string;
  sendingInstitution: string;
  rows: ArticulationRow[];
  sections: Section[];
  // Page 1 advisory prose in the receiving campus's own words: admission
  // competitiveness, minimum grade requirements, sequence-splitting
  // warnings, and the like. None of this has a structure this parser can
  // read (no course codes, no quantifiers), so it is captured verbatim by
  // line rather than interpreted, and nothing downstream (the planner
  // included) ever reads it back in. It exists only to be displayed.
  // Optional on the type only so the hand-built Agreement literals in
  // tests/planner/plan.test.ts, written before this field existed, keep
  // typechecking unchanged; parseAgreement itself always sets it.
  notes?: string[];
};

// Thrown instead of returning an agreement with no rows and no recognisable
// header. Without this, a PDF that is not an agreement (the wrong file, or a
// scan with no text layer) parses cleanly to an empty Agreement, and the page
// reports 0 units remaining and nothing left to schedule: it tells a student
// who has done nothing that they are finished transferring.
export class UnrecognisedAgreementError extends Error {
  constructor() {
    super('That file does not look like an ASSIST articulation agreement.');
    this.name = 'UnrecognisedAgreementError';
  }
}

// The line right after a marker line was a guess about the print layout.
// On the real page 1, "To:" and the institution name are one text item, for
// example "To: University of California, Irvine", with the catalog term on
// the line below it. So the fix is to strip the prefix from the matching
// line itself rather than read the line that follows it.
function afterPrefix(lines: string[], marker: RegExp): string {
  const line = lines.find((l) => marker.test(l));
  return line ? line.replace(marker, '').trim() : '';
}

// The real page 1 has a fixed shape above the receiving column's fold: page
// header, ASSIST's own generic disclaimer, then the year/major/institution
// block, then "IMPORTANT MAJOR INFORMATION" opens the campus's own advisory
// text (competitive admission, minimum grade, sequence-splitting, and so
// on), which runs to the page footer. "IMPORTANT MAJOR INFORMATION" itself
// is the one heading common to every UCI agreement page 1, the same way
// "REQUIRED FOR ADMISSION" is common to every requirements page, so it is
// used here as the start marker the same way that marker is used in
// parseSectionHeader. Everything at or before it (the header fields already
// pulled out above, plus ASSIST's boilerplate) is not this campus's text.
// The footer is a single bare URL, dropped by pattern rather than position
// so this keeps working if a future agreement adds or removes a footer line.
function extractNotes(headerLines: string[]): string[] {
  const start = headerLines.findIndex((l) => /^IMPORTANT MAJOR INFORMATION$/i.test(l.trim()));
  if (start === -1) return [];

  return headerLines
    .slice(start + 1)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^https?:\/\//i.test(l));
}

// A block is a run of receiving anchors joined end to end by an "AND" line
// sitting in the receiving column, for example I&C SCI 31 / AND / I&C SCI 32
// / AND / I&C SCI 33 on the real page 2, three UCI courses that together
// satisfy one combined requirement. bandRows has no notion of this: it bands
// one row per receiving line, so the "AND" line becomes an anchor of its own
// and steals a slice of the sending column that belongs to the group.
//
// Concatenating the receiving and sending lines of every anchor absorbed
// into the run, in the same top to bottom order bandRows already produced
// them in, reassembles the full combined requirement: the receiving line
// filter downstream drops the connector lines from the course list, and the
// sending lines, back in one unbroken sequence, parse as the multi
// alternative requirement they are.
//
// A receiving "OR" is deliberately not absorbed. The real page 5 has I&C SCI
// 6N OR MATH 3A: two independent electives for the same slot, not a combined
// requirement. Merging across it would fold a not-articulated row into a
// row with real options, which is exactly the mixed shape parseRequirement
// treats as unreadable, and it would make I&C SCI 6N vanish as its own
// not-articulated row.
// RawRow.receiving is typed as an array but bandRows always fills it with
// exactly one line; nothing at the type level guarantees that. Reading
// receiving[0] straight up would throw on an empty array instead of falling
// through to the "other" handling every caller below already expects, so
// route every read through here.
function firstAnchor(row: RawRow): ParsedLine {
  return row.receiving.length > 0 ? parseLine(row.receiving[0]) : { kind: 'other', text: '' };
}

type GroupedRow = RawRow & { orGroup?: number };

function groupReceivingRows(rawRows: RawRow[]): GroupedRow[] {
  const merged: GroupedRow[] = [];
  let orGroupCounter = 0;
  // Set right after a group that ends in a receiving-side OR, so the group
  // starting immediately after the (dropped) connector row picks up the same
  // id. A chain of more than two OR-joined anchors keeps re-setting this, so
  // every anchor in the chain lands on one shared id.
  let pendingOrGroup: number | undefined;
  let i = 0;

  while (i < rawRows.length) {
    const anchor = firstAnchor(rawRows[i]);
    if (anchor.kind !== 'course') {
      merged.push(rawRows[i]);
      i += 1;
      continue;
    }

    const group: GroupedRow = { receiving: [...rawRows[i].receiving], sending: [...rawRows[i].sending] };
    let j = i + 1;
    while (j + 1 < rawRows.length) {
      const connector = firstAnchor(rawRows[j]);
      const next = firstAnchor(rawRows[j + 1]);
      if (connector.kind === 'connector' && connector.connector === 'AND' && next.kind === 'course') {
        group.receiving.push(...rawRows[j].receiving, ...rawRows[j + 1].receiving);
        group.sending.push(...rawRows[j].sending, ...rawRows[j + 1].sending);
        j += 2;
      } else {
        break;
      }
    }

    if (pendingOrGroup !== undefined) {
      group.orGroup = pendingOrGroup;
      pendingOrGroup = undefined;
    }

    const trailing = j < rawRows.length ? firstAnchor(rawRows[j]) : { kind: 'other' as const, text: '' };
    if (trailing.kind === 'connector' && trailing.connector === 'OR') {
      const id = group.orGroup ?? ++orGroupCounter;
      group.orGroup = id;
      pendingOrGroup = id;
    }

    merged.push(group);
    i = j;
  }

  return merged;
}

type SectionedRow = GroupedRow & { section: number };

// Everything before the first recognised header belongs to this synthetic
// section: unlabelled, and required like any other row that carries no
// quantifier of its own.
const UNSECTIONED: Section = { label: '', rule: { kind: 'all' } };

// Walks the grouped rows in the document order groupReceivingRows already
// produced them in (page then y, never reordered) and tags each with the
// section open at that point. A line that parses as a section header closes
// the current section and opens a new one instead of being tagged itself;
// it carries no course, so it is dropped by the caller's final filter either
// way.
//
// The real agreement's page 3 has "2 Complete at least 1 course from the
// following" immediately followed by a second "REQUIRED FOR ADMISSION" line
// and then "Minimum grade required: B or better", before any row of the new
// section appears. Read plainly with parseSectionHeader, that second line is
// itself a valid header, all required. Letting it take effect would replace
// the choose-at-least quantifier just opened with "all required" before that
// quantifier ever governed a single row, and the eight requirements on the
// following page would be tagged all-required instead of choose-one:
// exactly the bug Task 12 exists to fix, just moved one line later.
//
// The rule adopted here: a header only takes effect once the section it
// would replace has claimed at least one row (real or not; a page-header
// line counts, since the point is only "something happened before you tried
// to open another section"). The synthetic section 0 is exempt, since it
// never governs a real requirement and must always yield to the first
// header the document has. That lets "REQUIRED FOR ADMISSION" open section 1
// on page 2 with nothing yet under section 0, while the second "REQUIRED FOR
// ADMISSION" on page 3, arriving with nothing yet under section 2, is
// ignored and the choose-at-least section it interrupted stays open.
function assignSections(rows: GroupedRow[]): { rows: SectionedRow[]; sections: Section[] } {
  const sections: Section[] = [UNSECTIONED];
  let current = 0;
  let currentRowCount = 0;

  const tagged = rows.map((row): SectionedRow => {
    const header = parseSectionHeader(row.receiving[0].text);

    if (header && (current === 0 || currentRowCount > 0)) {
      sections.push(header);
      current = sections.length - 1;
      currentRowCount = 0;
      return { ...row, section: current };
    }

    currentRowCount += 1;
    return { ...row, section: current };
  });

  return { rows: tagged, sections };
}

export async function parseAgreement(data: Uint8Array): Promise<Agreement> {
  const items = await extractItems(data);
  const { receiving, sending } = splitColumns(items);

  // The header block's own lines sit as close as 18 to 19.5pt apart on the
  // real page 1, tighter than assembleLines' default 20pt tolerance, so the
  // default merges "Computer Science, B.S." into the same line as the
  // "Effective during the ... academic year" line below it and the major
  // regex stops matching. A tighter tolerance keeps every real header line
  // apart while same-line items, at 0pt apart, still merge.
  //
  // "To: ..." and "From: ..." also sit at the exact same y, one in each
  // column, and assembleLines groups purely by y regardless of column, so
  // run it separately on each column's own page 1 items. Otherwise the two
  // lines merge into one that starts with "To:", and a search for a line
  // starting with "From:" comes up empty.
  const page1Receiving = receiving.filter((item) => item.page === 1);
  const page1Sending = sending.filter((item) => item.page === 1);
  const leftHeaderLines = assembleLines(page1Receiving, 10).map((l) => l.text);
  const rightHeaderLines = assembleLines(page1Sending, 10).map((l) => l.text);
  const headerLines = [...leftHeaderLines, ...rightHeaderLines];

  const year = /Effective during the (\d{4}-\d{4}) academic year/.exec(headerLines.join('\n'));
  const majorLine = leftHeaderLines.find((l) => /,\s*B\.[AS]\.$/.test(l)) ?? '';

  const rawRows = bandRows(assembleLines(receiving), assembleLines(sending));
  const { rows: sectionedRows, sections } = assignSections(groupReceivingRows(rawRows));
  const rows = sectionedRows
    .map((raw) => {
      const courses = raw.receiving
        .map(parseLine)
        .filter((p): p is { kind: 'course'; course: Course } => p.kind === 'course')
        .map((p) => p.course);
      return {
        receiving: courses,
        sending: parseRequirement(raw.sending),
        orGroup: raw.orGroup,
        section: raw.section,
      };
    })
    .filter((row) => row.receiving.length > 0);

  const academicYear = year ? year[1] : '';
  const major = majorLine.trim();

  // No rows, or no year and no major, means nothing usable came out of this
  // PDF. Rather than guess a repair, reject it so the caller can tell the
  // student to check the file instead of showing them an empty plan.
  if (rows.length === 0 || (!academicYear && !major)) {
    throw new UnrecognisedAgreementError();
  }

  return {
    academicYear,
    major,
    receivingInstitution: afterPrefix(leftHeaderLines, /^To:\s*/),
    sendingInstitution: afterPrefix(rightHeaderLines, /^From:\s*/),
    rows,
    sections,
    notes: extractNotes(leftHeaderLines),
  };
}
