import { extractItems } from './extract';
import { splitColumns } from './columns';
import { assembleLines } from './lines';
import { parseLine } from './course';
import { bandRows, type RawRow } from './rows';
import { parseRequirement, type Requirement } from './groups';
import type { Course } from './types';

export type ArticulationRow = { receiving: Course[]; sending: Requirement };
export type Agreement = {
  academicYear: string;
  major: string;
  receivingInstitution: string;
  sendingInstitution: string;
  rows: ArticulationRow[];
};

// The line right after a marker line was a guess about the print layout.
// On the real page 1, "To:" and the institution name are one text item, for
// example "To: University of California, Irvine", with the catalog term on
// the line below it. So the fix is to strip the prefix from the matching
// line itself rather than read the line that follows it.
function afterPrefix(lines: string[], marker: RegExp): string {
  const line = lines.find((l) => marker.test(l));
  return line ? line.replace(marker, '').trim() : '';
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
function groupReceivingRows(rawRows: RawRow[]): RawRow[] {
  const merged: RawRow[] = [];
  let i = 0;

  while (i < rawRows.length) {
    const anchor = parseLine(rawRows[i].receiving[0]);
    if (anchor.kind !== 'course') {
      merged.push(rawRows[i]);
      i += 1;
      continue;
    }

    const group: RawRow = { receiving: [...rawRows[i].receiving], sending: [...rawRows[i].sending] };
    let j = i + 1;
    while (j + 1 < rawRows.length) {
      const connector = parseLine(rawRows[j].receiving[0]);
      const next = parseLine(rawRows[j + 1].receiving[0]);
      if (connector.kind === 'connector' && connector.connector === 'AND' && next.kind === 'course') {
        group.receiving.push(...rawRows[j].receiving, ...rawRows[j + 1].receiving);
        group.sending.push(...rawRows[j].sending, ...rawRows[j + 1].sending);
        j += 2;
      } else {
        break;
      }
    }
    merged.push(group);
    i = j;
  }

  return merged;
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
  const rows = groupReceivingRows(rawRows)
    .map((raw) => {
      const courses = raw.receiving
        .map(parseLine)
        .filter((p): p is { kind: 'course'; course: Course } => p.kind === 'course')
        .map((p) => p.course);
      return { receiving: courses, sending: parseRequirement(raw.sending) };
    })
    .filter((row) => row.receiving.length > 0);

  return {
    academicYear: year ? year[1] : '',
    major: majorLine.trim(),
    receivingInstitution: afterPrefix(leftHeaderLines, /^To:\s*/),
    sendingInstitution: afterPrefix(rightHeaderLines, /^From:\s*/),
    rows,
  };
}
