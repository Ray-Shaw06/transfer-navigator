import { describe, it, expect } from 'vitest';
import rows from '../fixtures/pcc-fall-2026-sample.json';
import { normalizePcc, type PccRow } from '../../src/schedule/pcc';
import { conflicts, pickSchedule } from '../../src/schedule/pick';
import type { Section } from '../../src/schedule/types';

const sections = normalizePcc(rows as unknown as PccRow[]);

const section = (over: Partial<Section>): Section => ({
  crn: '1',
  course: 'CS 002',
  title: 'T',
  units: 4,
  instructor: null,
  campus: 'Colorado Campus',
  mode: 'in-person',
  meetings: [{ days: ['M', 'W'], start: 480, end: 565 }],
  startDate: '2026-08-24',
  endDate: '2026-12-13',
  termPart: 'Full Term',
  seatsOpen: 5,
  waitlistCount: 0,
  ...over,
});

describe('PCC normalizer, on real Fall 2026 rows', () => {
  it('collapses duplicate rows to one section per CRN', () => {
    const crns = sections.map((s) => s.crn);
    expect(new Set(crns).size).toBe(crns.length);
  });

  it('reads days and times: CRN 76636 is CS 002, M/W 8:00 to 9:25', () => {
    const s = sections.find((x) => x.crn === '76636')!;
    expect(s.course).toBe('CS 002');
    expect(s.instructor).toBe('Zareh Gorjian');
    expect(s.meetings).toContainEqual({ days: ['M', 'W'], start: 480, end: 565 });
  });

  it('maps Thursday from thuDay to R', () => {
    const s = sections.find((x) => x.crn === '76602')!;
    expect(s.meetings[0].days).toEqual(['T', 'R']);
    expect(s.termPart).toBe('8 Week first session');
  });

  it('never reports negative seats for an overfull section', () => {
    expect(sections.find((x) => x.crn === '76636')!.seatsOpen).toBe(0);
    expect(sections.every((s) => s.seatsOpen >= 0)).toBe(true);
  });

  it('drops sections flagged R or X, as the college page does', () => {
    const hidden = (rows as unknown as PccRow[]).filter((r) => r.fwSectOpenInd === 'X' || r.fwSectOpenInd === 'R');
    const shown = new Set(sections.map((s) => s.crn));
    expect(hidden.every((r) => !shown.has(r.crn))).toBe(true);
  });
});

describe('conflicts', () => {
  it('overlapping times on a shared day clash', () => {
    const a = section({});
    const b = section({ meetings: [{ days: ['W'], start: 540, end: 600 }] });
    expect(conflicts(a, b)).toBe(true);
  });

  it('back to back is not a clash', () => {
    const a = section({});
    const b = section({ meetings: [{ days: ['M'], start: 565, end: 620 }] });
    expect(conflicts(a, b)).toBe(false);
  });

  it('same hour in two eight-week sessions that never overlap is not a clash', () => {
    const a = section({ endDate: '2026-10-16' });
    const b = section({ startDate: '2026-10-19' });
    expect(conflicts(a, b)).toBe(false);
  });
});

describe('pickSchedule', () => {
  it('places every course with no overlap on real sections', () => {
    const { picks, unplaced } = pickSchedule(['CS 002', 'MATH 005A'], sections);
    expect(unplaced).toEqual([]);
    expect(picks).toHaveLength(2);
    expect(conflicts(picks[0].section, picks[1].section)).toBe(false);
  });

  it('prefers a section with open seats', () => {
    const full = section({ crn: 'full', seatsOpen: 0 });
    const open = section({ crn: 'open', seatsOpen: 9 });
    expect(pickSchedule(['CS 002'], [full, open]).picks[0].section.crn).toBe('open');
  });

  it('honours a no-morning limit', () => {
    const early = section({ crn: 'early' });
    const late = section({ crn: 'late', meetings: [{ days: ['M', 'W'], start: 780, end: 865 }] });
    const result = pickSchedule(['CS 002'], [early, late], { earliest: 600 });
    expect(result.picks[0].section.crn).toBe('late');
  });

  it('says why a course could not be placed', () => {
    const only = section({ crn: 'a', course: 'CS 002' });
    const clash = section({ crn: 'b', course: 'MATH 005A' });
    const none = pickSchedule(['CS 002', 'MATH 005A', 'CS 003B'], [only, clash]);
    expect(none.unplaced.find((u) => u.course === 'CS 003B')?.reason).toBe('no-sections');
    expect(none.unplaced.find((u) => u.course === 'MATH 005A' || u.course === 'CS 002')?.reason).toBe('conflict');

    const limited = pickSchedule(['CS 002'], [only], { allowInPerson: false });
    expect(limited.unplaced[0].reason).toBe('preferences');
  });

  it('matches codes the way the planner does, ignoring spacing and zero padding', () => {
    const s = section({ course: 'CS 003B' });
    expect(pickSchedule(['CS 3B'], [s]).picks).toHaveLength(1);
  });
});
