import { describe, it, expect } from 'vitest';
import { makePdf, recv, send, type Page } from '../fixtures/pdf';
import { parseAgreement } from '../../src/parser/document';
import { buildPlan } from '../../src/planner/plan';

// The parser's end-to-end gate, running in CI.
//
// Eight tests check the parser against a real ASSIST agreement, and all eight
// are gitignored and skip everywhere but a machine that happens to have the
// PDF. CI was therefore going green having never once run a PDF through
// pdfjs. This fixture closes that: invented institutions and invented course
// codes, so it is safe to commit, laid out the way an agreement is laid out,
// so the whole pipeline runs.
//
// It deliberately carries the shapes that have caused real bugs in this
// project: a receiving-side AND that is one requirement rather than three, a
// cell with nothing articulated, a numbered choose-at-least section, a
// receiving-side OR that is two routes through one requirement, and a section
// that begins on one page and ends on the next.

const page1: Page = [
  recv('To: Example University', 720),
  recv('Effective during the 2025-2026 academic year', 700),
  recv('Widgetry, B.S.', 680),
  recv('IMPORTANT MAJOR INFORMATION', 660),
  recv('Admission is competitive. Grades of C or better are required.', 640),
  send('From: Example College', 720),
];

const page2: Page = [
  recv('REQUIRED FOR ADMISSION', 720),
  // One requirement spanning three receiving courses, joined by AND.
  recv('RECV 31 Introduction to Widgets 4.00', 660),
  send('SEND 001 Widget Basics 3.00', 660),
  recv('AND', 600),
  recv('RECV 32 Advanced Widgets 4.00', 540),
  send('SEND 002 Advanced Widgets 3.00', 540),
  // Nothing at the sending college satisfies this one.
  recv('RECV 40 Widget Theory 4.00', 480),
  send('No Course Articulated', 480),
  recv('2 Complete at least 1 course from the following', 420),
  recv('RECV 50 Widget Design 4.00', 360),
  send('SEND 010 Design Fundamentals 3.00', 360),
  recv('RECV 51 Widget Systems 4.00', 300),
  send('SEND 011 Systems One 3.00', 300),
];

// A section that starts on a new page, with two routes through one
// requirement. Both the page break and the receiving OR have broken before.
const page3: Page = [
  recv('3 Select A or B', 720),
  recv('RECV 60 Widget Algebra 4.00', 660),
  send('No Course Articulated', 660),
  recv('OR', 600),
  recv('RECV 61 Linear Widgets 4.00', 540),
  send('SEND 020 Linear Methods 4.00', 540),
];

const agreement = () => parseAgreement(makePdf([page1, page2, page3]));

describe('parseAgreement over a committed synthetic agreement', () => {
  it('reads the header off page one', async () => {
    const a = await agreement();
    expect(a.major).toBe('Widgetry, B.S.');
    expect(a.academicYear).toBe('2025-2026');
    expect(a.receivingInstitution).toBe('Example University');
    expect(a.sendingInstitution).toBe('Example College');
  });

  it('keeps the campus advisory text and drops the boilerplate above it', async () => {
    const a = await agreement();
    expect(a.notes).toEqual(['Admission is competitive. Grades of C or better are required.']);
  });

  it('reads an AND-joined pair as one requirement, not two', async () => {
    const a = await agreement();
    const row = a.rows[0];
    expect(row.receiving.map((c) => c.code)).toEqual(['RECV 31', 'RECV 32']);
    expect(row.sending.kind).toBe('options');
    if (row.sending.kind !== 'options') return;
    expect(row.sending.options).toHaveLength(1);
    expect(row.sending.options[0].courses.map((c) => c.code)).toEqual(['SEND 001', 'SEND 002']);
  });

  it('marks the cell with nothing articulated', async () => {
    const a = await agreement();
    const blocked = a.rows.filter((r) => r.sending.kind === 'not_articulated');
    expect(blocked.flatMap((r) => r.receiving.map((c) => c.code))).toEqual(['RECV 40', 'RECV 60']);
  });

  it('leaves no requirement unreadable', async () => {
    const a = await agreement();
    expect(a.rows.filter((r) => r.sending.kind === 'unreadable')).toEqual([]);
  });

  it('reads the numbered choose-at-least section', async () => {
    const a = await agreement();
    const choose = a.sections.find((s) => s.rule.kind === 'choose');
    expect(choose?.label).toBe('Complete at least 1 course from the following');
    expect(choose?.rule).toEqual({ kind: 'choose', least: 1 });
  });

  it('groups the two routes of a receiving OR, across a page break', async () => {
    const a = await agreement();
    const grouped = a.rows.filter((r) => r.orGroup !== undefined);
    expect(grouped.map((r) => r.receiving[0].code)).toEqual(['RECV 60', 'RECV 61']);
    expect(new Set(grouped.map((r) => r.orGroup)).size).toBe(1);
  });

  it('tags every row with a section that exists', async () => {
    const a = await agreement();
    for (const row of a.rows) {
      expect(row.section).toBeDefined();
      expect(a.sections[row.section!]).toBeDefined();
    }
  });

  it('plans without counting a route it did not take or a section it need not finish', async () => {
    const a = await agreement();
    const plan = buildPlan(a, []);

    // 6 units for the AND pair, 3 for the cheaper of the two choose-one
    // options, 4 for the only achievable route through the OR group.
    expect(plan.remainingUnits).toBe(13);
    // RECV 60 has nothing articulated but its sibling route is open, so it is
    // an alternative rather than a blocker a student must somehow obtain.
    expect(plan.notArticulated.map((c) => c.code)).toEqual(['RECV 40']);
  });
});
