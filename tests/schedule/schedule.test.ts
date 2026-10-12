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

import { alternatives, scoreSection } from '../../src/schedule/pick';
import { matchTeacher, type Candidate } from '../../src/schedule/rmp';

describe('professor and time ranking', () => {
  const great = section({ crn: 'great', instructor: 'A Good', meetings: [{ days: ['M', 'W'], start: 480, end: 565 }] });
  const poor = section({ crn: 'poor', instructor: 'B Poor', meetings: [{ days: ['M', 'W'], start: 780, end: 865 }] });
  const ratings = { 'A Good': 4.8, 'B Poor': 1.7 };

  it('prefers the better-rated instructor when professor weight is high', () => {
    const r = pickSchedule(['CS 002'], [poor, great], { ratings, professorWeight: 1 });
    expect(r.picks[0].section.crn).toBe('great');
  });

  it('prefers the section in the preferred window when time weight is high', () => {
    const neutral = { professorWeight: 0, preferredStart: 720, preferredEnd: 1020 };
    const r = pickSchedule(['CS 002'], [great, poor], neutral);
    expect(r.picks[0].section.crn).toBe('poor');
  });

  it('never lets a rating beat an open seat over a full section', () => {
    const fullGreat = { ...great, seatsOpen: 0, waitlistCount: 12 };
    const openPoor = { ...poor, seatsOpen: 8 };
    const prefs = { ratings, professorWeight: 1 };
    expect(scoreSection(openPoor, prefs)).toBeGreaterThan(scoreSection(fullGreat, prefs));
  });

  it('treats an unrated instructor as neutral, not as bad', () => {
    const a = section({ instructor: 'Unrated' });
    const b = section({ instructor: null });
    expect(scoreSection(a, { ratings })).toBe(scoreSection(b, { ratings }));
  });
});

describe('alternatives', () => {
  it('offers other sections that fit around the rest of the schedule, best first', () => {
    const cs = section({ crn: 'cs1', course: 'CS 002', meetings: [{ days: ['M'], start: 480, end: 565 }] });
    const math = section({ crn: 'm1', course: 'MATH 005A', meetings: [{ days: ['T'], start: 480, end: 565 }] });
    const csAlt = section({ crn: 'cs2', course: 'CS 002', meetings: [{ days: ['W'], start: 480, end: 565 }] });
    const csClash = section({ crn: 'cs3', course: 'CS 002', meetings: [{ days: ['T'], start: 500, end: 600 }] });
    const all = [cs, math, csAlt, csClash];
    const { picks } = pickSchedule(['CS 002', 'MATH 005A'], all);
    const csPick = picks.find((p) => p.course === 'CS 002')!;
    const alts = alternatives(csPick, picks, all);
    expect(alts.map((s) => s.crn)).not.toContain('cs3');
    expect(alts.map((s) => s.crn)).not.toContain(csPick.section.crn);
  });
});

describe('instructor matching', () => {
  const c = (over: Partial<Candidate>): Candidate => ({
    legacyId: 1, firstName: 'Juan', lastName: 'Leon', department: 'Computer Science',
    avgRating: 1.7, avgDifficulty: 4.1, numRatings: 118, wouldTakeAgainPercent: 16.8, ...over,
  });

  it('matches on first and last name, not on a fuzzy search hit', () => {
    const hits = [c({ firstName: 'Juan', lastName: 'Mendoza', legacyId: 2 }), c({})];
    expect(matchTeacher('Juan Leon', hits)?.url).toContain('/professor/1');
  });

  it('returns nothing rather than a different person', () => {
    expect(matchTeacher('Juan Leon', [c({ lastName: 'Mendoza' })])).toBeNull();
  });

  it('ignores a rating built on too few reviews', () => {
    expect(matchTeacher('Juan Leon', [c({ numRatings: 2 })])).toBeNull();
  });

  it('picks the better-reviewed of two with the same name', () => {
    const hits = [c({ legacyId: 5, numRatings: 4 }), c({ legacyId: 6, numRatings: 90 })];
    expect(matchTeacher('Juan Leon', hits)?.url).toContain('/professor/6');
  });

  it('ignores accents and a middle name', () => {
    const hits = [c({ firstName: 'José', lastName: 'Ortíz', legacyId: 9 })];
    expect(matchTeacher('Jose Luis Ortiz', hits)?.url).toContain('/professor/9');
  });
});

import { titleCase } from '../../src/schedule/pcc';

describe('titles', () => {
  it('title-cases PCC capitals and keeps numerals and languages', () => {
    expect(titleCase('FUNDAMENTALS OF COMPUTER SCIENCE II (C++)')).toBe('Fundamentals of Computer Science II (C++)');
    expect(titleCase('FUNDAMENTALS OF COMPUTER SCIENCE (JAVA) LAB')).toBe('Fundamentals of Computer Science (Java) Lab');
    expect(titleCase('Already Mixed Case')).toBe('Already Mixed Case');
  });
});
