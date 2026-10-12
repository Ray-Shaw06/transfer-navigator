import type { Day, Meeting, Section } from './types';

// Pasadena City College's class search (findclasses.pasadena.edu) is a web app
// over a public JSON API, and this reads the rows it reads. The API is not
// documented, so everything that touches its shape lives here and nowhere else.
//
// A section is not one row. The API returns one row per (section, schedule
// type, meeting), so a lecture-plus-lab section arrives as several rows and an
// online section arrives once per schedule type with no times at all. These
// are collapsed back to one Section per CRN.

export type PccRow = {
  crn: string;
  subjCode: string;
  courseNumbDisplay: string;
  courseTitle: string;
  creditHrLow: string | null;
  schdDesc: string | null;
  campDesc: string | null;
  beginTime: string | null;
  endTime: string | null;
  monDay?: string | null;
  tueDay?: string | null;
  wedDay?: string | null;
  thuDay?: string | null;
  friDay?: string | null;
  satDay?: string | null;
  sunDay?: string | null;
  pfaName: string | null;
  seatsAvail: string | null;
  waitCount?: string | null;
  fwSectOpenInd: string | null;
  ptrmDesc: string | null;
  ptrmStartDate: string | null;
  ptrmEndDate: string | null;
};

// The college's own page drops sections flagged R and X before showing
// anything, so this does too. What the two letters mean is not published.
const HIDDEN = new Set(['R', 'X']);

const DAY_FIELDS: [keyof PccRow, Day][] = [
  ['monDay', 'M'],
  ['tueDay', 'T'],
  ['wedDay', 'W'],
  ['thuDay', 'R'],
  ['friDay', 'F'],
  ['satDay', 'S'],
  ['sunDay', 'U'],
];

// "0830" is 8:30 AM.
function minutes(hhmm: string | null): number | null {
  if (!hhmm || !/^\d{3,4}$/.test(hhmm)) return null;
  const padded = hhmm.padStart(4, '0');
  return Number(padded.slice(0, 2)) * 60 + Number(padded.slice(2));
}

const isoDate = (value: string | null) => (value ? value.slice(0, 10) : null);

const toInt = (value: string | null | undefined) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function normalizePcc(rows: PccRow[]): Section[] {
  const byCrn = new Map<string, PccRow[]>();
  for (const row of rows) {
    if (HIDDEN.has(row.fwSectOpenInd ?? '')) continue;
    const group = byCrn.get(row.crn);
    if (group) group.push(row);
    else byCrn.set(row.crn, [row]);
  }

  const sections: Section[] = [];
  for (const [crn, group] of byCrn) {
    const first = group[0];

    // A meeting is a row with a start, an end and at least one day. The final
    // exam is its own row and is not part of the weekly pattern.
    const seen = new Set<string>();
    const meetings: Meeting[] = [];
    for (const row of group) {
      if (row.schdDesc === 'Final Exam') continue;
      const start = minutes(row.beginTime);
      const end = minutes(row.endTime);
      const days = DAY_FIELDS.filter(([field]) => row[field]).map(([, day]) => day);
      if (start === null || end === null || days.length === 0) continue;
      const key = `${days.join('')}${start}${end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      meetings.push({ days, start, end });
    }

    const online = first.campDesc === 'Fully Online';

    sections.push({
      crn,
      course: `${first.subjCode} ${first.courseNumbDisplay}`,
      title: first.courseTitle,
      units: Number(first.creditHrLow) || 0,
      instructor: first.pfaName,
      campus: first.campDesc ?? '',
      mode: online ? 'online' : meetings.length === 0 ? 'arranged' : 'in-person',
      meetings,
      startDate: isoDate(first.ptrmStartDate),
      endDate: isoDate(first.ptrmEndDate),
      termPart: first.ptrmDesc,
      // Seats can come back negative when a section is over its cap.
      seatsOpen: Math.max(0, toInt(first.seatsAvail)),
      waitlistCount: toInt(first.waitCount),
    });
  }
  return sections;
}
